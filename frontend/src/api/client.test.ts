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
  sendReceipts,
  fetchBillingSchedule,
  updateBillingSchedule,
  addSupplyToTicket,
  createMaintenanceTicket,
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
  fetchBuildingConfig,
  createRoomRate,
  fetchRoomRates,
  fetchRoomRatesFrom,
  createExtraCharge,
  deleteExtraCharge,
  fetchExtraCharges,
  updateExtraCharge,
  fetchMeterReadings,
  importMeterReadings,
  fetchUsage,
  updateBuildingConfig,
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
import { SEED_LAYOUT, mockFetch, resetMockStore, setMockMailOutage } from './mockApi'
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
  // จำนวนอ่านจากผังตั้งต้นของ seed ไม่ฝัง 24 ไว้ ผังปรับได้แล้วตั้งแต่ SSK-160
  it('คืนห้องครบตามผังตั้งต้น ทุกชั้นมีจำนวนห้องเท่ากัน', async () => {
    const rooms = await fetchRooms()
    expect(rooms).toHaveLength(SEED_LAYOUT.floors * SEED_LAYOUT.roomsPerFloor)
    for (let floor = 1; floor <= SEED_LAYOUT.floors; floor += 1) {
      expect(rooms.filter((r) => r.floor === floor)).toHaveLength(SEED_LAYOUT.roomsPerFloor)
    }
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

  // SSK-140 Spring ไม่มี POST /api/rooms mock เคยรับ POST ไว้ให้ฟอร์ม Add Unit ที่ถอดไปแล้ว
  // เพิ่มห้องทำผ่าน PUT /api/building-config ทีเดียวทั้งผัง (SSK-160)
  // เช็คแค่ว่าไม่ผ่าน ไม่ล็อกรหัส เพราะ Spring ตอบ 405 ส่วน mock ตอบ 404
  it('ไม่มี POST /api/rooms เหมือนฝั่ง Spring', async () => {
    const before = (await fetchRooms()).length
    const res = await mockFetch('/rooms', {
      method: 'POST',
      body: JSON.stringify({ roomNumber: '301', floor: 3, roomType: 'SINGLE' }),
    })

    expect(res.ok).toBe(false)
    expect(await fetchRooms()).toHaveLength(before)
  })
})

