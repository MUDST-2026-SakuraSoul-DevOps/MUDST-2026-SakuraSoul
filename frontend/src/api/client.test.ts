import { beforeEach, describe, expect, it } from 'vitest'
import {
  ApiError,
  createLease,
  createTenant,
  fetchTenant,
  updateTenant,
  createReceipt,
  payReceipt,
  fetchReceipts,
  createReminder,
  createSupply,
  deleteReminder,
  deleteSupply,
  fetchMaintenanceLog,
  fetchReminders,
  fetchSupplies,
  fetchSupplySummary,
  restockSupply,
  runDueReminders,
  setReminderActive,
  updateReminder,
  updateSupply,
  fetchApartmentConfig,
  fetchMe,
  login,
  logout,
  updateApartmentConfig,
  updateRoomStatus,
  fetchLeases,
  fetchRooms,
  isOverlapError,
  terminateLease,
  updateLease,
} from './client'
import { resetMockStore } from './mockApi'
import type { ReminderRequest, RoomSummary, SupplyRequest } from './types'
import { addMonths } from '../domain/maintenanceBoard'
import { todayInBangkok } from '../format'

/**
 * เทสชั้นนี้ยิงผ่าน client จริงไปที่ backend จำลอง (VITE_API_MOCK=1 ตั้งไว้ใน
 * vite.config.ts) เพื่อพิสูจน์ "สัญญา" ระหว่างหน้าเว็บกับ backend ว่าเข้าใจตรงกัน
 * รูปร่าง payload, รหัสสถานะ, และข้อความ error
 *
 * พอ endpoint ฝั่ง Spring ขึ้นจริง เทสไฟล์นี้คือรายการที่ backend ต้องทำให้ผ่าน
 * ถ้าฝั่งนั้นตอบไม่เหมือนกัน แปลว่ามีฝั่งใดฝั่งหนึ่งหลุดจากที่ตกลงกันไว้
 */

/** id ของห้องเรียงตามเลขห้อง 101 คือ id 1 ไปจนถึง 212 คือ id 24 */
const ROOM_101 = 1
const ROOM_102 = 2
const ROOM_106 = 6

function findRoom(rooms: RoomSummary[], roomNumber: string): RoomSummary {
  const room = rooms.find((r) => r.roomNumber === roomNumber)
  if (!room) {
    throw new Error(`Unit ${roomNumber} not found in the response`)
  }
  return room
}

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

beforeEach(() => {
  resetMockStore()
})

describe('/api/auth', () => {
  it('GET /auth/me คืนแอดมินที่ล็อกอินอยู่ตอนนี้', async () => {
    const me = await fetchMe()

    expect(me.username).toBe('admin')
    expect(me.displayName).toBe('Administrator')
  })

  // 204 ไม่มี body เลย ถ้า client ยังอ่าน json เหมือน endpoint อื่นจะพังเป็น
  // SyntaxError ดิบ ๆ ไม่ใช่ ApiError เทสข้อนี้คือเหตุผลที่ต้องแยก send() ออกมา
  it('POST /auth/logout ตอบ 204 ไม่มี body ต้องผ่านโดยไม่โยน error', async () => {
    await expect(logout()).resolves.toBeUndefined()
  })

  it('ไม่กรอกชื่อผู้ใช้ต้องโดน 400 พร้อมข้อความบอกว่าขาดช่องไหน', async () => {
    const attempt = login('', 'test-password')

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect((error as ApiError).status).toBe(400)
      expect((error as ApiError).message).toBe('Please enter the username')
    })
  })
})

describe('GET /api/rooms', () => {
  it('คืนห้องครบ 24 ห้อง สองชั้น ชั้นละ 12 ตาม requirement', async () => {
    const rooms = await fetchRooms()
    expect(rooms).toHaveLength(24)
    expect(rooms.filter((r) => r.floor === 1)).toHaveLength(12)
    expect(rooms.filter((r) => r.floor === 2)).toHaveLength(12)
  })

  it('ห้องที่มีสัญญา active อยู่ต้องเป็นสถานะมีผู้เช่า พร้อมชื่อผู้เช่า', async () => {
    const room = findRoom(await fetchRooms(), '102')
    expect(room.status).toBe('OCCUPIED')
    expect(room.currentLease?.tenantName).toBe('Yuki Tanaka')
  })

  it('ห้องที่ปิดซ่อมต้องเป็นสถานะซ่อมบำรุง ไม่ใช่ห้องว่าง', async () => {
    expect(findRoom(await fetchRooms(), '106').status).toBe('MAINTENANCE')
  })

  it('ห้องที่ไม่มีสัญญาและไม่ได้ปิดซ่อมคือห้องว่าง', async () => {
    expect(findRoom(await fetchRooms(), '101').status).toBe('AVAILABLE')
  })
})

