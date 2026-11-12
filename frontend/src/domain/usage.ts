import type { UsageGranularity, UsageMetric, UsagePoint, UsageScope } from '../api/types'

/**
 * รวมหน่วยน้ำไฟเป็นจุดของกราฟ (SSK-167)
 *
 * ใช้ใน backend จำลอง และเป็นกติกาที่ backend จริงต้องตอบเหมือนกัน
 * - ห้อง: หน่วยของห้องนั้น · ชั้น: ผลรวมของทุกห้องในชั้น · ทั้งอาคาร: ผลรวมทุกห้อง
 * - รายปี: ผลรวม 12 เดือนของปีนั้น (เฉพาะเดือนที่อยู่ในช่วง from..to)
 * - เดือน/ปีที่ไม่มีข้อมูลตอบ 0 เสมอ กราฟจะได้ไม่เว้นช่อง
 * - ช่วงข้ามปีได้ (คอมเมนต์ของ SSK-167 เพื่อให้ SSK-181 ต่อยอด)
 */

export interface MonthlyUsage {
  roomId: number
  floor: number
  /** YYYY-MM */
  month: string
  electricUnits: number
  waterUnits: number
}

export interface UsageQuery {
  metric: UsageMetric
  scope: UsageScope
  granularity: UsageGranularity
  roomId?: number
  floor?: number
  /** YYYY-MM */
  from: string
  /** YYYY-MM */
  to: string
}

export const METRIC_UNIT: Record<UsageMetric, string> = { electric: 'kWh', water: 'm³' }
export const METRIC_LABEL: Record<UsageMetric, string> = { electric: 'Electricity', water: 'Water' }

/** เดือนทุกเดือนตั้งแต่ from ถึง to รวมสองปลาย */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  let [year, month] = from.split('-').map(Number)
  const [endYear, endMonth] = to.split('-').map(Number)
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

/** ปัดสองตำแหน่ง ผลรวมทศนิยมของ JS จะได้ไม่ออกมาเป็น 0.30000000000000004 */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function aggregateUsage(rows: MonthlyUsage[], query: UsageQuery): UsagePoint[] {
  const months = monthsBetween(query.from, query.to)
  const scopeId =
    query.scope === 'room' ? String(query.roomId) : query.scope === 'floor' ? String(query.floor) : 'building'
  const inScope = rows.filter(
    (row) =>
      (query.scope === 'room' && row.roomId === query.roomId) ||
      (query.scope === 'floor' && row.floor === query.floor) ||
      query.scope === 'building',
  )
  const byMonth = new Map<string, number>()
  for (const row of inScope) {
    const units = query.metric === 'electric' ? row.electricUnits : row.waterUnits
    byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + units)
  }
  if (query.granularity === 'month') {
    return months.map((period) => ({ period, scopeId, units: round2(byMonth.get(period) ?? 0) }))
  }
  const byYear = new Map<string, number>()
  for (const month of months) {
    const year = month.slice(0, 4)
    byYear.set(year, (byYear.get(year) ?? 0) + (byMonth.get(month) ?? 0))
  }
  return [...byYear.entries()].map(([period, units]) => ({ period, scopeId, units: round2(units) }))
}

/**
 * รวมแหล่งข้อมูลของแต่ละห้อง/เดือน: หน่วยจากการนำเข้า (meter_reading) ชนะหน่วยในใบเสร็จ
 * เพราะใบเสร็จเก็บเฉพาะเดือนที่ออกบิล ส่วนมิเตอร์มีครบทุกห้องที่นำเข้า
 */
export function mergeUsageSources(readings: MonthlyUsage[], fromReceipts: MonthlyUsage[]): MonthlyUsage[] {
  const key = (row: MonthlyUsage) => `${row.roomId}|${row.month}`
  const seen = new Set(readings.map(key))
  return [...readings, ...fromReceipts.filter((row) => !seen.has(key(row)))]
}

const MONTH_SHORT = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

/** ป้ายแกน X: รายเดือนเป็น "Jan 26" รายปีเป็น "2026" */
export function periodLabel(period: string): string {
  if (period.length === 4) return period
  const [year, month] = period.split('-').map(Number)
  return `${MONTH_SHORT.format(new Date(Date.UTC(year, month - 1, 1)))} ${String(year).slice(2)}`
}

/** ปัดเพดานแกน Y ให้แบ่งสี่ช่องได้เลขกลม ๆ เช่น 2,010 เป็น 2,400 (ช่องละ 600) */
export function niceCeiling(max: number): number {
  const rough = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((f) => f * magnitude).find((s) => s >= rough) ?? 10 * magnitude
  return step * 4
}
