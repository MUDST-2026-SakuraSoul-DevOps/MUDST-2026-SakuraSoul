import { api, onCleanup, runCleanups, uniqueName, yesterdayInBangkok } from '../../support/helpers'

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

interface TicketJson {
  id: number
  title: string
  source: string
}

function openScheduleTab() {
  cy.findByRole('link', { name: 'Maintenance' }).click()
  cy.findByRole('button', { name: 'Schedule & Reminder' }).click()
  cy.findByRole('heading', { name: 'Recurring' }).should('be.visible')
}

/**
 * กรอกฟอร์ม Add Reminder แล้วคืนเลขรอบที่ backend สร้างให้
 *
 * จดงานเก็บกวาดไว้ทันทีที่รู้เลขรอบ ก่อนเช็คอย่างอื่นต่อ ถ้าเทสพังหลังจากนี้รอบก็ยังถูกเก็บกวาด
 * createdTickets ถูกอ่านตอนเก็บกวาดจริง ไม่ใช่ตอนจด เทสจึงเติมเลขใบแจ้งซ่อมลงไปทีหลังได้
 */
function addReminder(name: string, unit: string, createdTickets: number[]): Cypress.Chainable<number> {
  cy.findByRole('button', { name: 'Add Reminder' }).click()

  cy.intercept({ method: 'POST', pathname: /^\/api\/reminders$/ }).as('createReminder')
  cy.findByRole('dialog', { name: 'Add Reminder' }).within(() => {
    cy.findByLabelText('Reminder Name').clear().type(name)
    cy.findByLabelText('Frequency').select('Monthly')
    // เมื่อวาน = ถึงกำหนดแล้วตั้งแต่วินาทีที่บันทึก ไม่ต้องรอเวลาจริง
    cy.findByLabelText('Start Date').type(yesterdayInBangkok())
    // ต้องผูกห้อง ใบของทั้งตึกไม่สร้างใบแจ้งซ่อม (ดูคอมเมนต์ใน ReminderService.runDue)
    cy.findByLabelText('Assigned Unit').select(unit)
    cy.findByRole('radio', { name: 'High' }).click()

    cy.findByRole('button', { name: 'Save Reminder' }).click()
  })

  return cy.wait('@createReminder').then(({ response }) => {
    expect(response?.statusCode, 'สร้างรอบแจ้งเตือนไม่สำเร็จ').to.eq(201)
    const reminderId = (response?.body as { id: number }).id
    onCleanup(() => cleanUp(reminderId, createdTickets))

    cy.findByRole('dialog', { name: 'Add Reminder' }).should('not.exist')
    return cy.wrap(reminderId)
  })
}

/*
  เก็บกวาดผ่าน API ตรง ๆ ไม่ผ่านหน้าจอ เพราะขั้นตอนนี้ไม่ใช่สิ่งที่เทสต้องการพิสูจน์
  cy.request ใช้ cookie ชุดเดียวกับที่หน้าเว็บเพิ่งล็อกอินไว้ จึงผ่านยามของ backend ได้

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

  ฟังก์ชันนี้รันใน afterEach จึงห้าม assert เพราะ afterEach ที่พังทำให้ Cypress ข้ามเคสที่เหลือทั้งไฟล์
  ขั้นไหนไม่สำเร็จแค่บันทึกลง log ของ Cypress ให้รู้ว่ามีของค้าง
*/
function cleanUp(reminderId: number, ticketIds: number[]): void {
  for (const id of ticketIds) {
    api('PATCH', `/api/maintenance/${id}`, { status: 'DONE' }).then((closed) => {
      logIfFailed(closed.status, `ปิดใบแจ้งซ่อม ${id} ที่เทสสร้างไม่สำเร็จ`)
    })
  }

  if (ticketIds.length === 0) {
    // ยังไม่เคยยิง จึงลบทิ้งได้จริง ไม่ทิ้งอะไรไว้เลย
    api('DELETE', `/api/reminders/${reminderId}`).then((removed) => {
      logIfFailed(removed.status, 'ลบรอบแจ้งเตือนที่เทสสร้างไม่สำเร็จ')
    })
    return
  }

  api('PATCH', `/api/reminders/${reminderId}/active`, { active: false }).then((paused) => {
    logIfFailed(paused.status, 'พักรอบแจ้งเตือนที่เทสสร้างไม่สำเร็จ')
  })
}

function logIfFailed(status: number, message: string) {
  if (status >= 300) {
    Cypress.log({ name: 'cleanup', message: `${message} (HTTP ${status})` })
  }
}

/*
  ใบแจ้งซ่อมที่รอบนี้สร้างขึ้น อ่านจาก API เพื่อเอา id ไปลบทิ้ง

  จับคู่ด้วยชื่อ ไม่ได้จับด้วยเลขรอบ เพราะ TicketResponse ไม่ได้ส่ง reminderId ออกมา
  (มีแต่ source) ชื่อที่ใช้มาจาก uniqueName ซึ่งต่อท้ายด้วย Date.now() จึงไม่ชนกับ
  ข้อมูลจริงในฐานข้อมูลหรือกับรอบก่อนหน้าของเทสเอง
  MaintenanceTicket.fromReminder ตั้ง title จากชื่อของรอบตรง ๆ สองค่านี้จึงตรงกันเสมอ
*/
function ticketsNamed(name: string): Cypress.Chainable<TicketJson[]> {
  return api<TicketJson[]>('GET', '/api/maintenance').then((response) => {
    expect(response.status).to.eq(200)
    return response.body.filter((ticket) => ticket.title === name)
  })
}