describe('POST /api/leases', () => {
  it('สร้างสัญญาในห้องว่างได้ แล้วห้องเปลี่ยนเป็นมีผู้เช่าทันที', async () => {
    await createLease({
      roomId: ROOM_101,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(365),
      billingCycle: 'MONTHLY',
    })

    const room = findRoom(await fetchRooms(), '101')
    expect(room.status).toBe('OCCUPIED')
    expect(room.currentLease?.tenantName).toBe('Haruto Watanabe')
  })

  // US-05-S1 เคสสำคัญที่สุดของ story นี้
  it('สร้างสัญญาทับช่วงเวลาที่ห้องมีคนอยู่แล้ว ต้องโดนปฏิเสธด้วย 409', async () => {
    const attempt = createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(90),
      billingCycle: 'MONTHLY',
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect(isOverlapError(error)).toBe(true)
      // ข้อความต้องบอกว่าnot availableช่วงไหน ไม่ใช่แค่ว่า "ผิดพลาด"
      expect((error as ApiError).message).toContain('102')
      expect((error as ApiError).message).toContain('not available')
    })
  })

  it('ข้อมูลไม่ถูกสร้างขึ้นเลยเมื่อโดนปฏิเสธ', async () => {
    const before = await fetchLeases()
    const attempt = createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(90),
      billingCycle: 'MONTHLY',
    })
    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    expect(await fetchLeases()).toHaveLength(before.length)
  })

  it('วันจบมาก่อนวันเริ่ม ต้องโดนปฏิเสธด้วย 400 ไม่ใช่ 409', async () => {
    const attempt = createLease({
      roomId: ROOM_106,
      tenantId: 6,
      startDate: isoDate(30),
      endDate: isoDate(10),
      billingCycle: 'MONTHLY',
    })
    await expect(attempt).rejects.toMatchObject({ status: 400 })
  })
})

describe('แก้ไขและปิดสัญญา', () => {
  // US-06-S1
  it('ปิดสัญญาแล้วห้องกลับไปเป็นว่าง', async () => {
    const active = (await fetchLeases({ status: 'ACTIVE' })).find((l) => l.roomNumber === '102')
    expect(active).toBeDefined()

    const ended = await terminateLease(active!.id, isoDate(0))
    expect(ended.status).toBe('ENDED')

    expect(findRoom(await fetchRooms(), '102').status).toBe('AVAILABLE')
  })

  // US-06-S2
  it('แก้วันที่ไปทับสัญญา active อื่นของห้องเดียวกัน ต้องโดนปฏิเสธด้วย 409', async () => {
    // สร้างสัญญาที่จะเริ่มหลังสัญญาเดิมของห้อง 102 จบไปแล้ว จึงสร้างได้ปกติ
    const future = await createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(40),
      endDate: isoDate(400),
      billingCycle: 'MONTHLY',
    })

    // แล้วดึงวันเริ่มถอยกลับมาให้ชนกับสัญญาเดิมที่ยัง active อยู่
    const attempt = updateLease(future.id, {
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(-10),
      endDate: isoDate(400),
      billingCycle: 'MONTHLY',
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect(isOverlapError(error)).toBe(true)
    })
  })

  it('แก้สัญญาโดยไม่เปลี่ยนวันที่ ต้องบันทึกได้ ไม่ฟ้องว่าชนกับตัวเอง และค่าเช่าคงเดิม (SSK-127)', async () => {
    const active = (await fetchLeases({ status: 'ACTIVE' })).find((l) => l.roomNumber === '102')
    const updated = await updateLease(active!.id, {
      roomId: active!.roomId,
      tenantId: active!.tenantId,
      startDate: active!.startDate,
      endDate: active!.endDate,
      billingCycle: 'MONTHLY',
    })
    // ห้อง 102 เป็น Double ค่าเช่าที่ล็อกไว้ตอนเซ็นคือ 4,500 แก้สัญญาแล้วต้องไม่เปลี่ยน
    expect(updated.monthlyRent).toBe(4500)
  })
})

