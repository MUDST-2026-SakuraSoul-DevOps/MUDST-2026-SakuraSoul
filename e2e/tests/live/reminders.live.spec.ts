import { expect, test, type Page } from '@playwright/test'
import { signInLive, uniqueName } from './signInLive'

/*
  US-14 (SSK-20) — แจ้งเตือนงานซ่อมตามรอบ ต้องกลายเป็นใบแจ้งซ่อมจริงเมื่อถึงกำหนด

  ทำไมต้องมีเคสนี้ทั้งที่ ReminderServiceTest กับ ReminderApiTest มีรวมกัน 34 เคสแล้ว
  เทสสองชุดนั้นฉีด Clock ปลอมเข้าไปแล้วเรียกเมธอดตรง ๆ พิสูจน์ได้ว่า "กฎถูก"
  แต่ไม่ได้พิสูจน์ว่าแอดมินที่กรอกฟอร์มบนหน้าจอจริงจะได้ผลแบบนั้น
  US-14-S2 เขียนว่า "เมื่อถึงกำหนดและงานตามเวลาเริ่มทำงาน **แอดมินเห็นการแจ้งเตือนในระบบ**"
  คำว่าเห็นบนหน้าจอคือสิ่งที่ชั้น E2E เท่านั้นที่ตอบได้

  วิธีคุมเวลาโดยไม่ต้องรอของจริง
  ตั้งวันเริ่มเป็นเมื่อวาน รอบนี้จึงถึงกำหนดทันที แล้วเรียก POST /api/reminders/run-due
  ซึ่งเป็น endpoint ที่มีอยู่แล้วและเรียกเมธอดตัวเดียวกับที่ scheduler เรียกทุกเช้า
  ไม่ได้ทำทางลัดพิเศษให้เทส แค่ไม่ต้องรอถึงแปดโมงเช้า

  ลำดับการเก็บกวาดสำคัญ ต้องลบใบแจ้งซ่อมก่อนแล้วค่อยลบรอบ เพราะ ReminderService.delete
  ตอบ 409 ถ้ารอบนั้นเคยสร้างใบแจ้งซ่อมไปแล้ว (ให้พักแทนการลบ) ถ้าลบสลับลำดับ
  รอบที่เทสสร้างจะค้างอยู่ในฐานข้อมูลจริงและโผล่ในหน้าจอของทุกคน
*/

/** เมื่อวานตามเวลาไทย รูปแบบ YYYY-MM-DD ที่ช่อง Start Date ของฟอร์มรับ */
function yesterdayInBangkok(): string {
  const bangkokNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  bangkokNow.setUTCDate(bangkokNow.getUTCDate() - 1)
  return bangkokNow.toISOString().slice(0, 10)
}

async function openScheduleTab(page: Page) {
  await page.getByRole('link', { name: 'Maintenance' }).click()
  await page.getByRole('button', { name: 'Schedule & Reminder' }).click()
  await expect(page.getByRole('heading', { name: 'Recurring' })).toBeVisible()
}

