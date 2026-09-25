import { describe, expect, it } from 'vitest'
import type { Lease } from '../api/types'
import {
  findConflictingLease,
  isBackwardsRange,
  leaseDepositText,
  leaseDisplayStatus,
  leaseRentInfo,
  leaseStatusOn,
  overlapMessage,
  overlaps,
} from './lease'

/**
 * กฎเรื่องช่วงวันที่ของสัญญาเช่า คือหัวใจของ US-05 (ห้ามปล่อยเช่าซ้อน) และ
 * US-06-S2 (แก้สัญญาไปทับของเดิมไม่ได้) เทสตรงนี้เยอะหน่อยตั้งใจ เพราะเป็น
 * ตรรกะที่ผิดแล้วเสียหายจริง และเป็นจุดที่ requirement น่าจะขยับอีกหลายรอบ
 */

function lease(overrides: Partial<Lease>): Lease {
  return {
    id: 1,
    roomId: 1,
    roomNumber: '101',
    tenantId: 1,
    tenantName: 'Yuki Tanaka',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    monthlyRent: 3500,
    billingCycle: 'MONTHLY',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('overlaps', () => {
  it('ช่วงที่คร่อมกันถือว่าทับ', () => {
    expect(
      overlaps({ startDate: '2026-01-01', endDate: '2026-06-30' }, { startDate: '2026-06-01', endDate: '2026-12-31' }),
    ).toBe(true)
  })

  it('ช่วงที่แยกกันคนละเดือนไม่ทับ', () => {
    expect(
      overlaps({ startDate: '2026-01-01', endDate: '2026-05-31' }, { startDate: '2026-06-01', endDate: '2026-12-31' }),
    ).toBe(false)
  })

  it('วันจบของอันเก่าชนวันเริ่มของอันใหม่พอดี ถือว่าทับ', () => {
    // ช่วงเป็นแบบปิดสองด้าน '[]' ให้ตรงกับ exclusion constraint ฝั่ง PostgreSQL
    // ถ้าเปลี่ยนเป็น '[)' ต้องแก้ทั้งที่นี่และที่ migration พร้อมกัน
    expect(
      overlaps({ startDate: '2026-01-01', endDate: '2026-06-30' }, { startDate: '2026-06-30', endDate: '2026-12-31' }),
    ).toBe(true)
  })

  it('สัญญาที่ไม่กำหนดวันจบ ทับกับทุกอย่างที่มาทีหลัง', () => {
    expect(
      overlaps({ startDate: '2026-01-01', endDate: null }, { startDate: '2030-01-01', endDate: '2030-12-31' }),
    ).toBe(true)
  })

  it('สัญญาที่ไม่กำหนดวันจบ ไม่ทับกับของที่จบไปก่อนหน้ามันเริ่ม', () => {
    expect(
      overlaps({ startDate: '2026-01-01', endDate: null }, { startDate: '2025-01-01', endDate: '2025-12-31' }),
    ).toBe(false)
  })
})

describe('isBackwardsRange', () => {
  it('วันจบมาก่อนวันเริ่มถือว่าผิด', () => {
    expect(isBackwardsRange('2026-06-01', '2026-05-31')).toBe(true)
  })

  it('วันจบวันเดียวกับวันเริ่มยังใช้ได้ เผื่อเช่าวันเดียว', () => {
    expect(isBackwardsRange('2026-06-01', '2026-06-01')).toBe(false)
  })

  it('ไม่กำหนดวันจบไม่ถือว่าผิด', () => {
    expect(isBackwardsRange('2026-06-01', null)).toBe(false)
  })
})

describe('findConflictingLease', () => {
  const active = lease({ id: 10, roomId: 5, roomNumber: '105' })

  it('เจอสัญญาที่ทับกันในห้องเดียวกัน', () => {
    const conflict = findConflictingLease([active], {
      roomId: 5,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })
    expect(conflict?.id).toBe(10)
  })

  it('คนละห้องไม่นับว่าชน', () => {
    const conflict = findConflictingLease([active], {
      roomId: 6,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })
    expect(conflict).toBeNull()
  })

  it('สัญญาที่สิ้นสุดไปแล้วไม่กันห้อง', () => {
    const ended = lease({ id: 11, roomId: 5, status: 'ENDED' })
    const conflict = findConflictingLease([ended], {
      roomId: 5,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })
    expect(conflict).toBeNull()
  })

  it('ตอนแก้สัญญาตัวเอง ไม่ฟ้องว่าชนกับตัวเอง', () => {
    const conflict = findConflictingLease(
      [active],
      { roomId: 5, startDate: '2026-01-01', endDate: '2026-12-31' },
      active.id,
    )
    expect(conflict).toBeNull()
  })

  it('skips ended and other-room leases before finding the active conflict', () => {
    const conflict = findConflictingLease([
      lease({ id: 20, roomId: 5, status: 'ENDED' }),
      lease({ id: 21, roomId: 6, roomNumber: '106' }),
      lease({ id: 22, roomId: 5, roomNumber: '105', startDate: '2026-03-01', endDate: '2026-09-30' }),
    ], {
      roomId: 5,
      startDate: '2026-08-01',
      endDate: '2026-12-31',
    })

    expect(conflict?.id).toBe(22)
  })
})

describe('overlapMessage', () => {
  it('บอกเลขห้อง ช่วงวันที่ และชื่อคนที่เช่าอยู่', () => {
    const message = overlapMessage(lease({ roomNumber: '108', tenantName: 'Aiko Tanaka' }))
    expect(message).toContain('108')
    expect(message).toContain('2026-01-01')
    expect(message).toContain('2026-12-31')
    expect(message).toContain('Aiko Tanaka')
  })

  it('สัญญาที่ไม่กำหนดวันจบ ไม่แสดงคำว่า null ให้ผู้ใช้เห็น', () => {
    const message = overlapMessage(lease({ endDate: null }))
    expect(message).not.toContain('null')
  })

  it('explains an open-ended lease without showing a null date', () => {
    const message = overlapMessage(lease({ roomNumber: '109', endDate: null }))

    expect(message).toContain('109')
    expect(message).toContain('no end date')
  })
})

describe('leaseStatusOn', () => {
  it('สัญญาที่เลยวันจบไปแล้วนับเป็นสิ้นสุด แม้ยังไม่มีใครกดปิด', () => {
    expect(leaseStatusOn(lease({ endDate: '2026-05-31' }), '2026-06-01')).toBe('ENDED')
  })

  it('สัญญาที่ยังอยู่ในช่วงนับเป็น active', () => {
    expect(leaseStatusOn(lease({ endDate: '2026-12-31' }), '2026-06-01')).toBe('ACTIVE')
  })

  it('สัญญาที่ถูกปิดไปแล้วนับเป็นสิ้นสุดเสมอ', () => {
    expect(leaseStatusOn(lease({ status: 'ENDED', endDate: '2030-12-31' }), '2026-06-01')).toBe('ENDED')
  })
})

describe('SSK-127 ค่าเช่าและสถานะที่แสดง มาจากข้อมูลสัญญาจริง', () => {
  it('ค่าเช่าคือ monthlyRent ของสัญญา ชื่อผู้เช่าไม่มีผล', () => {
    // เดิมชื่อที่มีคำว่าสมชายขึ้นเป็น 400,000 Annual Rent ทั้งที่เช่าเดือนละ 3,500
    expect(leaseRentInfo(lease({ tenantName: 'สมชาย ใจดี', monthlyRent: 3500 }))).toEqual({
      amount: '฿3,500.00',
      label: 'Rent / month',
    })
    expect(leaseRentInfo(lease({ tenantName: 'Kenji Sato', monthlyRent: 4500 })).amount).toBe('฿4,500.00')
  })

  it('สัญญารายปีบอกที่ label และไม่คูณ 12 เอง', () => {
    expect(leaseRentInfo(lease({ monthlyRent: 4500, billingCycle: 'YEARLY' }))).toEqual({
      amount: '฿4,500.00',
      label: 'Rent / month · billed yearly',
    })
  })

  it('สถานะคิดจากวันจบสัญญา Ended / Ending Soon ภายใน 30 วัน / Active', () => {
    const today = '2026-09-25'
    expect(leaseDisplayStatus(lease({ status: 'ENDED' }), today)).toBe('Ended')
    expect(leaseDisplayStatus(lease({ endDate: '2026-09-24' }), today)).toBe('Ended')
    expect(leaseDisplayStatus(lease({ endDate: '2026-09-25' }), today)).toBe('Ending Soon')
    expect(leaseDisplayStatus(lease({ endDate: '2026-10-25' }), today)).toBe('Ending Soon')
    expect(leaseDisplayStatus(lease({ endDate: '2026-10-26' }), today)).toBe('Active')
    expect(leaseDisplayStatus(lease({ endDate: null }), today)).toBe('Active')
    // ชื่อผู้เช่าไม่มีผลกับสถานะ (เดิม Sato ได้ Pending Signature เสมอ)
    expect(leaseDisplayStatus(lease({ tenantName: 'Kenji Sato', endDate: null }), today)).toBe('Active')
  })

  it('เงินมัดจำในเอกสารใช้ค่าที่บันทึกไว้ ไม่มีข้อมูลก็บอกตรง ๆ ไม่เดาเป็นค่าเช่าคูณสอง', () => {
    expect(leaseDepositText(lease({ securityDeposit: 7000 }))).toBe('฿7,000.00')
    expect(leaseDepositText(lease({ securityDeposit: 0 }))).toBe('฿0.00')
    expect(leaseDepositText(lease({ securityDeposit: undefined }))).toBe('Not provided')
  })
})
