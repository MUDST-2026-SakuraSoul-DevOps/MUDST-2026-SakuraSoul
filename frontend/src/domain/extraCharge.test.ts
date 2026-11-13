import { describe, expect, it } from 'vitest'
import type { LeaseExtraCharge } from '../api/types'
import { billedChargeIds, dueExtraCharges, validateExtraCharge } from './extraCharge'

function charge(overrides: Partial<LeaseExtraCharge> = {}): LeaseExtraCharge {
  return {
    chargeId: 1, label: 'Parking', amount: 500, recurrence: 'MONTHLY',
    startMonth: '2026-11', endMonth: null, active: true, ...overrides,
  }
}

describe('dueExtraCharges', () => {
  it('bills a monthly charge from its first month until its last month', () => {
    const monthly = charge({ endMonth: '2027-01' })
    expect(dueExtraCharges([monthly], '2026-10', new Set())).toEqual([])
    expect(dueExtraCharges([monthly], '2026-11', new Set())).toEqual([monthly])
    expect(dueExtraCharges([monthly], '2027-01', new Set())).toEqual([monthly])
    expect(dueExtraCharges([monthly], '2027-02', new Set())).toEqual([])
  })

  it('bills a one-time charge until a bill has used it', () => {
    const once = charge({ chargeId: 7, recurrence: 'ONE_TIME' })
    expect(dueExtraCharges([once], '2026-12', new Set())).toEqual([once])
    expect(dueExtraCharges([once], '2026-12', new Set([7]))).toEqual([])
  })

  it('skips inactive charges and leases without charges', () => {
    expect(dueExtraCharges([charge({ active: false })], '2026-12', new Set())).toEqual([])
    expect(dueExtraCharges(undefined, '2026-12', new Set())).toEqual([])
  })
})

describe('billedChargeIds', () => {
  it('collects the charge ids written on earlier bills', () => {
    expect(billedChargeIds([{ items: [{ chargeId: null }, { chargeId: 3 }] }, { items: [{}] }])).toEqual(new Set([3]))
  })
})

describe('validateExtraCharge', () => {
  const valid = { label: 'Parking', amount: 500, recurrence: 'MONTHLY' as const, startMonth: '2026-11', endMonth: null, active: true }
  it('accepts a valid charge', () => {
    expect(validateExtraCharge(valid)).toBeNull()
  })
  it('rejects a last month before the first', () => {
    expect(validateExtraCharge({ ...valid, endMonth: '2026-10' })).toBe('The last month cannot be before the first month')
  })

  // ทุกข้อความผิดของฟอร์ม ExtraChargeDialog มาจากฟังก์ชันนี้ ไล่ให้ครบทีละช่องตามลำดับที่ตรวจ
  it.each([
    ['an empty description', { label: '   ' }, 'Please describe the charge'],
    ['a description over 80 characters', { label: 'x'.repeat(81) }, 'The description must be 80 characters or fewer'],
    ['an amount that is not a number', { amount: Number.NaN }, 'Amount must be a number'],
    ['an infinite amount', { amount: Number.POSITIVE_INFINITY }, 'Amount must be a number'],
    ['a negative amount', { amount: -1 }, 'Amount cannot be negative'],
    ['an amount over one million', { amount: 1_000_001 }, 'Amount is too high'],
    ['an unknown frequency', { recurrence: 'WEEKLY' as never }, 'Frequency must be ONE_TIME or MONTHLY'],
    ['a missing first month', { startMonth: '' }, 'Please choose the first month to charge (YYYY-MM)'],
    ['a first month in the wrong format', { startMonth: '11/2026' }, 'Please choose the first month to charge (YYYY-MM)'],
    ['a last month in the wrong format', { endMonth: '2027-13' }, 'The last month must be YYYY-MM'],
  ])('rejects %s', (_case, change, message) => {
    expect(validateExtraCharge({ ...valid, ...change })).toBe(message)
  })

  it('accepts the edge values a landlord can still type', () => {
    // 80 ตัวพอดี ค่า 0 (ของแถม) และหนึ่งล้านพอดี ยังผ่าน
    expect(validateExtraCharge({ ...valid, label: 'x'.repeat(80) })).toBeNull()
    expect(validateExtraCharge({ ...valid, amount: 0 })).toBeNull()
    expect(validateExtraCharge({ ...valid, amount: 1_000_000 })).toBeNull()
    // วันสิ้นสุดเว้นว่างได้ทั้ง null และสตริงว่าง (ช่อง month ที่ลบค่าออก) คือไม่มีกำหนดสิ้นสุด
    expect(validateExtraCharge({ ...valid, endMonth: '' })).toBeNull()
    // เดือนเดียวกันได้ คิดเดือนเดียว
    expect(validateExtraCharge({ ...valid, endMonth: '2026-11' })).toBeNull()
  })
})
