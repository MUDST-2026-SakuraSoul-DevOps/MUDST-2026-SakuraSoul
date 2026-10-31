import { describe, expect, it } from 'vitest'
import { displayMonth, nextMonth, rateInEffect, sortRatesNewestFirst, validateRoomRate } from './roomRate'

const valid = {
  effectiveFrom: '2026-12',
  monthlyRent: 4500,
  electricRatePerUnit: 9,
  waterRatePerUnit: 18,
  commonAreaFee: 300,
  internetFee: 250,
}

describe('rateInEffect', () => {
  const rates = [{ effectiveFrom: '2026-01' }, { effectiveFrom: '2026-12' }, { effectiveFrom: '2026-06' }]

  it('picks the latest rate that has started by that month', () => {
    expect(rateInEffect(rates, '2026-11')).toEqual({ effectiveFrom: '2026-06' })
    expect(rateInEffect(rates, '2026-12')).toEqual({ effectiveFrom: '2026-12' })
    expect(rateInEffect(rates, '2027-03')).toEqual({ effectiveFrom: '2026-12' })
  })

  // edges: the month before the first row, and no rows at all fall back to the default rates
  it('returns null before the first rate or when the unit has none', () => {
    expect(rateInEffect(rates, '2025-12')).toBeNull()
    expect(rateInEffect([], '2026-11')).toBeNull()
  })
})

describe('validateRoomRate', () => {
  it('accepts a complete rate', () => {
    expect(validateRoomRate(valid)).toBeNull()
  })

  it.each([
    [{ effectiveFrom: '2026-13' }, 'Please choose the month the rate starts (YYYY-MM)'],
    [{ effectiveFrom: '' }, 'Please choose the month the rate starts (YYYY-MM)'],
    [{ monthlyRent: -1 }, 'Monthly rent cannot be negative'],
    [{ monthlyRent: Number.NaN }, 'Monthly rent must be a number'],
    [{ electricRatePerUnit: -2 }, 'Electricity rate per unit cannot be negative'],
  ])('rejects %o', (change, message) => {
    expect(validateRoomRate({ ...valid, ...change })).toBe(message)
  })
})

describe('month helpers', () => {
  it('rolls over the year', () => {
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(nextMonth('2026-03')).toBe('2026-04')
  })

  it('formats a billing month', () => {
    expect(displayMonth('2026-12')).toBe('Dec 2026')
  })

  it('sorts newest first', () => {
    expect(sortRatesNewestFirst([{ effectiveFrom: '2026-01' }, { effectiveFrom: '2026-12' }])).toEqual([
      { effectiveFrom: '2026-12' },
      { effectiveFrom: '2026-01' },
    ])
  })
})
