import type { BuildingUsageChange, BuildingUsageMetric, BuildingUsagePeak, BuildingUsagePoint, BuildingUsageReport } from './types'
import { monthsBetween } from '../domain/usage'

/**
 * GET /api/usage/building ของ backend จำลอง (SSK-181) กติกาเดียวกับ BuildingUsageSeries ฝั่ง Spring
 * ตามสัญญาใน docs/api-contract-phase2-backend.md
 *
 * - หน่วยต่อห้องต่อเดือน: ค่ามิเตอร์ชนะหน่วยในใบเสร็จ เงินมาจากใบเสร็จเท่านั้น
 * - ไม่มีข้อมูลเป็น null ไม่ใช่ 0 metric ที่ไม่ได้ขอเป็น null ทุกช่อง
 * - ผลรวมของหลายเดือน: หน่วยและเงินรวมเฉพาะเดือนที่มีค่า จำนวนห้องแต่ละช่องใช้ค่ามากที่สุดของช่วง
 * - เทียบปีก่อน: เดือนที่เทียบได้คือเดือนที่ทั้งสองปีมีข้อมูล (roomsWithData > 0) ไม่มีเลยใช้ยอดของปีก่อนทั้งช่วง
 *   percent เป็น null เมื่อปีก่อนเป็น 0
 */
export interface MockRoomMonth {
  roomId: number
  /** YYYY-MM */
  month: string
  electricUnits: number | null
  waterUnits: number | null
  electricAmount: number | null
  waterAmount: number | null
}

export interface MockBuildingSource {
  rows: MockRoomMonth[]
  /** ห้องที่มีสัญญาคาบเกี่ยวเดือนนั้น */
  occupiedRooms: (month: string) => number
  totalRooms: number
}

type Field = 'electricUnits' | 'waterUnits' | 'electricAmount' | 'waterAmount'
const FIELDS: Field[] = ['electricUnits', 'waterUnits', 'electricAmount', 'waterAmount']
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

interface Totals {
  values: Record<Field, number | null>
  occupiedRooms: number
  roomsWithData: number
  roomsWithAmount: number
  monthsWithData: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  return present.length === 0 ? null : round2(present.reduce((a, b) => a + b, 0))
}

function shiftYear(month: string, by: number): string {
  return `${Number(month.slice(0, 4)) + by}${month.slice(4)}`
}

/** ส่วนต่างกับปีก่อน กฎเดียวกับ BuildingUsageSeries.change */
function changeOf(current: number | null, previous: number | null): BuildingUsageChange {
  const difference = current === null || previous === null ? null : round2(current - previous)
  const percent = difference === null || previous === null || previous === 0 ? null : round2((difference * 100) / previous)
  return { previous, difference, percent }
}

