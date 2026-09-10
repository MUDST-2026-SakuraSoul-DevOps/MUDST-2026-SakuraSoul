import { beforeEach, describe, expect, it } from 'vitest'
import {
  ApiError,
  createLease,
  updateRoomStatus,
  fetchLeases,
  fetchRooms,
  isOverlapError,
  terminateLease,
  updateLease,
} from './client'
import { resetMockStore } from './mockApi'
import type { RoomSummary } from './types'

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
    throw new Error(`ไม่พบห้อง ${roomNumber} ในผลลัพธ์`)
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
    expect(room.currentLease?.tenantName).toBe('ยูกิ ทานากะ')
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
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    const room = findRoom(await fetchRooms(), '101')
    expect(room.status).toBe('OCCUPIED')
    expect(room.currentLease?.tenantName).toBe('ธนกฤต วัฒนชัย')
  })

  // US-05-S1 เคสสำคัญที่สุดของ story นี้
  it('สร้างสัญญาทับช่วงเวลาที่ห้องมีคนอยู่แล้ว ต้องโดนปฏิเสธด้วย 409', async () => {
    const attempt = createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(90),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect(isOverlapError(error)).toBe(true)
      // ข้อความต้องบอกว่าไม่ว่างช่วงไหน ไม่ใช่แค่ว่า "ผิดพลาด"
      expect((error as ApiError).message).toContain('102')
      expect((error as ApiError).message).toContain('ไม่ว่าง')
    })
  })

  it('ข้อมูลไม่ถูกสร้างขึ้นเลยเมื่อโดนปฏิเสธ', async () => {
    const before = await fetchLeases()
    await createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(90),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    }).catch(() => undefined)
    expect(await fetchLeases()).toHaveLength(before.length)
  })

  it('วันจบมาก่อนวันเริ่ม ต้องโดนปฏิเสธด้วย 400 ไม่ใช่ 409', async () => {
    await createLease({
      roomId: ROOM_106,
      tenantId: 6,
      startDate: isoDate(30),
      endDate: isoDate(10),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    }).catch((error: unknown) => {
      expect((error as ApiError).status).toBe(400)
    })
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
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    // แล้วดึงวันเริ่มถอยกลับมาให้ชนกับสัญญาเดิมที่ยัง active อยู่
    const attempt = updateLease(future.id, {
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(-10),
      endDate: isoDate(400),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect(isOverlapError(error)).toBe(true)
    })
  })

  it('แก้สัญญาโดยไม่เปลี่ยนวันที่ ต้องบันทึกได้ ไม่ฟ้องว่าชนกับตัวเอง', async () => {
    const active = (await fetchLeases({ status: 'ACTIVE' })).find((l) => l.roomNumber === '102')
    const updated = await updateLease(active!.id, {
      roomId: active!.roomId,
      tenantId: active!.tenantId,
      startDate: active!.startDate,
      endDate: active!.endDate,
      monthlyRent: 4000,
      billingCycle: 'MONTHLY',
    })
    expect(updated.monthlyRent).toBe(4000)
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
    await updateRoomStatus(ROOM_101, 'OCCUPIED' as 'AVAILABLE').catch((error: unknown) => {
      expect((error as ApiError).status).toBe(400)
    })
    expect(findRoom(await fetchRooms(), '101').status).toBe('AVAILABLE')
  })
})
