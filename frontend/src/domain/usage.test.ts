import { describe, expect, it } from 'vitest'
import { aggregateUsage, mergeUsageSources, monthsBetween, niceCeiling, periodLabel, type MonthlyUsage } from './usage'

/** 2026 ทั้งปี ห้อง 1-2 อยู่ชั้น 1 ห้อง 3-4 อยู่ชั้น 2 ห้อง n ใช้ไฟ n×10 + เลขเดือน หน่วย */
const rows: MonthlyUsage[] = monthsBetween('2026-01', '2026-12').flatMap((month) =>
  [1, 2, 3, 4].map((roomId) => ({
    roomId,
    floor: roomId <= 2 ? 1 : 2,
    month,
    electricUnits: roomId * 10 + Number(month.slice(5)),
    waterUnits: roomId,
  })),
)

describe('aggregateUsage', () => {
  // AC 1: electricity / floor 2 / monthly / 2026 has 12 points, each the sum of the floor's units
  it('sums the units of every room on the floor for each month', () => {
    const points = aggregateUsage(rows, { metric: 'electric', scope: 'floor', floor: 2, granularity: 'month', from: '2026-01', to: '2026-12' })
    expect(points).toHaveLength(12)
    expect(points[0]).toEqual({ period: '2026-01', scopeId: '2', units: 30 + 1 + 40 + 1 })
    expect(points[11]).toEqual({ period: '2026-12', scopeId: '2', units: 30 + 12 + 40 + 12 })
  })

  // AC 2: the yearly total equals the 12 monthly values added together
  it('adds the months of each year for the yearly view', () => {
    const query = { metric: 'electric' as const, scope: 'building' as const, from: '2026-01', to: '2026-12' }
    const monthly = aggregateUsage(rows, { ...query, granularity: 'month' })
    const yearly = aggregateUsage(rows, { ...query, granularity: 'year' })
    expect(yearly).toEqual([{ period: '2026', scopeId: 'building', units: monthly.reduce((s, p) => s + p.units, 0) }])
  })

  it('crosses years and fills months without data with 0', () => {
    const points = aggregateUsage(rows, { metric: 'water', scope: 'room', roomId: 1, granularity: 'month', from: '2025-11', to: '2026-02' })
    expect(points.map((p) => p.units)).toEqual([0, 0, 1, 1])
    const yearly = aggregateUsage(rows, { metric: 'water', scope: 'room', roomId: 1, granularity: 'year', from: '2025-11', to: '2026-02' })
    expect(yearly).toEqual([
      { period: '2025', scopeId: '1', units: 0 },
      { period: '2026', scopeId: '1', units: 2 },
    ])
  })

  // AC 5: no data at all is a flat line of zeros, not an error
  it('returns zeros when there is no data', () => {
    expect(aggregateUsage([], { metric: 'water', scope: 'building', granularity: 'month', from: '2026-01', to: '2026-03' }).map((p) => p.units)).toEqual([0, 0, 0])
  })
})

describe('mergeUsageSources', () => {
  it('prefers an imported reading over the bill for the same room and month', () => {
    const reading = { roomId: 1, floor: 1, month: '2026-01', electricUnits: 100, waterUnits: 5 }
    const fromBill = { ...reading, electricUnits: 90 }
    const otherMonth = { ...reading, month: '2026-02', electricUnits: 70 }
    expect(mergeUsageSources([reading], [fromBill, otherMonth])).toEqual([reading, otherMonth])
  })
})

describe('chart helpers', () => {
  it('labels months and years', () => {
    expect(periodLabel('2026-03')).toBe('Mar 26')
    expect(periodLabel('2026')).toBe('2026')
  })

  it('rounds the axis maximum to a value that splits into four round steps', () => {
    expect(niceCeiling(2010)).toBe(2400)
    expect(niceCeiling(95)).toBe(100)
    expect(niceCeiling(1)).toBe(1)
  })
})