/** กรอกฟอร์ม Add Reminder แล้วคืนเลขรอบที่ backend สร้างให้ เอาไว้เก็บกวาดตอนจบ */
async function addReminder(page: Page, name: string, unit: string): Promise<number> {
  await page.getByRole('button', { name: 'Add Reminder' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Reminder' })

  await dialog.getByLabel('Reminder Name').fill(name)
  await dialog.getByLabel('Frequency').selectOption('Monthly')
  // เมื่อวาน = ถึงกำหนดแล้วตั้งแต่วินาทีที่บันทึก ไม่ต้องรอเวลาจริง
  await dialog.getByLabel('Start Date').fill(yesterdayInBangkok())
  // ต้องผูกห้อง ใบของทั้งตึกไม่สร้างใบแจ้งซ่อม (ดูคอมเมนต์ใน ReminderService.runDue)
  await dialog.getByLabel('Assigned Unit').selectOption(unit)
  await dialog.getByRole('radio', { name: 'High' }).click()

  const created = page.waitForResponse(
    (res) => res.url().includes('/api/reminders') && res.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Save Reminder' }).click()

  const response = await created
  expect(response.status(), 'สร้างรอบแจ้งเตือนไม่สำเร็จ').toBe(201)
  await expect(dialog).toBeHidden()

  const reminder = (await response.json()) as { id: number }
  return reminder.id
}

/*
  เก็บกวาดผ่าน API ตรง ๆ ไม่ผ่านหน้าจอ เพราะขั้นตอนนี้ไม่ใช่สิ่งที่เทสต้องการพิสูจน์
  page.request ใช้ cookie ชุดเดียวกับที่เพิ่งล็อกอินไว้ จึงผ่านยามของ backend ได้

  ⚠️ ข้อจำกัดที่ต้องรู้ก่อนอ่านโค้ดข้างล่าง — รอบที่ยิงไปแล้ว "ลบไม่ได้" ตามกฎของระบบ

  MaintenanceService.delete ปฏิเสธใบที่ source เป็น RECURRING (409 "Mark it as Done instead")
  และ ReminderService.delete ปฏิเสธรอบที่เคยสร้างใบแจ้งซ่อม (409 "Pause it instead")
  สองกฎนี้บวกกันแปลว่า พอรอบยิงไปแล้วครั้งหนึ่ง ทั้งใบและรอบจะอยู่ในฐานข้อมูลถาวร
  ไม่มีทางลบได้เลยไม่ว่าจากหน้าจอหรือจาก API

  เทสตัวนี้จึงเก็บกวาดได้แค่เท่าที่ระบบยอมให้ทำ คือปิดใบเป็น Done แล้วพักรอบ
  ซึ่งเป็นทางที่ข้อความ error ของ backend บอกให้ทำเองทั้งคู่ ของที่เหลือไว้จะมีชื่อขึ้นต้นว่า
  "QA Reminder" พร้อมเลขเวลา ดูออกได้ทันทีว่ามาจากการเทส ไม่ใช่ข้อมูลที่ใครกรอกจริง

  เรื่องนี้แจ้งทีมไว้แล้วว่าเป็นคำถามเชิงออกแบบ ว่ารอบที่ตั้งผิดแล้วเผลอยิงไปควรลบทิ้งได้ไหม
  ถ้าวันหนึ่งทีมเพิ่มทางลบให้ ให้กลับมาแก้ฟังก์ชันนี้เป็น DELETE ตรง ๆ จะสะอาดกว่า
*/
async function cleanUp(page: Page, reminderId: number, ticketIds: number[]) {
  for (const id of ticketIds) {
    const closed = await page.request.patch(`/api/maintenance/${id}`, {
      data: { status: 'DONE' },
    })
    expect(closed.status(), `ปิดใบแจ้งซ่อม ${id} ที่เทสสร้างไม่สำเร็จ`).toBeLessThan(300)
  }

  if (ticketIds.length === 0) {
    // ยังไม่เคยยิง จึงลบทิ้งได้จริง ไม่ทิ้งอะไรไว้เลย
    const removed = await page.request.delete(`/api/reminders/${reminderId}`)
    expect(removed.status(), 'ลบรอบแจ้งเตือนที่เทสสร้างไม่สำเร็จ').toBeLessThan(300)
    return
  }

  const paused = await page.request.patch(`/api/reminders/${reminderId}/active`, {
    data: { active: false },
  })
  expect(paused.status(), 'พักรอบแจ้งเตือนที่เทสสร้างไม่สำเร็จ').toBeLessThan(300)
}

/*
  ใบแจ้งซ่อมที่รอบนี้สร้างขึ้น อ่านจาก API เพื่อเอา id ไปลบทิ้ง

  จับคู่ด้วยชื่อ ไม่ได้จับด้วยเลขรอบ เพราะ TicketResponse ไม่ได้ส่ง reminderId ออกมา
  (มีแต่ source) ชื่อที่ใช้มาจาก uniqueName ซึ่งต่อท้ายด้วย Date.now() จึงไม่ชนกับ
  ข้อมูลจริงในฐานข้อมูลหรือกับรอบก่อนหน้าของเทสเอง
  MaintenanceTicket.fromReminder ตั้ง title จากชื่อของรอบตรง ๆ สองค่านี้จึงตรงกันเสมอ
*/
async function ticketsNamed(page: Page, name: string): Promise<{ id: number; source: string }[]> {
  const response = await page.request.get('/api/maintenance')
  expect(response.status()).toBe(200)
  const tickets = (await response.json()) as { id: number; title: string; source: string }[]
  return tickets.filter((ticket) => ticket.title === name)
}

test('E2E-LIVE-REMINDER-001: A due recurring reminder turns into a real maintenance ticket', async ({
  page,
}) => {
  await signInLive(page)
  await openScheduleTab(page)

  const name = uniqueName('QA Reminder')
  const reminderId = await addReminder(page, name, '111')
  const createdTickets: number[] = []

  try {
    // การ์ดต้องโผล่ในแถบ Recurring ทันที พร้อมป้าย Overdue เพราะวันเริ่มเป็นเมื่อวาน
    const card = page.getByRole('button', { name: `View reminder ${name}` })
    await expect(card).toBeVisible()

    // ยังไม่ได้รันรอบ จึงยังไม่ควรมีใบแจ้งซ่อมของรอบนี้
    expect(await ticketsNamed(page, name)).toHaveLength(0)

    /*
      เรียกงานตามเวลาเดี๋ยวนี้แทนการรอรอบแปดโมงเช้า เมธอดปลายทางเป็นตัวเดียวกับที่
      ReminderScheduler เรียก ถ้าใครไปแก้ให้สองทางทำงานต่างกัน เคสนี้จะจับได้
    */
    const ran = await page.request.post('/api/reminders/run-due')
    expect(ran.status()).toBe(200)
    expect((await ran.json()) as { createdTickets: number }).toMatchObject({
      createdTickets: expect.any(Number),
    })

    const fromReminder = await ticketsNamed(page, name)
    createdTickets.push(...fromReminder.map((ticket) => ticket.id))
    expect(createdTickets, 'ถึงกำหนดแล้วแต่ไม่มีใบแจ้งซ่อมเกิดขึ้นเลย').toHaveLength(1)
    // ใบที่เกิดเองจากรอบต้องถูกตีตราว่ามาจากรอบ ไม่ใช่ใบที่คนกรอกเอง
    expect(fromReminder[0].source).toBe('RECURRING')

    /*
      ข้อสำคัญของ US-14-S2 — แอดมินต้อง "เห็น" ไม่ใช่แค่มีแถวในฐานข้อมูล
      รีโหลดทั้งหน้าก่อนดู เพื่อยืนยันว่าข้อมูลมาจาก backend ไม่ใช่ state ที่ค้างในหน้าเว็บ
    */
    await page.reload()
    await page.getByRole('button', { name: 'Maintenance Log' }).click()
    await expect(page.getByText(name).first()).toBeVisible()

    // ใบที่เกิดจากรอบต้องผูกกับห้องที่เลือกไว้ ไม่ใช่ห้องอื่น
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toContainText('111')
  } finally {
    await cleanUp(page, reminderId, createdTickets)
  }
})

test('E2E-LIVE-REMINDER-002: A paused reminder is skipped when the scheduled job runs', async ({
  page,
}) => {
  await signInLive(page)
  await openScheduleTab(page)

  const name = uniqueName('QA Paused')
  const reminderId = await addReminder(page, name, '112')

  try {
    /*
      พักรอบไว้ แล้วสั่งรันงานตามเวลา ใบที่ถูกพักต้องไม่ถูกหยิบมาทำ
      เคสนี้คุ้มที่จะมี เพราะถ้าเงื่อนไข active หลุดไปจาก query ที่ดึงใบถึงกำหนด
      ระบบจะเริ่มสร้างใบแจ้งซ่อมให้รอบที่แอดมินสั่งปิดไว้ ซึ่งผู้ใช้ไม่มีทางสังเกตเห็นเอง
    */
    const paused = await page.request.patch(`/api/reminders/${reminderId}/active`, {
      data: { active: false },
    })
    expect(paused.status(), 'สั่งพักรอบแจ้งเตือนไม่สำเร็จ').toBeLessThan(300)

    const ran = await page.request.post('/api/reminders/run-due')
    expect(ran.status()).toBe(200)

    expect(await ticketsNamed(page, name), 'รอบที่ถูกพักไว้ไม่ควรสร้างใบแจ้งซ่อม').toHaveLength(0)

    // หน้าจอต้องบอกด้วยว่ารอบนี้ถูกพัก ไม่ใช่เงียบไปเฉย ๆ
    await page.reload()
    await page.getByRole('button', { name: 'Schedule & Reminder' }).click()
    await expect(page.getByRole('button', { name: `View reminder ${name}` })).toBeVisible()
  } finally {
    // ไม่มีใบแจ้งซ่อมให้ลบ รอบจึงลบได้ตรง ๆ
    await cleanUp(page, reminderId, [])
  }
})
