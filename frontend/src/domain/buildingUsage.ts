import type { BuildingUsageChange, BuildingUsagePoint, UsageMetric } from '../api/types'

/**
 * จัดข้อมูลของ GET /api/usage/building ให้กราฟและตาราง (SSK-181)
 *
 * กติกาที่ต้องรักษา: ไม่มีข้อมูลเป็น null ไม่ใช่ 0 ทุกฟังก์ชันจึงส่ง null ต่อ ไม่แปลงเป็นศูนย์
 * กราฟจะได้เว้นช่องตรงเดือนนั้นแทนที่จะลากเส้นลงศูนย์จนดูเหมือนใช้น้อย
 */

export type RangeShortcut = 'last12' | 'thisYear' | 'allYears'

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** เลื่อนเดือน YYYY-MM ไปข้างหน้า (by บวก) หรือย้อนหลัง (by ลบ) */
export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, m - 1 + by, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * ช่วงของปุ่มลัด
 * - 12 เดือนล่าสุด: จบที่เดือนที่แล้ว เพราะเดือนนี้ส่วนใหญ่ยังไม่มีหน่วย (แบบเดียวกับกราฟรายห้องของ SSK-167)
 * - ปีนี้: ม.ค. ถึงเดือนนี้
 * - ทุกปี: สิบปีปฏิทินล่าสุด ซึ่งเป็นเพดานของ API (120 เดือน) หน้าจอตัดหัวท้ายที่ไม่มีข้อมูลออกเอง
 */
export function shortcutRange(shortcut: RangeShortcut, thisMonth: string): { from: string; to: string } {
  const year = Number(thisMonth.slice(0, 4))
  if (shortcut === 'last12') return { from: shiftMonth(thisMonth, -12), to: shiftMonth(thisMonth, -1) }
  if (shortcut === 'thisYear') return { from: `${year}-01`, to: thisMonth }
  return { from: `${year - 9}-01`, to: thisMonth }
}

export function unitsOf(point: BuildingUsagePoint, metric: UsageMetric): number | null {
  return metric === 'electric' ? point.electricUnits : point.waterUnits
}

export function amountOf(point: BuildingUsagePoint, metric: UsageMetric): number | null {
  return metric === 'electric' ? point.electricAmount : point.waterAmount
}

export function changeOf(point: BuildingUsagePoint, metric: UsageMetric): BuildingUsageChange | null {
  if (!point.yoy) return null
  return metric === 'electric' ? point.yoy.electricUnits : point.yoy.waterUnits
}

/**
 * ข้อมูลไม่ครบ: ห้องที่มีผู้เช่าในเดือนนั้นมากกว่าห้องที่มีหน่วย ผลรวมจึงต่ำกว่าที่ใช้จริง
 * ห้องว่างที่มีค่ามิเตอร์ทำให้ roomsWithData มากกว่า occupiedRooms ได้ กรณีนั้นถือว่าครบ
 */
export function isIncomplete(point: BuildingUsagePoint): boolean {
  return point.roomsWithData < point.occupiedRooms
}

/** ปีที่ข้อมูลไม่เต็มปี (ช่วงที่เลือกตัดกลางปี หรือบางเดือนไม่มีข้อมูล) */
export function isPartialYear(point: BuildingUsagePoint): boolean {
  return point.monthsWithData < 12
}

/** ตัดจุดหัวและท้ายที่ไม่มีข้อมูลของ metric นั้นออก ช่องว่างตรงกลางเก็บไว้ ไม่มีข้อมูลเลยได้อาร์เรย์ว่าง */
export function trimToData(points: BuildingUsagePoint[], metric: UsageMetric): BuildingUsagePoint[] {
  const hasData = (point: BuildingUsagePoint) => unitsOf(point, metric) !== null
  const first = points.findIndex(hasData)
  if (first === -1) return []
  let last = points.length - 1
  while (!hasData(points[last])) last -= 1
  return points.slice(first, last + 1)
}

export interface YearLine {
  year: string
  /** ม.ค. ถึง ธ.ค. เดือนที่อยู่นอกช่วงหรือไม่มีข้อมูลเป็น null */
  values: (number | null)[]
}

/** โหมดเทียบปี: หนึ่งเส้นต่อปี แกน X ม.ค.-ธ.ค. ปีที่ไม่มีข้อมูลเลยไม่ขึ้นเส้น เรียงปีเก่าไปใหม่ */
export function yearLines(points: BuildingUsagePoint[], metric: UsageMetric): YearLine[] {
  const byYear = new Map<string, (number | null)[]>()
  for (const point of points) {
    const year = point.period.slice(0, 4)
    const month = Number(point.period.slice(5, 7))
    const values = byYear.get(year) ?? Array<number | null>(12).fill(null)
    values[month - 1] = unitsOf(point, metric)
    byYear.set(year, values)
  }
  return [...byYear.entries()]
    .filter(([, values]) => values.some((value) => value !== null))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, values]) => ({ year, values }))
}

export function formatAmount(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatUnits(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** ส่วนต่างกับปีก่อนเป็นข้อความ เช่น "+234 (+23.4%)" ไม่มีเดือนที่เทียบได้เป็น "-" ปีก่อนเป็นศูนย์ไม่มี % */
export function formatChange(change: BuildingUsageChange | null): string {
  if (!change || change.difference === null) return '-'
  const sign = change.difference > 0 ? '+' : ''
  const amount = `${sign}${formatUnits(change.difference)}`
  if (change.percent === null) return amount
  const percentSign = change.percent > 0 ? '+' : ''
  return `${amount} (${percentSign}${change.percent.toLocaleString('en-US', { maximumFractionDigits: 2 })}%)`
}