describe('SSK-127 ค่าเช่าฟิกตามประเภทห้อง', () => {
  it('สร้างสัญญาแล้วค่าเช่ามาจากประเภทห้อง Single 3,500 / Double 4,500', async () => {
    const single = await createLease({
      roomId: ROOM_101,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(365),
      billingCycle: 'MONTHLY',
    })
    expect(single.monthlyRent).toBe(3500)

    const room104 = findRoom(await fetchRooms(), '104')
    expect(room104.roomType).toBe('DOUBLE')
    expect(room104.baseRent).toBe(4500)
    const double = await createLease({
      roomId: room104.id,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(365),
      billingCycle: 'YEARLY',
    })
    expect(double.monthlyRent).toBe(4500)
  })

  it('ส่งค่าเช่ามาเองก็ไม่มีผล เหมือน backend ที่มองข้ามค่านี้', async () => {
    const created = await createLease({
      roomId: ROOM_101,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(365),
      billingCycle: 'MONTHLY',
      // body เก่าที่ยังส่งค่าเช่ามา ต้องไม่ทำให้ค่าเช่าเพี้ยน
      ...({ monthlyRent: 999999 } as object),
    })
    expect(created.monthlyRent).toBe(3500)
  })

  it('เงินมัดจำกับอัตราค่าไฟ/น้ำที่ส่งมาถูกบันทึกลงสัญญา', async () => {
    const created = await createLease({
      roomId: ROOM_101,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(365),
      billingCycle: 'MONTHLY',
      securityDeposit: 7000,
      electricRatePerUnit: 8,
      waterRatePerUnit: 18,
    })
    expect(created.securityDeposit).toBe(7000)
    expect(created.electricRatePerUnit).toBe(8)
    expect(created.waterRatePerUnit).toBe(18)
  })
})

describe('US-15 ล็อกสถานะห้องเป็นซ่อมบำรุง', () => {
  it('S1 ล็อกห้องว่างแล้วสถานะเปลี่ยนเป็นซ่อมบำรุง', async () => {
    const updated = await updateRoomStatus(ROOM_101, 'MAINTENANCE')
    expect(updated.status).toBe('MAINTENANCE')
    expect(findRoom(await fetchRooms(), '101').status).toBe('MAINTENANCE')
  })

  it('S1 ล็อกห้องที่มีผู้เช่าอยู่ก็ได้ สัญญายังอยู่ครบ', async () => {
    const updated = await updateRoomStatus(ROOM_102, 'MAINTENANCE')
    expect(updated.status).toBe('MAINTENANCE')
    // สัญญาไม่ได้ถูกยกเลิกไปด้วย แค่ห้องถูกกันไม่ให้รับสัญญาใหม่
    expect((await fetchLeases({ status: 'ACTIVE' })).some((l) => l.roomNumber === '102')).toBe(true)
  })

  it('S2 ปลดล็อกห้องที่ไม่มีสัญญา กลับไปเป็นว่าง', async () => {
    await updateRoomStatus(ROOM_101, 'MAINTENANCE')
    await updateRoomStatus(ROOM_101, 'AVAILABLE')
    expect(findRoom(await fetchRooms(), '101').status).toBe('AVAILABLE')
  })

  it('S2 ปลดล็อกห้องที่ยังมีสัญญาอยู่ กลับไปเป็นมีผู้เช่า ไม่ใช่ว่าง', async () => {
    // จุดนี้คือเหตุผลที่เก็บธงซ่อมแยกจากสถานะที่คำนวณจากสัญญา
    // ถ้าเก็บสถานะเดียวจะจำไม่ได้ว่าก่อนล็อกห้องเป็นอะไร
    await updateRoomStatus(ROOM_102, 'MAINTENANCE')
    await updateRoomStatus(ROOM_102, 'AVAILABLE')
    expect(findRoom(await fetchRooms(), '102').status).toBe('OCCUPIED')
  })

  it('ห้องที่ปิดซ่อมอยู่แล้ว ปลดล็อกได้ปกติ', async () => {
    expect(findRoom(await fetchRooms(), '106').status).toBe('MAINTENANCE')
    await updateRoomStatus(ROOM_106, 'AVAILABLE')
    expect(findRoom(await fetchRooms(), '106').status).toBe('AVAILABLE')
  })

  it('ส่งสถานะที่ตั้งเองไม่ได้ ต้องโดนปฏิเสธด้วย 400', async () => {
    await expect(updateRoomStatus(ROOM_101, 'OCCUPIED' as 'AVAILABLE')).rejects.toMatchObject({
      status: 400,
    })
    expect(findRoom(await fetchRooms(), '101').status).toBe('AVAILABLE')
  })
})