describe('GET/PUT /api/building-config (SSK-160)', () => {
  it('ตอบผังตั้งต้นพร้อมจำนวนห้องที่มีจริง', async () => {
    const config = await fetchBuildingConfig()
    expect(config).toMatchObject({ ...SEED_LAYOUT, totalRooms: SEED_LAYOUT.floors * SEED_LAYOUT.roomsPerFloor })
    expect(config.updatedAt).toEqual(expect.any(String))
  })

  // AC ข้อ 1 และข้อ 3 ตั้ง 3 ชั้น ชั้นละ 10 ห้อง ได้ 30 ห้อง ข้อมูลเดิมยังอยู่ครบ
  it('ตั้ง 3 ชั้น ชั้นละ 10 ห้อง ได้ 30 ห้อง 3 ชั้น ห้องเดิมกับสัญญาเดิมไม่เปลี่ยน', async () => {
    const before = await fetchRooms()
    const leasesBefore = await fetchLeases()

    const config = await updateBuildingConfig({ floors: 3, roomsPerFloor: 10, newRoomType: 'DOUBLE' })

    expect(config).toMatchObject({ floors: 3, roomsPerFloor: 10, totalRooms: 30 })
    const rooms = await fetchRooms()
    expect(rooms).toHaveLength(30)
    expect([...new Set(rooms.map((r) => r.floor))]).toEqual([1, 2, 3])
    expect(rooms.map((r) => r.roomNumber)).toEqual([
      ...['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'],
      ...['201', '202', '203', '204', '205', '206', '207', '208', '209', '210'],
      ...['301', '302', '303', '304', '305', '306', '307', '308', '309', '310'],
    ])
    // ห้องใหม่ได้ประเภทที่เลือก ห้องเดิมคง id และประเภทเดิม
    expect(rooms.filter((r) => r.floor === 3).every((r) => r.roomType === 'DOUBLE')).toBe(true)
    const kept = before.filter((r) => rooms.some((after) => after.roomNumber === r.roomNumber))
    for (const room of kept) {
      expect(findRoom(rooms, room.roomNumber)).toMatchObject({ id: room.id, roomType: room.roomType, status: room.status })
    }
    expect(new Set(rooms.map((r) => r.id)).size).toBe(30)
    expect(await fetchLeases()).toEqual(leasesBefore)
  })

  // AC ข้อ 2 ห้องที่มีสัญญา ACTIVE ลดออกไม่ได้ ตอบ 409 และไม่เปลี่ยนอะไรเลยแม้แต่ห้องที่ลบได้
  it('ลดผังจนต้องลบห้องที่มีสัญญา ACTIVE ได้ 409 บอกเลขห้อง และไม่เปลี่ยนอะไร', async () => {
    const attempt = updateBuildingConfig({ floors: 2, roomsPerFloor: 9, newRoomType: 'SINGLE' })

    await expect(attempt).rejects.toMatchObject({
      status: 409,
      message: 'Unit 110 has lease or maintenance history and cannot be removed. Nothing was changed.',
    })
    expect(await fetchRooms()).toHaveLength(24)
    expect(await fetchBuildingConfig()).toMatchObject(SEED_LAYOUT)
  })

  // คอมเมนต์ใน SSK-160 จาก SSK-180 สัญญาที่ปิดแล้ว (ENDED) ก็นับเป็นประวัติ ลบไม่ได้เหมือนกัน
  it('ห้องที่มีแค่สัญญาที่ปิดแล้วหรือใบแจ้งซ่อมก็ลบไม่ได้', async () => {
    const attempt = updateBuildingConfig({ floors: 1, roomsPerFloor: 2, newRoomType: 'SINGLE' })

    await expect(attempt).rejects.toMatchObject({ status: 409 })
    await attempt.catch((error: unknown) => {
      // 103 มีแค่สัญญา ENDED, 104 มีแค่ใบแจ้งซ่อม
      expect((error as ApiError).message).toContain('103')
      expect((error as ApiError).message).toContain('104')
      expect((error as ApiError).message).not.toContain('105')
    })
    expect(await fetchRooms()).toHaveLength(24)
  })

  it('ลดผังที่ตัดเฉพาะห้องว่างไม่มีประวัติได้', async () => {
    const config = await updateBuildingConfig({ floors: 2, roomsPerFloor: 10, newRoomType: 'SINGLE' })

    expect(config.totalRooms).toBe(20)
    const numbers = (await fetchRooms()).map((r) => r.roomNumber)
    expect(numbers).not.toContain('111')
    expect(numbers).not.toContain('212')
  })

  it('ค่าที่อยู่นอกช่วงตอบ 400 พร้อมข้อความเดียวกับฟอร์ม', async () => {
    await expect(updateBuildingConfig({ floors: 0, roomsPerFloor: 10, newRoomType: 'SINGLE' })).rejects.toMatchObject({
      status: 400,
      message: 'Number of floors must be a whole number from 1 to 50',
    })
    await expect(updateBuildingConfig({ floors: 2, roomsPerFloor: 100, newRoomType: 'SINGLE' })).rejects.toMatchObject({
      status: 400,
      message: 'Rooms per floor must be a whole number from 1 to 99',
    })
  })

  // AC ข้อ 4 กฎสัญญาห้ามทับช่วงเวลายังใช้กับห้องที่เพิ่งเพิ่ม
  it('ห้องที่เพิ่มใหม่ทำสัญญาได้ และสัญญาที่ทับช่วงกันในห้องนั้นยังโดน 409', async () => {
    await updateBuildingConfig({ floors: 3, roomsPerFloor: 12, newRoomType: 'SINGLE' })
    const room301 = findRoom(await fetchRooms(), '301')
    const start = todayInBangkok()

    const lease = await createLease({ roomId: room301.id, tenantId: 6, startDate: start, endDate: null, billingCycle: 'MONTHLY' })
    expect(lease).toMatchObject({ roomNumber: '301', floor: 3, roomType: 'SINGLE' })
    expect(findRoom(await fetchRooms(), '301').status).toBe('OCCUPIED')

    const clash = createLease({ roomId: room301.id, tenantId: 5, startDate: start, endDate: null, billingCycle: 'MONTHLY' })
    await expect(clash).rejects.toSatisfy(isOverlapError)
  })
})

