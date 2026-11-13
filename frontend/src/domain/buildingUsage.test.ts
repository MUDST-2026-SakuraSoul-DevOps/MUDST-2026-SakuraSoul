import { describe, expect, it } from 'vitest'
import type { BuildingUsagePoint } from '../api/types'
import { monthsBetween } from './usage'
import {
  amountOf,
  changeOf,
  formatChange,
  isIncomplete,
  isPartialYear,
  shiftMonth,
  shortcutRange,
  trimToData,
  unitsOf,
  yearLines,
} from './buildingUsage'

/**
 * SSK-181: จัดข้อมูลของ GET /api/usage/building ให้กราฟและตาราง
 * กติกาหลักคือไม่มีข้อมูลเป็น null ห้ามกลายเป็น 0 กลางทาง
 */
function point(period: string, overrides: Partial<BuildingUsagePoint> = {}): BuildingUsagePoint {
  return {
    period,
    electricUnits: 100,
    waterUnits: 10,
    electricAmount: 800,
    waterAmount: 200,
    occupiedRooms: 18,
    roomsWithData: 18,
    roomsWithAmount: 18,
    monthsWithData: 1,
    months: 1,
    yoy: null,
    ...overrides,
  }
}

describe('shiftMonth', () => {
  it('crosses year boundaries in both directions', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-11', -12)).toBe('2025-11')
  })
})

describe('shortcutRange', () => {
  it('last 12 months ends with last month, because this month usually has no readings yet', () => {
    expect(shortcutRange('last12', '2026-11')).toEqual({ from: '2025-11', to: '2026-10' })
  })

  it('last 12 months in January reaches back into the year before last', () => {
    expect(shortcutRange('last12', '2026-01')).toEqual({ from: '2025-01', to: '2025-12' })
  })

  it('this year runs from January to this month', () => {
    expect(shortcutRange('thisYear', '2026-11')).toEqual({ from: '2026-01', to: '2026-11' })
  })

  it('all years asks for ten calendar years, which is exactly the 120-month limit of the API in December', () => {
    const range = shortcutRange('allYears', '2026-12')
    expect(range).toEqual({ from: '2017-01', to: '2026-12' })
    expect(monthsBetween(range.from, range.to)).toHaveLength(120)
  })
})

describe('picking the utility', () => {
  it('reads units and billed amounts of the chosen utility and keeps null as no data', () => {
    const p = point('2026-01', { electricUnits: 1234.5, waterUnits: null, electricAmount: 9876, waterAmount: null })
    expect(unitsOf(p, 'electric')).toBe(1234.5)
    expect(unitsOf(p, 'water')).toBeNull()
    expect(amountOf(p, 'electric')).toBe(9876)
    expect(amountOf(p, 'water')).toBeNull()
  })

  it('reads the year-on-year change of the chosen utility, or null when the point has no comparison', () => {
    const electric = { previous: 1000, difference: 234, percent: 23.4 }
    const water = { previous: 20, difference: -5, percent: -25 }
    const p = point('2026-01', {
      yoy: {
        previousPeriod: '2025-01',
        previousMonthsWithData: 1,
        comparedMonths: 1,
        electricUnits: electric,
        waterUnits: water,
        electricAmount: null,
        waterAmount: null,
      },
    })
    expect(changeOf(p, 'electric')).toBe(electric)
    expect(changeOf(p, 'water')).toBe(water)
    expect(changeOf(point('2026-01'), 'electric')).toBeNull()
  })
})

describe('incomplete data', () => {
  it('flags a month where fewer units have data than are occupied', () => {
    expect(isIncomplete(point('2026-01', { occupiedRooms: 18, roomsWithData: 17 }))).toBe(true)
  })

  it('does not flag a full month, nor one where a vacant unit with a reading pushes the count above the occupied units', () => {
    expect(isIncomplete(point('2026-01', { occupiedRooms: 18, roomsWithData: 18 }))).toBe(false)
    expect(isIncomplete(point('2026-01', { occupiedRooms: 18, roomsWithData: 19 }))).toBe(false)
  })

  it('flags a year with fewer than twelve months of data', () => {
    expect(isPartialYear(point('2026', { monthsWithData: 11, months: 12 }))).toBe(true)
    expect(isPartialYear(point('2025', { monthsWithData: 12, months: 12 }))).toBe(false)
  })
})

describe('trimToData', () => {
  it('drops months without data at both ends but keeps a gap in the middle', () => {
    const points = [
      point('2025-01', { electricUnits: null }),
      point('2025-02'),
      point('2025-03', { electricUnits: null }),
      point('2025-04'),
      point('2025-05', { electricUnits: null }),
    ]
    expect(trimToData(points, 'electric').map((p) => p.period)).toEqual(['2025-02', '2025-03', '2025-04'])
  })

  it('trims by the chosen utility only', () => {
    const points = [point('2025-01', { electricUnits: null }), point('2025-02')]
    expect(trimToData(points, 'water').map((p) => p.period)).toEqual(['2025-01', '2025-02'])
    expect(trimToData(points, 'electric').map((p) => p.period)).toEqual(['2025-02'])
  })

  it('returns nothing when the whole range has no data', () => {
    expect(trimToData([point('2025-01', { electricUnits: null })], 'electric')).toEqual([])
  })
})

describe('yearLines', () => {
  it('puts each month under its calendar month, one line per year, and keeps months without data as null', () => {
    const points = [
      point('2025-11', { electricUnits: 110 }),
      point('2025-12', { electricUnits: 120 }),
      point('2026-01', { electricUnits: 130 }),
      point('2026-02', { electricUnits: null }),
    ]
    const nulls = (n: number) => Array<null>(n).fill(null)
    expect(yearLines(points, 'electric')).toEqual([
      { year: '2025', values: [...nulls(10), 110, 120] },
      { year: '2026', values: [130, ...nulls(11)] },
    ])
  })

  it('leaves out a year that has no data at all and sorts the rest oldest first', () => {
    const points = [point('2026-03', { waterUnits: 7 }), point('2024-03', { waterUnits: null }), point('2025-03', { waterUnits: 9 })]
    expect(yearLines(points, 'water').map((line) => line.year)).toEqual(['2025', '2026'])
  })
})

describe('formatChange', () => {
  it('shows the difference and the percent with a plus sign for an increase', () => {
    expect(formatChange({ previous: 1000, difference: 234, percent: 23.4 })).toBe('+234 (+23.4%)')
  })

  it('shows a decrease with its minus sign', () => {
    expect(formatChange({ previous: 200, difference: -50, percent: -25 })).toBe('-50 (-25%)')
  })

  it('leaves the percent out when last year was zero', () => {
    expect(formatChange({ previous: 0, difference: 40, percent: null })).toBe('+40')
  })

  it('shows a dash when no month could be compared or there is no comparison', () => {
    expect(formatChange({ previous: 900, difference: null, percent: null })).toBe('-')
    expect(formatChange(null)).toBe('-')
  })
})