describe('US-16 อัตราค่าสาธารณูปโภคของตึก', () => {
  it('ดึงอัตราตั้งต้นได้ครบทุกช่อง', async () => {
    const config = await fetchApartmentConfig()
    expect(config.electricRatePerUnit).toBeGreaterThan(0)
    expect(config.waterRatePerUnit).toBeGreaterThan(0)
    expect(config).toHaveProperty('commonAreaFee')
    expect(config).toHaveProperty('internetFee')
    expect(config).toHaveProperty('updatedAt')
  })

  // US-16-S1
  it('S1 บันทึกอัตราใหม่แล้วดึงกลับมาได้ค่าที่เพิ่งตั้ง', async () => {
    await updateApartmentConfig({
      electricRatePerUnit: 9.5,
      waterRatePerUnit: 20,
      commonAreaFee: 350,
      internetFee: 0,
    })

    const config = await fetchApartmentConfig()
    expect(config.electricRatePerUnit).toBe(9.5)
    expect(config.waterRatePerUnit).toBe(20)
    expect(config.commonAreaFee).toBe(350)
    // ศูนย์ต้องบันทึกได้ เพราะหอบางที่ไม่คิดค่าอินเทอร์เน็ต
    expect(config.internetFee).toBe(0)
  })

  it('S1 บันทึกแล้วเวลาแก้ล่าสุดต้องขยับเป็นวันนี้', async () => {
    const before = await fetchApartmentConfig()
    await updateApartmentConfig({
      electricRatePerUnit: 8,
      waterRatePerUnit: 18,
      commonAreaFee: 300,
      internetFee: 250,
    })
    const after = await fetchApartmentConfig()
    expect(after.updatedAt > before.updatedAt).toBe(true)
  })

  // US-16-S2
  it('S2 อัตราติดลบต้องโดนปฏิเสธด้วย 400 พร้อมบอกช่องที่ผิด', async () => {
    const attempt = updateApartmentConfig({
      electricRatePerUnit: -1,
      waterRatePerUnit: 18,
      commonAreaFee: 300,
      internetFee: 250,
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect((error as ApiError).status).toBe(400)
      expect((error as ApiError).message).toContain('Electricity rate per unit')
    })
  })

  it('S2 โดนปฏิเสธแล้วอัตราเดิมต้องไม่ถูกแก้', async () => {
    const before = await fetchApartmentConfig()
    const attempt = updateApartmentConfig({
      electricRatePerUnit: -1,
      waterRatePerUnit: 18,
      commonAreaFee: 300,
      internetFee: 250,
    })
    await expect(attempt).rejects.toBeInstanceOf(ApiError)

    const after = await fetchApartmentConfig()
    expect(after.electricRatePerUnit).toBe(before.electricRatePerUnit)
  })
})

/*
  SSK-136 ผู้เช่าตามสัญญา US-03 และ TenantService ฝั่ง backend
  เดิม backend จำลองต่างจากของจริงสามจุด: บังคับอีเมล, PUT คงค่าเดิมของช่องที่ไม่ส่ง, และรับเลขบัตรซ้ำ
  ทั้งสามจุดทำให้เทสหน้าเว็บผ่าน แต่บน backend จริงผิด (แก้ผู้เช่าแล้วอีเมลหาย)
*/
describe('SSK-136 /api/tenants ทำตัวเหมือน TenantService', () => {
  it('เพิ่มผู้เช่าโดยไม่มีอีเมลได้ ตอบ 201 และอีเมลเป็น null', async () => {
    const created = await createTenant({ fullName: 'Mana Sukjai', phone: '089-123-4567', nationalId: '3500100123457' })

    expect(created.email).toBeNull()
    expect(created.lineId).toBeNull()
  })

  it('ช่วงสัญญากับประเภทห้องไม่ใช่ข้อมูลผู้เช่า ส่งมาก็ไม่ถูกเก็บ', async () => {
    const body = {
      fullName: 'Mana Sukjai',
      phone: '089-123-4567',
      nationalId: '3500100123457',
      startDate: '2026-07-21',
      roomType: 'Single Bedroom',
    }
    const created = await createTenant(body as Parameters<typeof createTenant>[0])

    expect(created).not.toHaveProperty('startDate')
    expect(created).not.toHaveProperty('roomType')
  })

  it('PUT แทนทั้งก้อน ไม่ส่งอีเมลมา อีเมลเดิมถูกล้าง แบบเดียวกับ backend จริง', async () => {
    const before = await fetchTenant(1)
    expect(before.email).toBe('yuki.t@example.com')

    const updated = await updateTenant(1, { fullName: 'Yuki Tanaka', phone: '081-234-5678', nationalId: '1100400123450' })

    expect(updated.email).toBeNull()
    expect((await fetchTenant(1)).email).toBeNull()
  })

  it('PUT ที่ส่งอีเมลมาด้วยเก็บอีเมลนั้นไว้', async () => {
    const updated = await updateTenant(1, {
      fullName: 'Yuki Tanaka',
      phone: '081-234-5678',
      nationalId: '1100400123450',
      email: 'yuki.new@example.com',
    })

    expect(updated.email).toBe('yuki.new@example.com')
  })

  it('เลขบัตรซ้ำกับผู้เช่าที่มีอยู่ตอบ 409 ข้อความเดียวกับ backend', async () => {
    const attempt = createTenant({ fullName: 'Yuki Copy', phone: '089-123-4567', nationalId: '1100400123450' })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect((error as ApiError).status).toBe(409)
      expect((error as ApiError).message).toBe('A tenant with this national ID already exists')
    })
  })
})

