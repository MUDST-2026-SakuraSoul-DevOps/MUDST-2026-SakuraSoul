import type { BuildingUsageChange, BuildingUsageMetric, BuildingUsagePeak, BuildingUsagePoint, BuildingUsageReport } from './types'
import { monthsBetween } from '../domain/usage'

/**
 * GET /api/usage/building ของ backend จำลอง (SSK-181) กติกาเดียวกับ BuildingUsageSeries ฝั่ง Spring
 * ตามสัญญาใน docs/api-contract-phase2-backend.md
 *
 * - หน่วยต่อห้องต่อเดือน: ค่ามิเตอร์ชนะหน่วยในใบเสร็จ เงินมาจากใบเสร็จเท่านั้น
 * - ไม่มีข้อมูลเป็น null ไม่ใช่ 0 metric ที่ไม่ได้ขอเป็น null ทุกช่อง
 * - เทียบปีก่อนนับเฉพาะเดือนที่ทั้งสองปีมีข้อมูล percent เป็น null เมื่อปีก่อนเป็น 0
 * - รายปีใช้จำนวนห้องของเดือนที่มากที่สุดในปี
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

interface MonthTotals {
  values: Record<Field, number | null>
  occupiedRooms: number
  roomsWithData: number
  roomsWithAmount: number
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

/** ตอบรายงาน หรือข้อความ error ตามลำดับเดียวกับ BuildingUsageQuery */
export function mockBuildingUsage(query: URLSearchParams, source: MockBuildingSource): BuildingUsageReport | string {
  const metric = query.get('metric') ?? 'both'
  const granularity = query.get('granularity') ?? 'month'
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

  function monthTotals(month: string): MonthTotals {
    const rows = byMonth.get(month) ?? []
    const values = Object.fromEntries(
      FIELDS.map((field) => [field, wanted(field) ? sumOrNull(rows.map((r) => r[field])) : null]),
    ) as Record<Field, number | null>
    return {
      values,
      occupiedRooms: source.occupiedRooms(month),
      roomsWithData: rows.filter((r) => r.electricUnits !== null || r.waterUnits !== null).length,
      roomsWithAmount: rows.filter((r) => r.electricAmount !== null || r.waterAmount !== null).length,
    }
  }

  function change(field: Field, current: MonthTotals[], previous: MonthTotals[]): BuildingUsageChange | null {
    if (!wanted(field)) return null
    let currentSum = 0
    let previousSum = 0
    let compared = 0
    current.forEach((totals, i) => {
      const now = totals.values[field]
      const before = previous[i].values[field]
      if (now !== null && before !== null) {
        currentSum += now
        previousSum += before
        compared += 1
      }
    })
    if (compared === 0) {
      return { previous: sumOrNull(previous.map((t) => t.values[field])), difference: null, percent: null }
    }
    const difference = round2(currentSum - previousSum)
    return {
      previous: round2(previousSum),
      difference,
      percent: previousSum === 0 ? null : round2((difference * 100) / previousSum),
    }
  }

  function point(period: string, periodMonths: string[]): BuildingUsagePoint {
    const totals = periodMonths.map(monthTotals)
    const busiest = totals.reduce((best, t) => (t.roomsWithData > best.roomsWithData ? t : best), totals[0])
    const values = Object.fromEntries(FIELDS.map((field) => [field, sumOrNull(totals.map((t) => t.values[field]))])) as Record<
      Field,
      number | null
    >
    let yoy: BuildingUsagePoint['yoy'] = null
    if (compare) {
      const previous = periodMonths.map((month) => monthTotals(shiftYear(month, -1)))
      yoy = {
        previousPeriod: period.length === 4 ? String(Number(period) - 1) : shiftYear(period, -1),
        previousMonthsWithData: previous.filter((t) => t.roomsWithData > 0).length,
        comparedMonths: totals.filter((t, i) => t.roomsWithData > 0 && previous[i].roomsWithData > 0).length,
        electricUnits: change('electricUnits', totals, previous),
        waterUnits: change('waterUnits', totals, previous),
        electricAmount: change('electricAmount', totals, previous),
        waterAmount: change('waterAmount', totals, previous),
      }
    }
    return {
      period,
      ...values,
      occupiedRooms: busiest.occupiedRooms,
      roomsWithData: busiest.roomsWithData,
      roomsWithAmount: busiest.roomsWithAmount,
      monthsWithData: totals.filter((t) => t.roomsWithData > 0).length,
      months: periodMonths.length,
      yoy,
    }
  }

  const points: BuildingUsagePoint[] =
    granularity === 'month'
      ? months.map((month) => point(month, [month]))
      : [...new Set(months.map((m) => m.slice(0, 4)))].map((year) => point(year, months.filter((m) => m.startsWith(year))))

  const all = months.map(monthTotals)
  const monthsWithData = all.filter((t) => t.roomsWithData > 0).length
  const total = (field: Field) => sumOrNull(all.map((t) => t.values[field]))
  const average = (field: Field) => {
    const sum = total(field)
    return sum === null || monthsWithData === 0 ? null : round2(sum / monthsWithData)
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
      monthsWithData,
      months: months.length,
      averageElectricUnitsPerMonth: average('electricUnits'),
      averageWaterUnitsPerMonth: average('waterUnits'),
      peakElectric: peak('electricUnits'),
      peakWater: peak('waterUnits'),
    },
  }
}

/** ไฟล์ CSV แบบเดียวกับ BuildingUsageCsv: UTF-8 มี BOM ขึ้นบรรทัดแบบ CRLF เซลล์ว่างคือไม่มีข้อมูล แถวสุดท้ายเป็น Total */
export function buildingUsageCsv(report: BuildingUsageReport): string {
  const metrics = report.metric === 'both' ? (['electric', 'water'] as const) : ([report.metric] as const)
  const fields: Field[] = metrics.flatMap((m) => [`${m}Units`, `${m}Amount`] as Field[])
  const column = (field: Field) => field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
  const header = ['period', 'occupied_rooms', 'rooms_with_data', 'rooms_with_amount', 'months_with_data', ...fields.map(column)]
  if (report.compare) {
    header.push(...fields.flatMap((f) => [`${column(f)}_previous`, `${column(f)}_diff`, `${column(f)}_diff_percent`]))
  }
  const cell = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value))
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
  rows.push(['Total', '', '', '', String(s.monthsWithData), ...fields.map((f) => cell(totals[f]))].join(','))
  const bom = String.fromCharCode(0xfeff)
  return bom + [header.join(','), ...rows].join('\r\n') + '\r\n'
}
