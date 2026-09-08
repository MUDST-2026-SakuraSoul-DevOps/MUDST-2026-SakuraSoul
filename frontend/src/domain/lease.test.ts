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
 * Lease date-range rules are critical for SSK-11.
 * These tests protect the system from double-booking the same room
 * during an active lease period.
 */
function lease(overrides: Partial<Lease>): Lease {
  return {
    id: 1,
    roomId: 1,
    roomNumber: '101',
    tenantId: 1,
    tenantName: 'ยูกิ ทานากะ',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    monthlyRent: 3500,
    billingCycle: 'MONTHLY',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('overlaps', () => {
  it('returns true when two date ranges overlap', () => {
    expect(
      overlaps(
        { startDate: '2026-01-01', endDate: '2026-06-30' },
        { startDate: '2026-06-01', endDate: '2026-12-31' },
      ),
    ).toBe(true)
  })

  it('returns false when two date ranges do not overlap', () => {
    expect(
      overlaps(
        { startDate: '2026-01-01', endDate: '2026-05-31' },
        { startDate: '2026-06-01', endDate: '2026-12-31' },
      ),
    ).toBe(false)
  })

  it('treats the same end and start date as overlapping', () => {
    // This matches the closed date range behavior used by the PostgreSQL constraint.
    expect(
      overlaps(
        { startDate: '2026-01-01', endDate: '2026-06-30' },
        { startDate: '2026-06-30', endDate: '2026-12-31' },
      ),
    ).toBe(true)
  })

  it('treats an open-ended lease as overlapping with future leases', () => {
    expect(
      overlaps(
        { startDate: '2026-01-01', endDate: null },
        { startDate: '2030-01-01', endDate: '2030-12-31' },
      ),
    ).toBe(true)
  })

  it('does not overlap when another lease ended before an open-ended lease starts', () => {
    expect(
      overlaps(
        { startDate: '2026-01-01', endDate: null },
        { startDate: '2025-01-01', endDate: '2025-12-31' },
      ),
    ).toBe(false)
  })
})

describe('isBackwardsRange', () => {
  it('returns true when the end date is before the start date', () => {
    expect(isBackwardsRange('2026-06-01', '2026-05-31')).toBe(true)
  })

  it('allows the end date to be the same as the start date', () => {
    expect(isBackwardsRange('2026-06-01', '2026-06-01')).toBe(false)
  })

  it('allows leases without an end date', () => {
    expect(isBackwardsRange('2026-06-01', null)).toBe(false)
  })
})

describe('findConflictingLease', () => {
  const active = lease({ id: 10, roomId: 5, roomNumber: '105' })

  it('finds an overlapping active lease in the same room', () => {
    const conflict = findConflictingLease([active], {
      roomId: 5,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })

    expect(conflict?.id).toBe(10)
  })

  it('ignores overlapping leases from another room', () => {
    const conflict = findConflictingLease([active], {
      roomId: 6,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })

    expect(conflict).toBeNull()
  })

  it('ignores ended leases from the same room', () => {
    const ended = lease({ id: 11, roomId: 5, status: 'ENDED' })
    const conflict = findConflictingLease([ended], {
      roomId: 5,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
    })

    expect(conflict).toBeNull()
  })

  it('ignores the lease currently being edited', () => {
    const conflict = findConflictingLease(
      [active],
      { roomId: 5, startDate: '2026-01-01', endDate: '2026-12-31' },
      active.id,
    )

    expect(conflict).toBeNull()
  })

  it('returns the first active conflict from the same room when several leases are loaded', () => {
    const endedSameRoom = lease({ id: 20, roomId: 5, status: 'ENDED' })
    const activeOtherRoom = lease({ id: 21, roomId: 6, roomNumber: '106' })
    const activeSameRoom = lease({
      id: 22,
      roomId: 5,
      roomNumber: '105',
      startDate: '2026-03-01',
      endDate: '2026-09-30',
    })

    // Test: SSK-11 should only block an active lease in the same room and overlapping date range.
    const conflict = findConflictingLease([endedSameRoom, activeOtherRoom, activeSameRoom], {
      roomId: 5,
      startDate: '2026-08-01',
      endDate: '2026-12-31',
    })

    expect(conflict?.id).toBe(22)
  })
})

describe('overlapMessage', () => {
  it('includes the room number, lease period, and tenant name', () => {
    const message = overlapMessage(lease({ roomNumber: '108', tenantName: 'สมชาย ใจดี' }))

    expect(message).toContain('108')
    expect(message).toContain('2026-01-01')
    expect(message).toContain('2026-12-31')
    expect(message).toContain('สมชาย ใจดี')
  })

  it('does not show null for leases without an end date', () => {
    const message = overlapMessage(lease({ endDate: null }))

    expect(message).not.toContain('null')
  })

  it('shows a readable open-ended date message for leases without an end date', () => {
    const message = overlapMessage(lease({ roomNumber: '109', endDate: null }))

    // Test: The warning should explain that the occupied period has no fixed end date.
    expect(message).toContain('109')
    expect(message).toContain('ไม่กำหนดวันจบ')
  })
})

describe('leaseStatusOn', () => {
  it('marks a lease as ended when its end date is before today', () => {
    expect(leaseStatusOn(lease({ endDate: '2026-05-31' }), '2026-06-01')).toBe('ENDED')
  })

  it('keeps a lease active when today is within the lease period', () => {
    expect(leaseStatusOn(lease({ endDate: '2026-12-31' }), '2026-06-01')).toBe('ACTIVE')
  })

  it('always keeps an explicitly ended lease as ended', () => {
    expect(leaseStatusOn(lease({ status: 'ENDED', endDate: '2030-12-31' }), '2026-06-01')).toBe('ENDED')
  })
})