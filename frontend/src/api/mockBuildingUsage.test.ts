import { beforeEach, describe, expect, it } from 'vitest'
import type { BuildingUsageReport, UsagePoint } from './types'
import { buildingUsageCsv, mockBuildingUsage, type MockBuildingSource, type MockRoomMonth } from './mockBuildingUsage'
import { mockFetch, resetMockStore } from './mockApi'

/**
 * SSK-181: GET /api/usage/building ของ backend จำลอง ต้องตอบตามกฎเดียวกับ BuildingUsageSeries ฝั่ง Spring
 * (docs/api-contract-phase2-backend.md) หน้าเว็บในโหมด mock และ Cypress ชุด mock อาศัยกฎชุดนี้
 */
function row(roomId: number, month: string, overrides: Partial<MockRoomMonth> = {}): MockRoomMonth {
  return { roomId, month, electricUnits: 100, waterUnits: 10, electricAmount: null, waterAmount: null, ...overrides }
}

function source(rows: MockRoomMonth[], occupied: Record<string, number> = {}): MockBuildingSource {
  return { rows, occupiedRooms: (month) => occupied[month] ?? 0, totalRooms: 24 }
}

function report(params: Record<string, string>, src: MockBuildingSource): BuildingUsageReport {
  const result = mockBuildingUsage(new URLSearchParams(params), src)
  if (typeof result === 'string') throw new Error(result)
  return result
}

describe('query errors, checked in the same order as the backend', () => {
  const src = source([])
  const error = (params: Record<string, string>) => mockBuildingUsage(new URLSearchParams(params), src)

  it('checks metric first, then granularity, then compare, then the months, then the length', () => {
    expect(error({ metric: 'gas', granularity: 'week', from: '2026-01', to: '2025-01' })).toBe('metric must be electric, water or both')
    expect(error({ granularity: 'week', compare: 'mom', from: '2026-01', to: '2026-02' })).toBe('granularity must be month or year')
    expect(error({ compare: 'mom', from: 'x', to: '2026-02' })).toBe('compare must be yoy')
    expect(error({ from: '2026-03', to: '2026-02' })).toBe('from and to must be YYYY-MM with from not after to')
    expect(error({ from: '2026-13', to: '2026-12' })).toBe('from and to must be YYYY-MM with from not after to')
    expect(error({ from: '2016-12', to: '2026-12' })).toBe('The range can be at most 10 years')
  })

  it('accepts exactly ten years, and an empty compare means no comparison', () => {
    const result = report({ from: '2017-01', to: '2026-12', compare: '' }, src)
    expect(result.points).toHaveLength(120)
    expect(result.compare).toBeNull()
  })
})

describe('monthly points', () => {
  it('sums every unit, keeps a month without data as null and a real zero as 0', () => {
    const src = source(
      [row(1, '2026-01', { electricUnits: 100.5 }), row(2, '2026-01', { electricUnits: 50.25, waterUnits: 0 }), row(1, '2026-03', { electricUnits: 0, waterUnits: 0 })],
      { '2026-01': 3, '2026-02': 3, '2026-03': 3 },
    )
    const [jan, feb, mar] = report({ from: '2026-01', to: '2026-03' }, src).points
    expect(jan).toMatchObject({ period: '2026-01', electricUnits: 150.75, waterUnits: 10, roomsWithData: 2, occupiedRooms: 3, monthsWithData: 1, months: 1 })
    expect(feb).toMatchObject({ electricUnits: null, waterUnits: null, roomsWithData: 0, monthsWithData: 0 })
    expect(mar).toMatchObject({ electricUnits: 0, waterUnits: 0, roomsWithData: 1 })
  })

  it('takes money from bills only and counts the units that have a bill', () => {
    const src = source([row(1, '2026-01', { electricAmount: 800, waterAmount: 180 }), row(2, '2026-01')])
    const [jan] = report({ from: '2026-01', to: '2026-01' }, src).points
    expect(jan).toMatchObject({ electricAmount: 800, waterAmount: 180, roomsWithAmount: 1, roomsWithData: 2 })
  })

  it('leaves the utility that was not asked for as null everywhere', () => {
    const src = source([row(1, '2025-01', { electricAmount: 700 }), row(1, '2026-01', { electricAmount: 800 })])
    const result = report({ from: '2026-01', to: '2026-01', metric: 'electric', compare: 'yoy' }, src)
    expect(result.points[0]).toMatchObject({ electricUnits: 100, waterUnits: null, electricAmount: 800, waterAmount: null })
    expect(result.points[0].yoy).toMatchObject({ waterUnits: null, waterAmount: null })
    expect(result.summary).toMatchObject({ waterUnits: null, averageWaterUnitsPerMonth: null, peakWater: null })
  })
})