/** ตอบรายงาน หรือข้อความ error ตามลำดับเดียวกับ BuildingUsageQuery ช่องที่ส่งมาว่างใช้ค่าตั้งต้น */
export function mockBuildingUsage(query: URLSearchParams, source: MockBuildingSource): BuildingUsageReport | string {
  const metric = query.get('metric') || 'both'
  const granularity = query.get('granularity') || 'month'
  const compareParam = query.get('compare') ?? ''
  const from = (query.get('from') ?? '').trim()
  const to = (query.get('to') ?? '').trim()
  if (metric !== 'electric' && metric !== 'water' && metric !== 'both') return 'metric must be electric, water or both'
  if (granularity !== 'month' && granularity !== 'year') return 'granularity must be month or year'
  if (compareParam !== '' && compareParam !== 'yoy') return 'compare must be yoy'
  if (!MONTH.test(from) || !MONTH.test(to) || from > to) return 'from and to must be YYYY-MM with from not after to'
  const months = monthsBetween(from, to)
  if (months.length > 120) return 'The range can be at most 10 years'

  const compare = compareParam === 'yoy'
  const wanted = (field: Field) => metric === 'both' || field.startsWith(metric)
  const byMonth = new Map<string, MockRoomMonth[]>()
  for (const row of source.rows) {
    byMonth.set(row.month, [...(byMonth.get(row.month) ?? []), row])
  }
  const roomsWithData = (month: string) =>
    (byMonth.get(month) ?? []).filter((r) => r.electricUnits !== null || r.waterUnits !== null).length
  const roomsWithAmount = (month: string) =>
    (byMonth.get(month) ?? []).filter((r) => r.electricAmount !== null || r.waterAmount !== null).length

  function totals(ofMonths: string[]): Totals {
    const rows = ofMonths.flatMap((month) => byMonth.get(month) ?? [])
    const values = Object.fromEntries(FIELDS.map((field) => [field, sumOrNull(rows.map((r) => r[field]))])) as Record<
      Field,
      number | null
    >
    const max = (count: (month: string) => number) => Math.max(0, ...ofMonths.map(count))
    return {
      values,
      occupiedRooms: max(source.occupiedRooms),
      roomsWithData: max(roomsWithData),
      roomsWithAmount: max(roomsWithAmount),
      monthsWithData: ofMonths.filter((month) => roomsWithData(month) > 0).length,
    }
  }

  function point(period: string, periodMonths: string[]): BuildingUsagePoint {
    const current = totals(periodMonths)
    let yoy: BuildingUsagePoint['yoy'] = null
    if (compare) {
      const previous = totals(periodMonths.map((month) => shiftYear(month, -1)))
      const compared = periodMonths.filter((month) => roomsWithData(month) > 0 && roomsWithData(shiftYear(month, -1)) > 0)
      const now = compared.length === 0 ? null : totals(compared)
      const before = compared.length === 0 ? previous : totals(compared.map((month) => shiftYear(month, -1)))
      const change = (field: Field) =>
        wanted(field) ? changeOf(now === null ? null : now.values[field], before.values[field]) : null
      yoy = {
        previousPeriod: period.length === 4 ? String(Number(period) - 1) : shiftYear(period, -1),
        previousMonthsWithData: previous.monthsWithData,
        comparedMonths: compared.length,
        electricUnits: change('electricUnits'),
        waterUnits: change('waterUnits'),
        electricAmount: change('electricAmount'),
        waterAmount: change('waterAmount'),
      }
    }
    const value = (field: Field) => (wanted(field) ? current.values[field] : null)
    return {
      period,
      electricUnits: value('electricUnits'),
      waterUnits: value('waterUnits'),
      electricAmount: value('electricAmount'),
      waterAmount: value('waterAmount'),
      occupiedRooms: current.occupiedRooms,
      roomsWithData: current.roomsWithData,
      roomsWithAmount: current.roomsWithAmount,
      monthsWithData: current.monthsWithData,
      months: periodMonths.length,
      yoy,
    }
  }

  const points: BuildingUsagePoint[] =
    granularity === 'month'
      ? months.map((month) => point(month, [month]))
      : [...new Set(months.map((m) => m.slice(0, 4)))].map((year) => point(year, months.filter((m) => m.startsWith(year))))

  const all = totals(months)
  const total = (field: Field) => (wanted(field) ? all.values[field] : null)
  const average = (field: Field) => {
    const sum = total(field)
    return sum === null || all.monthsWithData === 0 ? null : round2(sum / all.monthsWithData)
  }
  const peak = (field: Field): BuildingUsagePeak | null =>
    points.reduce<BuildingUsagePeak | null>((best, p) => {
      const units = p[field]
      return units !== null && (best === null || units > best.units) ? { period: p.period, units } : best
    }, null)

  return {
    from,
    to,
    metric: metric as BuildingUsageMetric,
    granularity,
    compare: compare ? 'yoy' : null,
    totalRooms: source.totalRooms,
    points,
    summary: {
      electricUnits: total('electricUnits'),
      waterUnits: total('waterUnits'),
      electricAmount: total('electricAmount'),
      waterAmount: total('waterAmount'),
      monthsWithData: all.monthsWithData,
      months: months.length,
      averageElectricUnitsPerMonth: average('electricUnits'),
      averageWaterUnitsPerMonth: average('waterUnits'),
      peakElectric: peak('electricUnits'),
      peakWater: peak('waterUnits'),
    },
  }
}

/**
 * ไฟล์ CSV แบบเดียวกับ BuildingUsageCsv: UTF-8 มี BOM ขึ้นบรรทัดแบบ CRLF ทุกยอดมีทศนิยมสองตำแหน่ง
 * เซลล์ว่างคือไม่มีข้อมูล แถวสุดท้ายเป็น Total ซึ่งไม่มีจำนวนห้องและเว้นช่องเทียบปีก่อนไว้ว่าง
 */
export function buildingUsageCsv(report: BuildingUsageReport): string {
  const metrics = report.metric === 'both' ? (['electric', 'water'] as const) : ([report.metric] as const)
  const fields: Field[] = metrics.flatMap((m) => [`${m}Units`, `${m}Amount`] as Field[])
  const column = (field: Field) => field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
  const header = ['period', 'occupied_rooms', 'rooms_with_data', 'rooms_with_amount', 'months_with_data', ...fields.map(column)]
  if (report.compare) {
    header.push(...fields.flatMap((f) => [`${column(f)}_previous`, `${column(f)}_diff`, `${column(f)}_diff_percent`]))
  }
  const cell = (value: number | null | undefined) => (value === null || value === undefined ? '' : value.toFixed(2))
  const rows = report.points.map((p) => {
    const cells = [p.period, String(p.occupiedRooms), String(p.roomsWithData), String(p.roomsWithAmount), String(p.monthsWithData)]
    cells.push(...fields.map((f) => cell(p[f])))
    if (report.compare) {
      cells.push(...fields.flatMap((f) => {
        const c = p.yoy?.[f] ?? null
        return [cell(c?.previous), cell(c?.difference), cell(c?.percent)]
      }))
    }
    return cells.join(',')
  })
  const s = report.summary
  const totals: Record<Field, number | null> = {
    electricUnits: s.electricUnits,
    waterUnits: s.waterUnits,
    electricAmount: s.electricAmount,
    waterAmount: s.waterAmount,
  }
  const total = ['Total', '', '', '', String(s.monthsWithData), ...fields.map((f) => cell(totals[f]))]
  if (report.compare) {
    total.push(...fields.flatMap(() => ['', '', '']))
  }
  rows.push(total.join(','))
  const bom = String.fromCharCode(0xfeff)
  return bom + [header.join(','), ...rows].join('\r\n') + '\r\n'
}