describe('SSK-136 สัญญาล็อกค่าส่วนกลางกับค่าอินเทอร์เน็ต', () => {
  it('สัญญาที่ส่งค่าส่วนกลางมาใช้ค่านั้น ไม่ส่งมาคัดลอกจาก Config เหมือน LeaseService', async () => {
    const withFee = await createLease({
      roomId: ROOM_101,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: null,
      billingCycle: 'MONTHLY',
      commonAreaFee: 350,
    })
    expect(withFee.commonAreaFee).toBe(350)
    expect(withFee.internetFee).toBe((await fetchApartmentConfig()).internetFee)
  })

  it('สัญญาตัวอย่างมีอัตราล็อกครบสี่ตัว เหมือน LeaseResponse ของ backend', async () => {
    const leases = await fetchLeases()

    for (const lease of leases) {
      expect(lease.electricRatePerUnit).toEqual(expect.any(Number))
      expect(lease.waterRatePerUnit).toEqual(expect.any(Number))
      expect(lease.commonAreaFee).toEqual(expect.any(Number))
      expect(lease.internetFee).toEqual(expect.any(Number))
    }
  })
})

/*
  สามเคสที่ docs/api-contract-billing.md บังคับไว้ รูปของ 201 ตอนออกใบ, detail ของ 409 ตอนออกซ้ำเดือน
  และ detail ของ 400 ต้องเป็นข้อความของช่องแรกที่ผิด
*/
describe('/api/receipts', () => {
  const LEASE_ROOM_207 = 3

  function thisMonth(): string {
    return new Date().toISOString().slice(0, 7)
  }

  it('POST ตอบใบเสร็จห้าบรรทัดคงที่ สถานะ PENDING ยอดรวมเท่ากับผลบวกทุกบรรทัด', async () => {
    const receipt = await createReceipt({
      leaseId: LEASE_ROOM_207,
      billingMonth: thisMonth(),
      electricUnits: 120,
      waterUnits: 15,
    })

    expect(receipt).toMatchObject({ leaseId: LEASE_ROOM_207, roomNumber: '207', status: 'PENDING', paidAt: null })
    expect(receipt.receiptNo).toMatch(/^RC-\d{4}-\d{4}$/)
    expect(receipt.items.map((row) => row.item)).toEqual([
      'Room rent',
      'Common area fee',
      'Internet',
      'Electricity',
      'Water',
    ])
    // 3,500 + 300 + 250 + 120×50 + 15×100 = 11,550
    expect(receipt.totalAmount).toBe(11550)
  })

  it('ออกใบเดือนเดิมให้สัญญาเดิมซ้ำต้องได้ 409 พร้อมข้อความของ backend', async () => {
    const body = { leaseId: LEASE_ROOM_207, billingMonth: thisMonth(), electricUnits: 1, waterUnits: 1 }
    await createReceipt(body)

    const attempt = createReceipt(body)
    await expect(attempt).rejects.toMatchObject({
      status: 409,
      message: 'A receipt for this month has already been issued for this lease',
    })
  })

  it('400 บอกช่องแรกที่ผิด หน่วยไฟติดลบมาก่อนหน่วยน้ำที่ไม่ได้ส่ง', async () => {
    const attempt = createReceipt({
      leaseId: LEASE_ROOM_207,
      billingMonth: thisMonth(),
      electricUnits: -1,
      waterUnits: undefined as unknown as number,
    })
    await expect(attempt).rejects.toMatchObject({ status: 400, message: 'Electricity units cannot be negative' })
    expect(await fetchReceipts({ leaseId: LEASE_ROOM_207 })).toHaveLength(0)
  })

  it('รับชำระใบที่ชำระแล้วซ้ำต้องได้ 409', async () => {
    const [paid] = await fetchReceipts({ status: 'PAID' })
    await expect(payReceipt(paid.id)).rejects.toMatchObject({
      status: 409,
      message: 'This receipt has already been paid',
    })
  })
})

