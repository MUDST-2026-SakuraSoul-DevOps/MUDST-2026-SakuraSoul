import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchRoom, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { RoomSummary } from '../api/types'
import { RoomStatusDialog } from './RoomStatusDialog'

/**
 * เทสชุดนี้มาจากที่ QA ขอไว้ตอนรีวิว SSK-21 สองข้อ
 *
 * ข้อแรกคือขอให้ยืนยันว่าปิดงานซ่อมแล้วห้องที่ยังมีผู้เช่าอยู่จะไม่กลายเป็น
 * ห้องว่าง เพราะถ้ากลายเป็นว่างจริงจะปล่อยเช่าซ้อนได้ ซึ่งพัง US-05 ที่ติด
 * tag critical ไว้ เคส "ปิดงานซ่อมห้องที่มีผู้เช่า" ข้างล่างคือคำตอบของข้อนั้น
 *
 * ข้อสองคือ dialog นี้ยังไม่มีเทสทั้งที่มี logic แตกสองทางและกระทบ US-05
 *
 * ที่เทสยิงผ่าน mock ได้ตรงประเด็น เพราะ mock เก็บ underMaintenance เป็นธงแยก
 * ไม่ได้ทับสถานะที่คำนวณจากสัญญา ซึ่งเป็นพฤติกรรมเดียวกับที่เขียนสั่ง backend
 * ไว้ใน docs/api-contract-lease.md ว่าให้เก็บเป็นคอลัมน์ under_maintenance
 * ห้ามเก็บเป็นคอลัมน์สถานะเดียว
 */

async function roomByNumber(roomNumber: string): Promise<RoomSummary> {
  const rooms = await fetchRooms()
  const room = rooms.find((r) => r.roomNumber === roomNumber)
  if (!room) {
    throw new Error(`ไม่พบห้อง ${roomNumber} ใน mock`)
  }
  return room
}

function noop() {}

beforeEach(() => {
  resetMockStore()
})

describe('ล็อกห้องเป็นซ่อมบำรุง (US-15-S1)', () => {
  it('ห้องว่างกดตั้งเป็นซ่อมบำรุงแล้วสถานะเปลี่ยนจริง', async () => {
    const user = userEvent.setup()
    const room = await roomByNumber('101')
    expect(room.status).toBe('AVAILABLE')

    render(<RoomStatusDialog room={room} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))

    expect((await fetchRoom(room.id)).status).toBe('MAINTENANCE')
  })

  it('ห้องที่มีผู้เช่าก็ล็อกได้ ตามที่ story เขียนไว้', async () => {
    const user = userEvent.setup()
    const room = await roomByNumber('102')
    expect(room.status).toBe('OCCUPIED')

    render(<RoomStatusDialog room={room} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))

    expect((await fetchRoom(room.id)).status).toBe('MAINTENANCE')
  })
})

describe('ปิดงานซ่อม (US-15-S2)', () => {
  it('ห้องที่ไม่มีสัญญากลับไปเป็นว่าง', async () => {
    const user = userEvent.setup()
    const locked = await roomByNumber('106')
    expect(locked.status).toBe('MAINTENANCE')

    render(<RoomStatusDialog room={locked} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: /ปิดงานซ่อม/ }))

    expect((await fetchRoom(locked.id)).status).toBe('AVAILABLE')
  })

  it('ห้องที่ยังมีผู้เช่าต้องกลับไปเป็นมีผู้เช่า ไม่ใช่ว่าง', async () => {
    const user = userEvent.setup()

    // ล็อกห้องที่มีสัญญาอยู่ก่อน แล้วค่อยปลดล็อก ตามขั้นตอนที่ QA เขียนไว้
    const occupied = await roomByNumber('102')
    const first = render(<RoomStatusDialog room={occupied} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))
    // ถอด dialog ใบแรกออกก่อน ไม่งั้นจะมีปุ่มชื่อเดียวกันสองใบอยู่ในจอพร้อมกัน
    first.unmount()

    const locked = await fetchRoom(occupied.id)
    expect(locked.status).toBe('MAINTENANCE')

    render(<RoomStatusDialog room={locked} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: /ปิดงานซ่อม/ }))

    const after = await fetchRoom(occupied.id)
    expect(after.status).toBe('OCCUPIED')
    expect(after.currentLease?.tenantName).toBe('ยูกิ ทานากะ')
  })
})
