import { describe, expect, it } from 'vitest'
import type { Lease } from '../api/types'
import {
  findConflictingLease,
  isBackwardsRange,
  leaseStatusOn,
  overlapMessage,
  overlaps,
} from './lease'

/**
 * Lease date-range rules are the core of US-05 (prevent overlapping leases)
 * and US-06-S2 (prevent editing a lease into an overlap). This file is
 * intentionally thorough because mistakes here cause real booking conflicts
 * and the requirement is likely to evolve.
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
  it('treats intersecting ranges as overlapping', () => {
    expect(
      overlaps({ startDate: '2026-01-01', endDate: '2026-06-30' }, { startDate: '2026-06-01', endDate: '2026-12-31' }),
    ).toBe(true)
  })

  it('treats separated ranges as non-overlapping', () => {
    expect(
      overlaps({ startDate: '2026-01-01', endDate: '2026-05-31' }, { startDate: '2026-06-01', endDate: '2026-12-31' }),
    ).toBe(false)
  })

  it('treats a shared end/start date as overlapping', () => {
    // The range is closed on both sides ('[]') to match the PostgreSQL
    // exclusion constraint. If this changes to '[)', update both this test and
    // the migration together.
    expect(
      overlaps({ startDate: '2026-01-01', endDate: '2026-06-30' }, { startDate: '2026-06-30', endDate: '2026-12-31' }),
    ).toBe(true)
  })

  it('treats open-ended leases as overlapping with later ranges', () => {
    expect(
      overlaps({ startDate: '2026-01-01', endDate: null }, { startDate: '2030-01-01', endDate: '2030-12-31' }),
    ).toBe(true)
  })

  it('does not overlap an open-ended lease with a range that ended before it starts', () => {
    expect(
      overlaps({ startDate: '2026-01-01', endDate: null }, { startDate: '2025-01-01', endDate: '2025-12-31' }),
    ).toBe(false)
  })
})

describe('isBackwardsRange', () => {
  it('treats an end date before the start date as invalid', () => {
    expect(isBackwardsRange('2026-06-01', '2026-05-31')).toBe(true)
  })

  it('allows the same start and end date for a one-day lease', () => {
    expect(isBackwardsRange('2026-06-01', '2026-06-01')).toBe(false)
  })

  it('allows missing end dates', () => {
    expect(isBackwardsRange('2026-06-01', null)).toBe(false)
  })
})

describe('findConflictingLease', () => {
  const active = lease({ id: 10, roomId: 5, roomNumber: '105' })

  it('finds an overlapping lease in the same room', () => {
    const conflict = findConflictingLease([active], {
      roomId: 5,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })
    expect(conflict?.id).toBe(10)
  })

  it('ignores overlaps in different rooms', () => {
    const conflict = findConflictingLease([active], {
      roomId: 6,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })
    expect(conflict).toBeNull()
  })

  it('ignores ended leases when checking availability', () => {
    const ended = lease({ id: 11, roomId: 5, status: 'ENDED' })
    const conflict = findConflictingLease([ended], {
      roomId: 5,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })
    expect(conflict).toBeNull()
  })

  it('ignores the lease being edited so it does not conflict with itself', () => {
    const conflict = findConflictingLease(
      [active],
      { roomId: 5, startDate: '2026-01-01', endDate: '2026-12-31' },
      active.id,
    )
    expect(conflict).toBeNull()
  })
})

describe('overlapMessage', () => {
  it('includes the room number, date range, and current tenant name', () => {
    const message = overlapMessage(lease({ roomNumber: '108', tenantName: 'Aiko Tanaka' }))
    expect(message).toContain('108')
    expect(message).toContain('2026-01-01')
    expect(message).toContain('2026-12-31')
    expect(message).toContain('Aiko Tanaka')
  })

  it('does not show the word null for open-ended leases', () => {
    const message = overlapMessage(lease({ endDate: null }))
    expect(message).not.toContain('null')
  })
})

describe('leaseStatusOn', () => {
  it('treats leases past their end date as ended even if not manually closed', () => {
    expect(leaseStatusOn(lease({ endDate: '2026-05-31' }), '2026-06-01')).toBe('ENDED')
  })

  it('treats leases inside their date range as active', () => {
    expect(leaseStatusOn(lease({ endDate: '2026-12-31' }), '2026-06-01')).toBe('ACTIVE')
  })

  it('always treats manually ended leases as ended', () => {
    expect(leaseStatusOn(lease({ status: 'ENDED', endDate: '2030-12-31' }), '2026-06-01')).toBe('ENDED')
  })
})
