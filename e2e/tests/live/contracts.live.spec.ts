import { expect, test, type Page } from '@playwright/test'
import { newThaiNationalId, signInLive, uniqueName } from './signInLive'

/*
  SSK-123 — วงจรสัญญาเช่ากับ backend จริง (US-04, US-06)

  ชุด mock มี E2E-CONTRACT-001 อยู่แล้ว แต่ข้อมูลอยู่ใน memory ของหน้าเว็บ จึงพิสูจน์ไม่ได้ว่า
  ปุ่มบนหน้าจอส่งสัญญาไปถึง PostgreSQL จริง ใบหยกรีวิว E2E coverage แล้วชี้ว่าเป็นช่องว่าง
  ใหญ่สุดที่เหลืออยู่ (14 ต.ค.) สองเคสนี้จึงเช็คแค่ว่าหน้าจอกับ API ต่อกันจริง ส่วนกฎธุรกิจ
  เช่นสัญญาซ้อนหรือการคำนวณค่าเช่าอยู่ใน LeaseApiTest ฝั่ง backend แล้ว ไม่เช็คซ้ำที่นี่

  ห้อง 211 กับ 212 เลือกเพราะข้อมูลตั้งต้น (DevDataSeeder) และเทส live ตัวอื่นไม่ได้ใช้

  ข้อจำกัดเรื่องเก็บกวาด: ระบบตั้งใจไม่ให้ลบสัญญา และผู้เช่าที่เคยมีสัญญาก็ลบไม่ได้
  (TenantService.delete ตอบ 409) ทุกรอบที่รันจึงเหลือผู้เช่าหนึ่งคนกับสัญญาที่ปิดแล้วหนึ่งฉบับ
  ต่อเคสค้างอยู่ในฐานข้อมูล ทำได้แค่ปิดสัญญาเพื่อคืนห้องให้ว่างเหมือนเดิม
  ชื่อผู้เช่าขึ้นต้นด้วย "QA Contract" จะได้แยกออกจากข้อมูลจริงได้ง่าย
*/

interface LeaseJson {
  id: number
  roomNumber: string
  tenantName: string
  billingCycle: 'MONTHLY' | 'YEARLY'
  status: 'ACTIVE' | 'ENDED'
}

interface RoomJson {
  id: number
  roomNumber: string
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE'
}

/** วันนี้ตามเวลาไทย ตรงกับ todayInBangkok() ที่หน้าเว็บใช้ตั้งวันเริ่มและวันปิดสัญญา */
function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
}

async function roomByNumber(page: Page, roomNumber: string): Promise<RoomJson> {
  const response = await page.request.get('/api/rooms')
  expect(response.status()).toBe(200)
  const room = ((await response.json()) as RoomJson[]).find((r) => r.roomNumber === roomNumber)
  if (!room) throw new Error(`ไม่พบห้อง ${roomNumber} ในฐานข้อมูล`)
  return room
}

/*
  backend ไม่มี GET /api/leases/{id} มีแต่รายการที่กรองได้ จึงกรองด้วย tenantId
  ผู้เช่าของเทสสร้างใหม่ทุกรอบ จึงมีสัญญาอยู่ฉบับเดียวเสมอ
*/
async function leaseById(page: Page, id: number, tenantId: number): Promise<LeaseJson> {
  const response = await page.request.get(`/api/leases?tenantId=${tenantId}`)
  expect(response.status()).toBe(200)
  const lease = ((await response.json()) as LeaseJson[]).find((l) => l.id === id)
  if (!lease) throw new Error(`ไม่พบสัญญา ${id} ของผู้เช่า ${tenantId} ในฐานข้อมูล`)
  return lease
}

/*
  ห้องต้องว่างก่อนเริ่ม ถ้าไม่ว่างแปลว่ารอบก่อนพังกลางทางแล้วปิดสัญญาไม่ทัน
  บอกสาเหตุตรง ๆ ดีกว่าปล่อยให้ไปพังที่ dropdown หาห้องไม่เจอ
*/
async function expectRoomAvailable(page: Page, roomNumber: string): Promise<RoomJson> {
  const room = await roomByNumber(page, roomNumber)
  expect(
    room.status,
    `ห้อง ${roomNumber} ต้องว่างก่อนเริ่มเทส ถ้ามีสัญญาของ "QA Contract ..." ค้างอยู่ ให้ Check Out จากหน้า Dashboard ก่อน`,
  ).toBe('AVAILABLE')
  return room
}

/** สร้างผู้เช่าผ่าน API เพราะการเพิ่มผู้เช่าผ่านหน้าจอมี E2E-LIVE-TENANT-001 คุมอยู่แล้ว */
async function createTenant(page: Page, fullName: string): Promise<number> {
  const response = await page.request.post('/api/tenants', {
    data: { fullName, nationalId: newThaiNationalId(), phone: '089-123-4567' },
  })
  expect(response.status(), 'สร้างผู้เช่าสำหรับเทสไม่สำเร็จ').toBe(201)
  return ((await response.json()) as { id: number }).id
}

/** ปิดสัญญาผ่าน API เป็นการเก็บกวาด คืนห้องให้ว่าง ปิดซ้ำไม่ได้จึงเช็คสถานะก่อน */
async function endLeaseIfActive(page: Page, leaseId: number, tenantId: number) {
  const lease = await leaseById(page, leaseId, tenantId)
  if (lease.status === 'ENDED') return
  const response = await page.request.post(`/api/leases/${leaseId}/terminate`, {
    data: { endDate: todayInBangkok() },
  })
  expect(response.status(), 'ปิดสัญญาที่เทสสร้างไม่สำเร็จ ห้องจะค้างเป็น Occupied').toBe(200)
}