describe('สำเนาห้องในสัญญา (SSK-160 ร่วมกับ SSK-180)', () => {
  it('สัญญาเก็บเลขห้อง ชั้น และประเภทห้อง ณ วันทำสัญญา', async () => {
    const [lease] = await fetchLeases({ roomId: ROOM_102 })
    expect(lease).toMatchObject({ roomNumber: '102', floor: 1, roomType: 'DOUBLE' })
  })

  it('แก้สัญญาแล้วสำเนาห้องยังเป็นค่าเดิม', async () => {
    const [lease] = await fetchLeases({ roomId: ROOM_102 })
    const updated = await updateLease(lease.id, {
      roomId: lease.roomId,
      tenantId: lease.tenantId,
      startDate: lease.startDate,
      endDate: lease.endDate,
      billingCycle: lease.billingCycle,
    })
    expect(updated).toMatchObject({ roomNumber: '102', floor: 1, roomType: 'DOUBLE' })
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
  SSK-143 ส่งใบเสร็จทางอีเมล mock ต้องทำตัวเหมือน ReceiptDispatchService ฝั่ง backend ทุกข้อ
  ใบที่ 2 ของ mock คือใบค้างของ Kenji Sato (tenant id 2, kenji.s@example.com)
*/
describe('/api/receipts/send (SSK-143)', () => {
  const KENJI_RECEIPT = 2
  const KENJI = { fullName: 'Kenji Sato', phone: '082-345-6789', nationalId: '1100400234561' }

  async function kenjiReceipt() {
    const receipt = (await fetchReceipts()).find((r) => r.id === KENJI_RECEIPT)
    if (!receipt) {
      throw new Error('Kenji receipt missing from the mock seed')
    }
    return receipt
  }

  it('ส่งแล้วตอบรายการ sent และใบถูกบันทึกว่าส่งแล้วหนึ่งครั้ง', async () => {
    const result = await sendReceipts([KENJI_RECEIPT])

    expect(result.skipped).toEqual([])
    expect(result.sent).toEqual([
      expect.objectContaining({
        receiptId: KENJI_RECEIPT,
        receiptNo: 'RC-2026-0002',
        tenantName: 'Kenji Sato',
        email: 'kenji.s@example.com',
        sentCount: 1,
      }),
    ])
    const saved = await kenjiReceipt()
    expect(saved.sentCount).toBe(1)
    expect(saved.lastSentAt).toBe(result.sent[0].sentAt)
  })

  it('ส่งซ้ำได้และนับเพิ่ม ส่วน id ซ้ำในคำขอเดียวนับเป็นใบเดียว', async () => {
    await sendReceipts([KENJI_RECEIPT])
    const again = await sendReceipts([KENJI_RECEIPT, KENJI_RECEIPT])

    expect(again.sent).toHaveLength(1)
    expect(again.sent[0].sentCount).toBe(2)
    expect((await kenjiReceipt()).sentCount).toBe(2)
  })

  it('ใบเสร็จบอกอีเมลปัจจุบันของผู้เช่า แก้อีเมลแล้วใบเดิมเห็นอีเมลใหม่ทันที', async () => {
    expect((await kenjiReceipt()).tenantEmail).toBe('kenji.s@example.com')

    await updateTenant(2, { ...KENJI, email: 'kenji.new@example.com' })

    expect((await kenjiReceipt()).tenantEmail).toBe('kenji.new@example.com')
  })

  it('ผู้เช่าไม่มีอีเมลถูกข้ามด้วย NO_EMAIL และใบไม่ถูกนับว่าส่งแล้ว', async () => {
    await updateTenant(2, { ...KENJI, email: null })

    const result = await sendReceipts([KENJI_RECEIPT])

    expect(result.sent).toEqual([])
    expect(result.skipped).toEqual([
      { receiptId: KENJI_RECEIPT, receiptNo: 'RC-2026-0002', tenantName: 'Kenji Sato', reason: 'NO_EMAIL' },
    ])
    expect(await kenjiReceipt()).toMatchObject({ tenantEmail: null, sentCount: 0, lastSentAt: null })
  })

  it('ไม่เลือกใบเลยได้ 400 และเกิน 100 ใบก็ได้ 400 ข้อความเดียวกับ backend', async () => {
    await expect(sendReceipts([])).rejects.toMatchObject({
      status: 400,
      message: 'Please choose at least one receipt',
    })
    const hundredAndOne = Array.from({ length: 101 }, (_, i) => i + 1)
    await expect(sendReceipts(hundredAndOne)).rejects.toMatchObject({
      status: 400,
      message: 'You can send at most 100 receipts at a time',
    })
  })

  it('มีใบที่ไม่พบได้ 404 และไม่มีใบไหนถูกส่ง', async () => {
    await expect(sendReceipts([KENJI_RECEIPT, 999])).rejects.toMatchObject({
      status: 404,
      message: 'No receipt with id 999',
    })
    expect((await kenjiReceipt()).sentCount).toBe(0)
  })

  it('เมลเซิร์ฟเวอร์ล่มได้ 503 ข้อความเดียวกับ backend และไม่มีใบไหนถูกนับว่าส่งแล้ว', async () => {
    setMockMailOutage(true)

    await expect(sendReceipts([KENJI_RECEIPT])).rejects.toMatchObject({
      status: 503,
      message: 'The mail server is not reachable. Please try again later',
    })
    expect((await kenjiReceipt()).sentCount).toBe(0)
  })
})

/*
  SSK-143 ค่าตั้งเวลาเตือนใบค้างรายเดือน mock ต้องทำตัวเหมือน BillingScheduleService ของ backend
  ทั้งค่าตั้งต้นของ V15 ข้อความ 400 และการเก็บเวลาแค่ระดับนาที
*/
describe('/api/billing-schedule (SSK-143)', () => {
  it('ค่าตั้งต้นปิดไว้ วันที่ 25 เวลา 09:00 ไม่มีรอบถัดไปและยังไม่เคยรัน', async () => {
    expect(await fetchBillingSchedule()).toMatchObject({
      enabled: false,
      dayOfMonth: 25,
      sendTime: '09:00',
      nextRunAt: null,
      lastRun: null,
    })
  })

  it('บันทึกแล้วอ่านกลับได้ค่าเดิม เวลาเหลือแค่ระดับนาที และได้รอบถัดไปวันที่ 22 เวลา 10:30 ไทย', async () => {
    const saved = await updateBillingSchedule({ enabled: true, dayOfMonth: 22, sendTime: '10:30:59' })

    expect(saved).toMatchObject({ enabled: true, dayOfMonth: 22, sendTime: '10:30' })
    expect(saved.nextRunAt).toMatch(/^\d{4}-\d{2}-22T03:30:00\.000Z$/)
    expect(await fetchBillingSchedule()).toMatchObject({ enabled: true, dayOfMonth: 22, sendTime: '10:30' })
  })

  it('ค่าที่ผิดได้ 400 ข้อความเดียวกับ backend และค่าเดิมไม่เปลี่ยน', async () => {
    await expect(updateBillingSchedule({ enabled: true, dayOfMonth: 32, sendTime: '09:00' })).rejects.toMatchObject({
      status: 400,
      message: 'Billing day must be between 1 and 31',
    })
    await expect(updateBillingSchedule({ enabled: true, dayOfMonth: 25, sendTime: '25:00' })).rejects.toMatchObject({
      status: 400,
      message: 'The send time must be in HH:MM format',
    })
    expect(await fetchBillingSchedule()).toMatchObject({ enabled: false, dayOfMonth: 25 })
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
  SSK-154 เบิกของเข้าใบแจ้งซ่อม mock ต้องทำตัวเหมือน MaintenanceService.consume ทุกข้อ ทั้งข้อความ error
  และการทำทั้งหมดใน transaction เดียว ไม่งั้นเทสหน้าเว็บจะผ่านกับ mock ทั้งที่ของจริงพัง (บทเรียน SSK-139)
  ใบ id 1 ของ mock คือใบห้อง 106 ที่เบิก Air Filters ไปแล้ว 1 ชิ้น
*/
describe('SSK-154 เบิกของเข้าใบแจ้งซ่อม', () => {
  const LED_BULBS = 1
  const AIR_FILTERS = 2
  const COPPER_FITTINGS = 3
  const AC_TICKET = 1

  async function stockOf(id: number): Promise<number | undefined> {
    return (await fetchSupplies()).find((s) => s.id === id)?.stock
  }

  it('สร้างใบพร้อม suppliesUsed แล้วสต็อกถูกตัด และใบตอบรายการของที่เบิกพร้อมชื่อ', async () => {
    const ticket = await createMaintenanceTicket({
      roomId: ROOM_101,
      title: 'Replace hallway bulbs',
      suppliesUsed: [{ supplyId: LED_BULBS, quantity: 2 }],
    })

    expect(ticket.suppliesUsed).toEqual([{ supplyId: LED_BULBS, name: 'LED Bulbs 60W', quantity: 2 }])
    expect(await stockOf(LED_BULBS)).toBe(143)
  })

  it('ของชิ้นหลังไม่พอ ใบไม่ถูกสร้าง และของชิ้นแรกไม่ถูกตัด เพราะทั้งหมดอยู่ใน transaction เดียว', async () => {
    const before = (await fetchMaintenanceLog()).length

    const attempt = createMaintenanceTicket({
      roomId: ROOM_101,
      title: 'Service the AC',
      suppliesUsed: [
        { supplyId: LED_BULBS, quantity: 2 },
        { supplyId: AIR_FILTERS, quantity: 9 },
      ],
    })

    await expect(attempt).rejects.toMatchObject({
      status: 400,
      message: 'Not enough Air Filters 16x20x1 in stock (only 8 left)',
    })
    expect(await fetchMaintenanceLog()).toHaveLength(before)
    expect(await stockOf(LED_BULBS)).toBe(145)
    expect(await stockOf(AIR_FILTERS)).toBe(8)
  })

  it('จำนวนไม่ถูก ไม่ได้เลือกของ หรือของไม่มีในคลัง ได้ข้อความเดียวกับ backend', async () => {
    const create = (supplyId: unknown, quantity: unknown) =>
      createMaintenanceTicket({
        roomId: ROOM_101,
        title: 'Fix the sink',
        suppliesUsed: [{ supplyId, quantity } as { supplyId: number; quantity: number }],
      })

    await expect(create(COPPER_FITTINGS, 0)).rejects.toMatchObject({
      status: 400,
      message: 'The quantity used must be greater than 0',
    })
    await expect(create(null, 1)).rejects.toMatchObject({ status: 400, message: 'Please choose the item' })
    await expect(create(999, 1)).rejects.toMatchObject({ status: 404, message: 'No supply with id 999' })
  })

  it('POST /maintenance/{id}/supplies เบิกเพิ่มทีละรายการ ตอบใบทั้งใบ รายการต่อท้ายของเดิม', async () => {
    const ticket = await addSupplyToTicket(AC_TICKET, COPPER_FITTINGS, 2)

    expect(ticket.id).toBe(AC_TICKET)
    expect(ticket.suppliesUsed).toEqual([
      { supplyId: AIR_FILTERS, name: 'Air Filters 16x20x1', quantity: 1 },
      { supplyId: COPPER_FITTINGS, name: 'Copper Pipe Fittings', quantity: 2 },
    ])
    expect(await stockOf(COPPER_FITTINGS)).toBe(83)
    // GET ต้องเห็นรายการเดียวกัน ไม่ใช่แค่ response ของ POST
    const reloaded = (await fetchMaintenanceLog()).find((t) => t.id === AC_TICKET)
    expect(reloaded?.suppliesUsed).toHaveLength(2)
  })

  it('เบิกเพิ่มเกินสต็อกหรือเข้าใบที่ไม่มี ไม่ตัดสต็อก', async () => {
    await expect(addSupplyToTicket(AC_TICKET, AIR_FILTERS, 9)).rejects.toMatchObject({
      status: 400,
      message: 'Not enough Air Filters 16x20x1 in stock (only 8 left)',
    })
    await expect(addSupplyToTicket(999, AIR_FILTERS, 1)).rejects.toMatchObject({
      status: 404,
      message: 'No maintenance ticket with id 999',
    })
    expect(await stockOf(AIR_FILTERS)).toBe(8)
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

  /*
    ด่านสุดท้ายของ run-due ใบรอบเดียวที่ยิงไปแล้วถูกเลื่อนวันเริ่มเพื่อเปิดกลับ แล้วระหว่างที่เปิดอยู่มีคนแก้วันเริ่ม
    กลับไปเป็นวันที่ยิงไปแล้ว ครั้งถัดไปจึงตกที่รอบที่มีใบแจ้งซ่อมอยู่แล้ว run-due ต้องข้ามการสร้างใบซ้ำ
    ไม่ใช่สร้างใบที่สองให้รอบเดิม (ฝั่งจริงจะไปชน unique index แล้วงานทั้งชุดล้ม)
  */
  it('run-due ข้ามรอบที่มีใบแจ้งซ่อมอยู่แล้ว แม้ครั้งถัดไปถูกแก้กลับไปที่รอบนั้น', async () => {
    const today = bangkokDate(0)
    const created = await createReminder(reminderBody({ frequency: 'ONE_TIME', startDate: today }))
    await runDueReminders()
    await updateReminder(created.id, reminderBody({ frequency: 'ONE_TIME', startDate: bangkokDate(7) }))
    await setReminderActive(created.id, true)

    const movedBack = await updateReminder(created.id, reminderBody({ frequency: 'ONE_TIME', startDate: today }))
    expect(movedBack).toMatchObject({ active: true, nextDueDate: today })

    expect(await runDueReminders()).toEqual({ createdTickets: 0 })
    expect((await fetchMaintenanceLog()).filter((t) => t.source === 'RECURRING')).toHaveLength(1)
    // รอบเดียวของมันทำไปแล้ว ระบบปิดสวิตช์ให้เหมือนยิงตามปกติ
    expect((await fetchReminders()).find((r) => r.id === created.id)).toMatchObject({ active: false })
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

describe('GET/POST /api/rooms/{id}/rates (SSK-162)', () => {
  const rate = {
    effectiveFrom: '2099-12',
    monthlyRent: 5000,
    electricRatePerUnit: 9,
    waterRatePerUnit: 20,
    commonAreaFee: 350,
    internetFee: 300,
  }

  it('records rates per unit without touching other units', async () => {
    await createRoomRate(ROOM_101, { ...rate, note: '  Renovated  ' })

    expect(await fetchRoomRates(ROOM_101)).toEqual([
      expect.objectContaining({ roomId: ROOM_101, effectiveFrom: '2099-12', note: 'Renovated' }),
    ])
    expect(await fetchRoomRates(ROOM_102)).toEqual([])
    expect(await fetchRoomRatesFrom('2099-01')).toHaveLength(1)
  })

  // AC: room 101 at 8/unit until Nov, 9/unit from Dec. Under the SSK-180 rule this means
  // a contract signed in Nov keeps 8 and a contract signed from Dec gets 9.
  it('locks the rate in effect at the contract start month', async () => {
    await createRoomRate(ROOM_101, { ...rate, effectiveFrom: '2099-11', electricRatePerUnit: 8 })
    await createRoomRate(ROOM_101, { ...rate, effectiveFrom: '2099-12', electricRatePerUnit: 9 })

    const november = await createLease({
      roomId: ROOM_101, tenantId: 6, startDate: '2099-11-01', endDate: '2099-11-30', billingCycle: 'MONTHLY',
    })
    const december = await createLease({
      roomId: ROOM_101, tenantId: 6, startDate: '2099-12-01', endDate: '2099-12-31', billingCycle: 'MONTHLY',
    })
    expect(november.electricRatePerUnit).toBe(8)
    expect(december.electricRatePerUnit).toBe(9)
    expect(december.monthlyRent).toBe(5000)
  })

  it('rejects a second rate for the same month and invalid values', async () => {
    await createRoomRate(ROOM_101, rate)
    await expect(createRoomRate(ROOM_101, rate)).rejects.toMatchObject({ status: 409 })
    await expect(createRoomRate(ROOM_101, { ...rate, effectiveFrom: '2099-13' })).rejects.toMatchObject({
      status: 400,
      message: 'Please choose the month the rate starts (YYYY-MM)',
    })
  })

  // AC: a rate back-dated into a month that already has a bill is refused
  it('rejects a rate that starts in a month already billed for that unit', async () => {
    const [receipt] = (await fetchReceipts()).filter((r) => r.roomNumber === '102')
    await expect(createRoomRate(ROOM_102, { ...rate, effectiveFrom: receipt.billingMonth })).rejects.toMatchObject({
      status: 409,
      message: `A bill for ${receipt.billingMonth} or later has already been issued for this unit. Choose a later month.`,
    })
  })
})

describe('extra charges per room (SSK-165)', () => {
  /** YYYY-MM offset from this month (Bangkok time) */
  function monthOffset(offset: number): string {
    const [y, m] = todayInBangkok().split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + offset, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const ROOM_105 = 5

  async function leaseFromThreeMonthsAgo() {
    return createLease({
      roomId: ROOM_105, tenantId: 6, startDate: `${monthOffset(-3)}-01`, endDate: null, billingCycle: 'MONTHLY',
    })
  }
  async function bill(leaseId: number, month: string) {
    return createReceipt({ leaseId, billingMonth: month, electricUnits: 0, waterUnits: 0, dueDate: null })
  }

  // AC 1: parking 500/month shows on the next bill and adds 500 to the total
  it('bills a monthly charge on every bill of a contract signed after it was set', async () => {
    const parking = await createExtraCharge(ROOM_105, {
      label: 'Parking space', amount: 500, recurrence: 'MONTHLY', startMonth: monthOffset(-3), endMonth: null, active: true,
    })
    const lease = await leaseFromThreeMonthsAgo()
    expect(lease.extraCharges).toEqual([expect.objectContaining({ chargeId: parking.id, amount: 500 })])

    const first = await bill(lease.id, monthOffset(-2))
    const second = await bill(lease.id, monthOffset(-1))
    for (const receipt of [first, second]) {
      expect(receipt.items.at(-1)).toMatchObject({ item: 'Parking space', amount: 500, chargeId: parking.id })
    }
    const base = first.items.slice(0, 5).reduce((sum, row) => sum + row.amount, 0)
    expect(first.totalAmount).toBe(base + 500)
  })

  // AC 2: a one-time charge is billed on the first bill only
  it('bills a one-time charge once', async () => {
    await createExtraCharge(ROOM_105, {
      label: 'Key card', amount: 200, recurrence: 'ONE_TIME', startMonth: monthOffset(-3), endMonth: null, active: true,
    })
    const lease = await leaseFromThreeMonthsAgo()

    expect((await bill(lease.id, monthOffset(-2))).items.map((i) => i.item)).toContain('Key card')
    expect((await bill(lease.id, monthOffset(-1))).items.map((i) => i.item)).not.toContain('Key card')
  })

  // AC 3: deactivating stops new bills but issued bills keep the line
  it('stops charging after the charge is deactivated, without changing issued bills', async () => {
    const parking = await createExtraCharge(ROOM_105, {
      label: 'Parking space', amount: 500, recurrence: 'MONTHLY', startMonth: monthOffset(-3), endMonth: null, active: true,
    })
    const lease = await leaseFromThreeMonthsAgo()
    const issued = await bill(lease.id, monthOffset(-2))

    await updateExtraCharge(ROOM_105, parking.id, {
      label: 'Parking space', amount: 500, recurrence: 'MONTHLY', startMonth: monthOffset(-3), endMonth: null, active: false,
    })

    expect((await bill(lease.id, monthOffset(-1))).items.map((i) => i.item)).not.toContain('Parking space')
    const [again] = (await fetchReceipts({ leaseId: lease.id })).filter((r) => r.id === issued.id)
    expect(again.items.map((i) => i.item)).toContain('Parking space')
    // it was used in a contract and a bill, so it can only be deactivated, not deleted
    await expect(deleteExtraCharge(ROOM_105, parking.id)).rejects.toMatchObject({ status: 409 })
  })

  // SSK-180 comment: a contract signed before the charge existed is not charged
  it('does not charge a contract signed before the charge was added', async () => {
    const lease = await leaseFromThreeMonthsAgo()
    await createExtraCharge(ROOM_105, {
      label: 'Parking space', amount: 500, recurrence: 'MONTHLY', startMonth: monthOffset(-3), endMonth: null, active: true,
    })

    const receipt = await bill(lease.id, monthOffset(-1))
    expect(receipt.items).toHaveLength(5)
    expect((await fetchExtraCharges()).map((c) => c.label)).toEqual(['Parking space'])
  })

  it('rejects a charge without a description or with a negative amount', async () => {
    const valid = { label: 'Parking', amount: 500, recurrence: 'MONTHLY' as const, startMonth: monthOffset(0), endMonth: null, active: true }
    await expect(createExtraCharge(ROOM_105, { ...valid, label: '  ' })).rejects.toMatchObject({
      status: 400, message: 'Please describe the charge',
    })
    await expect(createExtraCharge(ROOM_105, { ...valid, amount: -1 })).rejects.toMatchObject({
      status: 400, message: 'Amount cannot be negative',
    })
  })
})

describe('meter readings CSV import (SSK-166)', () => {
  const HEADER = 'room_number,month,electric_units,water_units'
  function csv(lines: string[]): File {
    return new File([[HEADER, ...lines].join('\n')], 'usage.csv', { type: 'text/csv' })
  }

  // AC 1: a 24-row sample imports completely with the values from the file
  it('imports every unit in the sample file', async () => {
    const rooms = await fetchRooms()
    const lines = rooms.map((r, i) => `${r.roomNumber},2099-01,${100 + i},${10 + i / 2}`)

    const dry = await importMeterReadings(csv(lines), true)
    expect(dry).toMatchObject({ dryRun: true, imported: 0, errors: [] })
    expect(dry.rows).toHaveLength(rooms.length)
    expect(await fetchMeterReadings('2099-01')).toEqual([])

    const done = await importMeterReadings(csv(lines), false)
    expect(done).toMatchObject({ dryRun: false, imported: rooms.length, skipped: 0 })
    const saved = await fetchMeterReadings('2099-01')
    expect(saved).toHaveLength(rooms.length)
    expect(saved.find((r) => r.roomNumber === '101')).toMatchObject({ electricUnits: 100, waterUnits: 10, source: 'CSV' })
  })

  // AC 2: only the valid rows are saved when the user confirms
  it('saves only the valid rows of a file with problems', async () => {
    const report = await importMeterReadings(csv(['101,2099-01,1,1', '999,2099-01,1,1', '102,bad,1,1', '103,2099-01,-1,1']), false)
    expect(report.imported).toBe(1)
    expect(report.errors.map((e) => e.line)).toEqual([3, 4, 5])
    expect((await fetchMeterReadings('2099-01')).map((r) => r.roomNumber)).toEqual(['101'])
  })

  // AC 5: importing again without overwrite leaves the old values alone
  it('skips existing readings unless asked to overwrite', async () => {
    await importMeterReadings(csv(['101,2099-01,50,5']), false)

    const skipped = await importMeterReadings(csv(['101,2099-01,99,9']), false)
    expect(skipped).toMatchObject({ imported: 0, skipped: 1 })
    expect((await fetchMeterReadings('2099-01'))[0]).toMatchObject({ electricUnits: 50 })

    await importMeterReadings(csv(['101,2099-01,99,9']), false, true)
    expect((await fetchMeterReadings('2099-01'))[0]).toMatchObject({ electricUnits: 99, waterUnits: 9 })
  })

  // AC 3
  it('rejects a file with the wrong header', async () => {
    const wrong = new File(['room,month,a,b\n101,2099-01,1,1'], 'x.csv')
    await expect(importMeterReadings(wrong, true)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/header/) })
  })
})

describe('GET /api/usage (SSK-167)', () => {
  it('sums the floor from the per-room readings', async () => {
    await importMeterReadings(
      new File(['room_number,month,electric_units,water_units\n201,2099-01,10,1\n202,2099-01,15.5,2\n101,2099-01,99,9\n'], 'u.csv'),
      false,
    )
    const points = await fetchUsage({ metric: 'electric', scope: 'floor', floor: 2, granularity: 'month', from: '2099-01', to: '2099-03' })
    expect(points).toEqual([
      { period: '2099-01', scopeId: '2', units: 25.5 },
      { period: '2099-02', scopeId: '2', units: 0 },
      { period: '2099-03', scopeId: '2', units: 0 },
    ])
  })

  // AC 4: floors added with the building layout (SSK-160) work without code changes
  it('answers for a floor added through the building layout', async () => {
    await updateBuildingConfig({ floors: 3, roomsPerFloor: 12, newRoomType: 'SINGLE' })
    await importMeterReadings(new File(['room_number,month,electric_units,water_units\n301,2099-01,40,4\n'], 'u.csv'), false)
    const [point] = await fetchUsage({ metric: 'water', scope: 'floor', floor: 3, granularity: 'year', from: '2099-01', to: '2099-12' })
    expect(point).toEqual({ period: '2099', scopeId: '3', units: 4 })
  })

  it('has usage for a month that was billed', async () => {
    const receipt = (await fetchReceipts()).find((r) => r.roomNumber === '201')!
    const room201 = findRoom(await fetchRooms(), '201')
    const points = await fetchUsage({
      metric: 'electric', scope: 'room', roomId: room201.id, granularity: 'month', from: receipt.billingMonth, to: receipt.billingMonth,
    })
    expect(points[0].units).toBeGreaterThan(0)
  })

  it('rejects an unknown metric or a backwards range', async () => {
    await expect(fetchUsage({ metric: 'gas' as never, scope: 'building', granularity: 'month', from: '2099-01', to: '2099-02' })).rejects.toMatchObject({ status: 400 })
    await expect(fetchUsage({ metric: 'water', scope: 'building', granularity: 'month', from: '2099-03', to: '2099-02' })).rejects.toMatchObject({ status: 400 })
  })
})