describe('year on year', () => {
  it('compares a month with the same month of last year, with the percent rounded to two places', () => {
    const src = source([row(1, '2025-01', { electricUnits: 300 }), row(1, '2026-01', { electricUnits: 400 })])
    const yoy = report({ from: '2026-01', to: '2026-01', compare: 'yoy' }, src).points[0].yoy
    expect(yoy).toMatchObject({ previousPeriod: '2025-01', previousMonthsWithData: 1, comparedMonths: 1 })
    expect(yoy?.electricUnits).toEqual({ previous: 300, difference: 100, percent: 33.33 })
  })

  it('has no percent when last year was zero, and no difference when last year had no data', () => {
    const zero = source([row(1, '2025-01', { electricUnits: 0 }), row(1, '2026-01', { electricUnits: 40 })])
    expect(report({ from: '2026-01', to: '2026-01', compare: 'yoy' }, zero).points[0].yoy?.electricUnits).toEqual({
      previous: 0,
      difference: 40,
      percent: null,
    })
    const missing = source([row(1, '2026-01', { electricUnits: 40 })])
    const yoy = report({ from: '2026-01', to: '2026-01', compare: 'yoy' }, missing).points[0].yoy
    expect(yoy?.electricUnits).toEqual({ previous: null, difference: null, percent: null })
    expect(yoy?.comparedMonths).toBe(0)
  })

  it('compares a year only over the months that have data in both years', () => {
    // 2025 มีครบสามเดือน 2026 มีแค่ ม.ค. กับ ก.พ. เทียบได้สองเดือน ไม่เอา มี.ค. ของปีก่อนมาเทียบกับเดือนที่ยังไม่มีข้อมูล
    const src = source([
      row(1, '2025-01', { electricUnits: 100 }),
      row(1, '2025-02', { electricUnits: 100 }),
      row(1, '2025-03', { electricUnits: 100 }),
      row(1, '2026-01', { electricUnits: 150 }),
      row(1, '2026-02', { electricUnits: 150 }),
    ])
    const [year] = report({ from: '2026-01', to: '2026-03', granularity: 'year', compare: 'yoy' }, src).points
    expect(year).toMatchObject({ period: '2026', electricUnits: 300, monthsWithData: 2, months: 3 })
    expect(year.yoy).toMatchObject({ previousPeriod: '2025', previousMonthsWithData: 3, comparedMonths: 2 })
    expect(year.yoy?.electricUnits).toEqual({ previous: 200, difference: 100, percent: 50 })
  })
})

describe('yearly points and summary', () => {
  it('adds up the months of each year in the range and takes the room counts from the busiest month', () => {
    const src = source(
      [row(1, '2025-12', { electricUnits: 10 }), row(1, '2026-01', { electricUnits: 20 }), row(2, '2026-01', { electricUnits: 30 }), row(1, '2026-02', { electricUnits: 40 })],
      { '2025-12': 1, '2026-01': 2, '2026-02': 2 },
    )
    const points = report({ from: '2025-12', to: '2026-02', granularity: 'year' }, src).points
    expect(points.map((p) => [p.period, p.electricUnits, p.months, p.monthsWithData, p.roomsWithData, p.occupiedRooms])).toEqual([
      ['2025', 10, 1, 1, 1, 1],
      ['2026', 90, 2, 2, 2, 2],
    ])
  })

  it('averages over the months that have data and picks the first peak', () => {
    const src = source([row(1, '2026-01', { electricUnits: 50 }), row(1, '2026-03', { electricUnits: 50 }), row(1, '2026-04', { electricUnits: 20 })])
    const summary = report({ from: '2026-01', to: '2026-04' }, src).summary
    expect(summary).toMatchObject({ electricUnits: 120, monthsWithData: 3, months: 4, averageElectricUnitsPerMonth: 40 })
    expect(summary.peakElectric).toEqual({ period: '2026-01', units: 50 })
  })
})

describe('CSV', () => {
  it('starts with a BOM, ends lines with CRLF, leaves no-data cells empty and ends with a Total row', () => {
    const src = source([row(1, '2026-01', { electricUnits: 12.5, electricAmount: 100 })], { '2026-01': 1, '2026-02': 1 })
    const csv = buildingUsageCsv(report({ from: '2026-01', to: '2026-02', metric: 'electric' }, src))
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1).split('\r\n')).toEqual([
      'period,occupied_rooms,rooms_with_data,rooms_with_amount,months_with_data,electric_units,electric_amount',
      '2026-01,1,1,1,1,12.5,100',
      '2026-02,1,0,0,0,,',
      'Total,,,,1,12.5,100',
      '',
    ])
  })

  it('adds previous, diff and diff percent columns for each value when comparing', () => {
    const src = source([row(1, '2025-01', { electricUnits: 10 }), row(1, '2026-01', { electricUnits: 15 })])
    const csv = buildingUsageCsv(report({ from: '2026-01', to: '2026-01', metric: 'electric', compare: 'yoy' }, src))
    const [header, first] = csv.slice(1).split('\r\n')
    expect(header).toBe(
      'period,occupied_rooms,rooms_with_data,rooms_with_amount,months_with_data,electric_units,electric_amount,' +
        'electric_units_previous,electric_units_diff,electric_units_diff_percent,' +
        'electric_amount_previous,electric_amount_diff,electric_amount_diff_percent',
    )
    expect(first).toBe('2026-01,0,1,0,1,15,,10,5,50,,,')
  })
})

describe('the mock route', () => {
  beforeEach(() => resetMockStore())

  it('adds up to the same building total as the per-unit usage graph of SSK-167 for every month', async () => {
    const months = '?from=2025-01&to=2026-12'
    const building = (await (await mockFetch(`/usage/building${months}&metric=electric`)).json()) as BuildingUsageReport
    const perUnit = (await (await mockFetch(`/usage${months}&metric=electric&scope=building&granularity=month`)).json()) as UsagePoint[]
    const withData = building.points.filter((p) => p.electricUnits !== null)
    expect(withData.length).toBeGreaterThan(0)
    for (const p of withData) {
      expect(p.electricUnits).toBe(perUnit.find((u) => u.period === p.period)?.units)
    }
  })

  it('answers the CSV with the file name the backend uses and a 400 problem for a bad range', async () => {
    const csv = await mockFetch('/usage/building.csv?from=2026-01&to=2026-02&granularity=month')
    expect(csv.headers.get('Content-Disposition')).toBe('attachment; filename="building-usage-month-2026-01-2026-02.csv"')
    const bad = await mockFetch('/usage/building?from=2026-03&to=2026-01')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ detail: 'from and to must be YYYY-MM with from not after to' })
  })
})
