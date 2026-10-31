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
})