/*
  SSK-23 คลังอุปกรณ์ mock ต้องทำตัวเหมือน SupplyService ของ backend ทุกข้อ ทั้งการออก SKU
  เพดาน maxStock การนับยอดเติมเป็นจำนวนชิ้น และ 409 ตอนลบของที่เคยถูกเบิก เพราะหน้าเว็บเอา
  detail ไปโชว์ในป็อปอัปตรง ๆ ถ้าสองฝั่งพูดไม่ตรงกัน ผู้ใช้จะเห็นคนละประโยคในสองโหมด
*/
describe('/api/supplies', () => {
  /** seed ของ mock ชุดเดียวกับ DevDataSeeder: LED Bulbs 60W, Air Filters 16x20x1, Copper Pipe Fittings */
  const LED_BULBS = 1
  const AIR_FILTERS = 2
  const COPPER_FITTINGS = 3

  function supplyBody(overrides: Partial<SupplyRequest> = {}): SupplyRequest {
    return {
      name: 'Shower Head',
      sku: null,
      category: 'Plumbing',
      stock: 5,
      minStock: 2,
      maxStock: 20,
      ...overrides,
    }
  }

  it('POST ไม่ส่ง SKU ได้รหัสที่ server ออกให้ตามหมวดกับ id และขึ้นในรายการที่เรียงตามชื่อ', async () => {
    const created = await createSupply(supplyBody())

    expect(created).toMatchObject({ id: 4, sku: 'PL-004', status: 'IN_STOCK', maxStock: 20 })
    expect((await fetchSupplies()).map((s) => s.name)).toEqual([
      'Air Filters 16x20x1',
      'Copper Pipe Fittings',
      'LED Bulbs 60W',
      'Shower Head',
    ])
  })

  it('รหัสที่ server ออกชนกับรหัสที่มีคนพิมพ์ไว้ ต่อท้าย -2 แทนการตอบ 409', async () => {
    await createSupply(supplyBody({ name: 'Typed code', sku: 'PL-005' }))

    // ชิ้นที่พิมพ์รหัสเองได้ id 4 ชิ้นถัดไปได้ id 5 ซึ่งรหัส PL-005 ถูกใช้ไปแล้ว
    expect((await createSupply(supplyBody())).sku).toBe('PL-005-2')
  })

  it('รหัสที่พิมพ์มาซ้ำกับของที่มีอยู่ต้องได้ 409 ข้อความเดียวกับ backend', async () => {
    await expect(createSupply(supplyBody({ sku: 'EL-001' }))).rejects.toMatchObject({
      status: 409,
      message: 'An item with this SKU already exists',
    })
  })

  it('400 ของฟอร์มใช้ประโยคเดียวกับ validateSupplyItem ทุกข้อ', async () => {
    await expect(createSupply(supplyBody({ category: '' }))).rejects.toMatchObject({
      status: 400,
      message: 'Please choose the category',
    })
    await expect(createSupply(supplyBody({ maxStock: -1 }))).rejects.toMatchObject({
      message: 'Maximum stock cannot be negative',
    })
    await expect(createSupply(supplyBody({ minStock: 50, maxStock: 20 }))).rejects.toMatchObject({
      message: 'Maximum stock cannot be lower than minimum stock',
    })
    // ตัวอย่างที่ QA เจอใน SSK-111 แก้ยอดเป็น 284 ทั้งที่เพดาน 200
    await expect(
      updateSupply(LED_BULBS, supplyBody({ name: 'LED Bulbs 60W', sku: 'EL-001', stock: 284, minStock: 50, maxStock: 200 })),
    ).rejects.toMatchObject({ message: 'Quantity cannot be higher than maximum stock' })
  })

  it('restock ศูนย์ ทศนิยม และเกินเพดาน ได้ 400 ประโยคเดียวกับ validateRestockQuantity', async () => {
    await expect(restockSupply(LED_BULBS, 0)).rejects.toMatchObject({
      status: 400,
      message: 'The restock amount must be greater than 0',
    })
    await expect(restockSupply(LED_BULBS, 2.5)).rejects.toMatchObject({
      message: 'The restock amount must be a whole number',
    })
    await expect(restockSupply(LED_BULBS, 139)).rejects.toMatchObject({
      message: 'Restocking 139 would bring the total to 284, above the maximum stock of 200',
    })
    // เติมจนเท่าเพดานพอดียังรับได้
    expect((await restockSupply(LED_BULBS, 55)).stock).toBe(200)
  })

  it('summary นับยอดเติมเป็นจำนวนชิ้น ไม่ใช่จำนวนครั้ง และของใกล้หมดตาม stock < minStock', async () => {
    expect(await fetchSupplySummary()).toEqual({ totalItems: 3, lowStockItems: 1, restockedThisWeek: 0 })

    await restockSupply(AIR_FILTERS, 20)
    await restockSupply(COPPER_FITTINGS, 5)

    // Air Filters 8 + 20 = 28 พ้นขั้นต่ำ 20 แล้ว
    expect(await fetchSupplySummary()).toEqual({ totalItems: 3, lowStockItems: 0, restockedThisWeek: 25 })
  })

  it('DELETE ของที่ยังไม่เคยถูกเบิกตอบ 204 และยอดเติมของชิ้นนั้นหายจากการ์ดด้วย', async () => {
    await restockSupply(COPPER_FITTINGS, 5)

    await deleteSupply(COPPER_FITTINGS)

    expect((await fetchSupplies()).map((s) => s.id)).not.toContain(COPPER_FITTINGS)
    expect(await fetchSupplySummary()).toMatchObject({ totalItems: 2, restockedThisWeek: 0 })
  })

  it('DELETE ของที่ใบแจ้งซ่อมเคยเบิกได้ 409 ที่บอกให้ตั้งจำนวนเป็นศูนย์แทน และของไม่มีได้ 404', async () => {
    await expect(deleteSupply(AIR_FILTERS)).rejects.toMatchObject({
      status: 409,
      message: 'This item has been used in maintenance tickets and cannot be deleted. Set its stock to 0 instead.',
    })
    await expect(deleteSupply(999)).rejects.toMatchObject({ status: 404, message: 'No supply with id 999' })
    expect(await fetchSupplies()).toHaveLength(3)
  })
})