/*
  ตาราง Contracts แบ่งหน้าละ 5 แถว เรียงวันเริ่มสัญญาใหม่สุดก่อน แต่สัญญาที่ปิดแล้วจากรอบก่อน ๆ
  ก็เริ่มวันนี้เหมือนกัน ถ้ารันหลายรอบในวันเดียว แถวของเราอาจตกไปหน้าถัดไป
  หน้านี้ไม่มีช่องค้นหา จึงไล่กด Next page จนเจอหรือหมดหน้า
*/
async function findContractRow(page: Page, tenantName: string) {
  await page.getByRole('link', { name: 'Contracts' }).click()
  await expect(page.getByRole('heading', { name: 'Contract Management' })).toBeVisible()

  const row = page.getByRole('row', { name: new RegExp(tenantName) })
  const next = page.getByRole('button', { name: 'Next page' })
  await expect(page.getByRole('row').nth(1)).toBeVisible()

  while ((await row.count()) === 0 && (await next.isEnabled())) {
    await next.click()
  }
  return row
}

test('E2E-LIVE-CONTRACT-001: A contract created from the form is saved and turns the room Occupied', async ({
  page,
}) => {
  await signInLive(page)

  const unit = '211'
  await expectRoomAvailable(page, unit)
  const tenantName = uniqueName('QA Contract')
  const tenantId = await createTenant(page, tenantName)

  await page.getByRole('link', { name: 'Contracts' }).click()
  await page.getByRole('button', { name: 'Create Contract' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Contract' })

  // dropdown ของฟอร์มมี <select> ซ่อนอยู่ข้างใต้ (CustomSelect) เลือกผ่านตัวนั้นแบบเดียวกับชุด mock
  await dialog.locator('#unit-select').selectOption({ label: `${unit} · Floor 2` })
  await dialog.locator('#tenant-select').selectOption({ label: tenantName })
  // YEARLY เพื่อพิสูจน์ว่าค่าที่เลือกบนหน้าจอเดินทางถึงฐานข้อมูลจริง ไม่ใช่ค่าตั้งต้น MONTHLY
  await dialog.locator('#billing-cycle').selectOption('YEARLY')

  const created = page.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/leases' && res.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Create Contract' }).click()
  const response = await created
  expect(response.status(), 'สร้างสัญญาไม่สำเร็จ').toBe(201)
  await expect(dialog).toBeHidden()
  const leaseId = ((await response.json()) as { id: number }).id

  try {
    // รีโหลดทั้งหน้า ข้อมูลที่เห็นหลังจากนี้ต้องมาจากฐานข้อมูล ไม่ใช่ state ในหน้าเว็บ
    await page.reload()
    await expect(await findContractRow(page, tenantName)).toContainText('Active')

    const saved = await leaseById(page, leaseId, tenantId)
    expect(saved.roomNumber).toBe(unit)
    expect(saved.billingCycle).toBe('YEARLY')
    expect(saved.status).toBe('ACTIVE')

    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByLabel(`Unit ${unit}`, { exact: true })).toContainText(tenantName)
    expect((await roomByNumber(page, unit)).status).toBe('OCCUPIED')
  } finally {
    await endLeaseIfActive(page, leaseId, tenantId)
  }
})

test('E2E-LIVE-CONTRACT-002: Checking out from the Dashboard ends the contract and frees the room', async ({
  page,
}) => {
  await signInLive(page)

  const unit = '212'
  const room = await expectRoomAvailable(page, unit)
  const tenantName = uniqueName('QA Contract')
  const tenantId = await createTenant(page, tenantName)

  // สัญญาตั้งต้นสร้างผ่าน API เพราะเคสนี้พิสูจน์การปิดสัญญา การสร้างผ่านหน้าจอคือเคส 001
  const created = await page.request.post('/api/leases', {
    data: { roomId: room.id, tenantId, startDate: todayInBangkok(), billingCycle: 'MONTHLY' },
  })
  expect(created.status(), 'สร้างสัญญาสำหรับเทสไม่สำเร็จ').toBe(201)
  const leaseId = ((await created.json()) as { id: number }).id

  try {
    // สัญญาที่เพิ่งสร้างผ่าน API ยังไม่อยู่ในหน้าที่โหลดไว้ ต้องโหลดใหม่ก่อน
    await page.reload()
    const card = page.getByLabel(`Unit ${unit}`, { exact: true })
    await expect(card).toContainText(tenantName)

    await card.click()
    await page.getByRole('button', { name: 'Check Out', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Confirm Check Out' })

    const ended = page.waitForResponse(
      (res) => res.url().includes(`/api/leases/${leaseId}/terminate`) && res.request().method() === 'POST',
    )
    await confirm.getByRole('button', { name: 'Confirm Check Out' }).click()
    expect((await ended).status(), 'ปิดสัญญาไม่สำเร็จ').toBe(200)
    await expect(confirm).toBeHidden()

    await page.reload()
    await expect(card).not.toContainText(tenantName)
    expect((await roomByNumber(page, unit)).status).toBe('AVAILABLE')
    expect((await leaseById(page, leaseId, tenantId)).status).toBe('ENDED')

    await expect(await findContractRow(page, tenantName)).toContainText('Ended')
  } finally {
    await endLeaseIfActive(page, leaseId, tenantId)
  }
})