describe('reminders (live-api)', () => {
  afterEach(runCleanups)

  it('E2E-LIVE-REMINDER-001: A due recurring reminder turns into a real maintenance ticket', () => {
    cy.signInLive()
    openScheduleTab()

    const name = uniqueName('QA Reminder')
    const createdTickets: number[] = []
    addReminder(name, '111', createdTickets)

    // การ์ดต้องโผล่ในแถบ Recurring ทันที พร้อมป้าย Overdue เพราะวันเริ่มเป็นเมื่อวาน
    cy.findByRole('button', { name: `View reminder ${name}` }).should('be.visible')

    // ยังไม่ได้รันรอบ จึงยังไม่ควรมีใบแจ้งซ่อมของรอบนี้
    ticketsNamed(name).then((tickets) => {
      expect(tickets).to.have.length(0)
    })

    /*
      เรียกงานตามเวลาเดี๋ยวนี้แทนการรอรอบแปดโมงเช้า เมธอดปลายทางเป็นตัวเดียวกับที่
      ReminderScheduler เรียก ถ้าใครไปแก้ให้สองทางทำงานต่างกัน เคสนี้จะจับได้
    */
    api<{ createdTickets: number }>('POST', '/api/reminders/run-due').then((ran) => {
      expect(ran.status).to.eq(200)
      expect(ran.body).to.have.property('createdTickets').that.is.a('number')
    })

    ticketsNamed(name).then((fromReminder) => {
      createdTickets.push(...fromReminder.map((ticket) => ticket.id))
      expect(createdTickets, 'ถึงกำหนดแล้วแต่ไม่มีใบแจ้งซ่อมเกิดขึ้นเลย').to.have.length(1)
      // ใบที่เกิดเองจากรอบต้องถูกตีตราว่ามาจากรอบ ไม่ใช่ใบที่คนกรอกเอง
      expect(fromReminder[0].source).to.eq('RECURRING')
    })

    /*
      ข้อสำคัญของ US-14-S2 — แอดมินต้อง "เห็น" ไม่ใช่แค่มีแถวในฐานข้อมูล
      รีโหลดทั้งหน้าก่อนดู เพื่อยืนยันว่าข้อมูลมาจาก backend ไม่ใช่ state ที่ค้างในหน้าเว็บ
    */
    cy.reload()
    cy.findByRole('button', { name: 'Maintenance Log' }).click()
    cy.findAllByText(name).first().should('be.visible')

    // ใบที่เกิดจากรอบต้องผูกกับห้องที่เลือกไว้ ไม่ใช่ห้องอื่น
    cy.findAllByRole('row')
      .filter((_, row) => (row.textContent ?? '').includes(name))
      .should('contain.text', '111')
  })

  it('E2E-LIVE-REMINDER-002: A paused reminder is skipped when the scheduled job runs', () => {
    cy.signInLive()
    openScheduleTab()

    const name = uniqueName('QA Paused')
    // ส่ง array ว่างให้ตัวเก็บกวาด ไม่มีใบแจ้งซ่อมให้ลบ รอบจึงลบได้ตรง ๆ
    addReminder(name, '112', []).then((reminderId) => {
      /*
        พักรอบไว้ แล้วสั่งรันงานตามเวลา ใบที่ถูกพักต้องไม่ถูกหยิบมาทำ
        เคสนี้คุ้มที่จะมี เพราะถ้าเงื่อนไข active หลุดไปจาก query ที่ดึงใบถึงกำหนด
        ระบบจะเริ่มสร้างใบแจ้งซ่อมให้รอบที่แอดมินสั่งปิดไว้ ซึ่งผู้ใช้ไม่มีทางสังเกตเห็นเอง
      */
      api('PATCH', `/api/reminders/${reminderId}/active`, { active: false }).then((paused) => {
        expect(paused.status, 'สั่งพักรอบแจ้งเตือนไม่สำเร็จ').to.be.lessThan(300)
      })
    })

    api('POST', '/api/reminders/run-due').then((ran) => {
      expect(ran.status).to.eq(200)
    })

    ticketsNamed(name).then((tickets) => {
      expect(tickets, 'รอบที่ถูกพักไว้ไม่ควรสร้างใบแจ้งซ่อม').to.have.length(0)
    })

    // หน้าจอต้องบอกด้วยว่ารอบนี้ถูกพัก ไม่ใช่เงียบไปเฉย ๆ
    cy.reload()
    cy.findByRole('button', { name: 'Schedule & Reminder' }).click()
    cy.findByRole('button', { name: `View reminder ${name}` }).should('be.visible')
  })
})