/*
  SSK-20 รอบแจ้งเตือน mock ต้องทำตัวเหมือน ReminderService ของ backend ทุกข้อ ทั้งข้อความ error การคิด
  ครั้งถัดไปใหม่ตอนเปิดกลับ 409 ทั้งสองแบบ และ run-due ที่ไม่สร้างใบซ้ำ วันที่ใช้วันไทยเหมือน backend
*/
describe('/api/reminders', () => {
  function bangkokDate(offsetDays: number): string {
    return todayInBangkok(new Date(Date.now() + offsetDays * 86_400_000))
  }

  function reminderBody(overrides: Partial<ReminderRequest> = {}): ReminderRequest {
    return {
      name: 'Water Tank Cleaning',
      frequency: 'MONTHLY',
      startDate: bangkokDate(0),
      roomId: ROOM_101,
      remindTime: '09:00',
      notes: null,
      ...overrides,
    }
  }

  /** ครั้งแรกที่ยังไม่เลยวันนี้ เดินทีละเดือนจากวันที่หนีบแล้ว สูตรเดียวกับ backend */
  function firstMonthlyOnOrAfterToday(startDate: string): string {
    let next = startDate
    while (next < bangkokDate(0)) {
      next = addMonths(next, 1)
    }
    return next
  }

  it('POST เริ่มที่วันเริ่มเสมอ วันเริ่มย้อนหลังขึ้น overdue ทันที ห้องว่างคืองานของทั้งตึก', async () => {
    const created = await createReminder(reminderBody({ startDate: bangkokDate(-3), roomId: null, remindTime: null }))

    expect(created).toMatchObject({
      nextDueDate: bangkokDate(-3),
      overdue: true,
      active: true,
      roomId: null,
      roomNumber: null,
      remindTime: null,
      priority: 'MEDIUM',
      lastTriggeredAt: null,
    })
  })

  it('400 และ 404 ใช้ประโยคเดียวกับ backend ตามลำดับที่ backend ตรวจ', async () => {
    await expect(createReminder(reminderBody({ name: ' ' }))).rejects.toMatchObject({
      status: 400,
      message: 'Please enter the reminder name',
    })
    await expect(createReminder(reminderBody({ startDate: '' }))).rejects.toMatchObject({
      message: 'Please choose a start date',
    })
    await expect(
      createReminder(reminderBody({ frequency: 'WEEKLY' as ReminderRequest['frequency'] })),
    ).rejects.toMatchObject({ message: 'Frequency must be ONE_TIME, MONTHLY, QUARTERLY or ANNUAL' })
    await expect(createReminder(reminderBody({ roomId: 999 }))).rejects.toMatchObject({
      status: 404,
      message: 'No unit with id 999',
    })
    await expect(createReminder(reminderBody({ remindTime: '9 am' }))).rejects.toMatchObject({
      message: 'The reminder time must be in HH:MM format',
    })
  })

  it('PATCH ที่ไม่ได้บอกว่าจะเปิดหรือปิดได้ 400', async () => {
    await expect(setReminderActive(1, undefined as unknown as boolean)).rejects.toMatchObject({
      status: 400,
      message: 'Please say whether the reminder is active',
    })
  })

  it('พักแล้วเปิดกลับต้องข้ามรอบที่พลาดระหว่างพัก ไม่เด้งกลับมาเป็นเลยกำหนด', async () => {
    const startDate = bangkokDate(-40)
    const created = await createReminder(reminderBody({ startDate }))

    expect(await setReminderActive(created.id, false)).toMatchObject({ active: false, overdue: true })
    expect(await setReminderActive(created.id, true)).toMatchObject({
      active: true,
      overdue: false,
      nextDueDate: firstMonthlyOnOrAfterToday(startDate),
    })
  })

  it('run-due สร้างใบ RECURRING ให้รอบที่มีห้อง รอบของทั้งตึกแค่เลื่อน และเรียกซ้ำวันเดียวกันได้ 0', async () => {
    const yesterday = bangkokDate(-1)
    const withRoom = await createReminder(reminderBody({ startDate: yesterday }))
    const buildingWide = await createReminder(reminderBody({ name: 'Rooftop Check', startDate: yesterday, roomId: null }))

    expect(await runDueReminders()).toEqual({ createdTickets: 1 })

    const recurring = (await fetchMaintenanceLog()).filter((t) => t.source === 'RECURRING')
    expect(recurring).toEqual([
      expect.objectContaining({
        title: 'Water Tank Cleaning',
        roomNumber: '101',
        scheduledDate: yesterday,
        status: 'OPEN',
      }),
    ])
    const reminders = await fetchReminders()
    expect(reminders.find((r) => r.id === withRoom.id)).toMatchObject({ nextDueDate: addMonths(yesterday, 1) })
    expect(reminders.find((r) => r.id === buildingWide.id)).toMatchObject({ nextDueDate: addMonths(yesterday, 1) })

    expect(await runDueReminders()).toEqual({ createdTickets: 0 })
  })

  /*
    บั๊กเดิมที่ SSK-20 แก้ พักรอบที่ยิงไปแล้ว แก้ใบระหว่างพัก (ครั้งถัดไปกลับไปที่วันเริ่ม) แล้วเปิดกลับ
    ต้องไม่ทำให้ run-due สร้างใบของรอบเดิมซ้ำ
  */
  it('พัก แก้ใบ แล้วเปิดกลับ run-due ต้องไม่สร้างใบของรอบเดิมซ้ำ', async () => {
    const yesterday = bangkokDate(-1)
    const created = await createReminder(reminderBody({ startDate: yesterday }))
    await runDueReminders()

    await setReminderActive(created.id, false)
    const edited = await updateReminder(created.id, reminderBody({ startDate: yesterday, notes: 'Flush the drain too' }))
    expect(edited.nextDueDate).toBe(yesterday)
    expect((await setReminderActive(created.id, true)).nextDueDate).toBe(addMonths(yesterday, 1))

    expect(await runDueReminders()).toEqual({ createdTickets: 0 })
    expect((await fetchMaintenanceLog()).filter((t) => t.source === 'RECURRING')).toHaveLength(1)
  })

  it('ใบรอบเดียวที่ยิงแล้วเปิดกลับไม่ได้ จนกว่าจะเลื่อนวันเริ่มไปหลังวันที่ยิง', async () => {
    const today = bangkokDate(0)
    const created = await createReminder(reminderBody({ frequency: 'ONE_TIME', startDate: today }))
    await runDueReminders()
    expect((await fetchReminders()).find((r) => r.id === created.id)).toMatchObject({ active: false })

    await expect(setReminderActive(created.id, true)).rejects.toMatchObject({
      status: 409,
      message: `This one-time reminder already ran on ${today}. Change its start date before resuming it.`,
    })

    await updateReminder(created.id, reminderBody({ frequency: 'ONE_TIME', startDate: bangkokDate(7) }))
    expect(await setReminderActive(created.id, true)).toMatchObject({ active: true, nextDueDate: bangkokDate(7) })
  })

  it('DELETE รอบที่ไม่เคยสร้างใบแจ้งซ่อมได้ 204 รอบที่เคยสร้างแล้วได้ 409 และรอบที่ไม่มีได้ 404', async () => {
    // HVAC Inspection ในข้อมูลตัวอย่างเป็นงานของทั้งตึก ไม่เคยสร้างใบแจ้งซ่อม
    await deleteReminder(1)
    expect((await fetchReminders()).map((r) => r.id)).not.toContain(1)

    const created = await createReminder(reminderBody({ startDate: bangkokDate(-1) }))
    await runDueReminders()
    await expect(deleteReminder(created.id)).rejects.toMatchObject({
      status: 409,
      message: 'This reminder has already created maintenance tickets and cannot be deleted. Pause it instead.',
    })
    await expect(deleteReminder(999)).rejects.toMatchObject({ status: 404, message: 'No reminder with id 999' })
  })
})
