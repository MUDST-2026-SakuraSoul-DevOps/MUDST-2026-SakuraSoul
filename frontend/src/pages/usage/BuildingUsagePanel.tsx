import { useState } from 'react'
import { ChartLine, Gauge, Lightning } from '@phosphor-icons/react'
import { Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { downloadBuildingUsageCsv, errorMessage, fetchBuildingUsage } from '../../api/client'
import type { BuildingUsagePoint, UsageGranularity, UsageMetric } from '../../api/types'
import { METRIC_LABEL, METRIC_UNIT, periodLabel } from '../../domain/usage'
import { displayMonth } from '../../domain/roomRate'
import {
  MONTH_NAMES,
  amountOf,
  changeOf,
  formatAmount,
  formatChange,
  formatUnits,
  isIncomplete,
  isPartialYear,
  shortcutRange,
  trimToData,
  unitsOf,
  yearLines,
  type RangeShortcut,
} from '../../domain/buildingUsage'
import { useLoader } from '../../hooks/useLoader'
import { SecondaryButton } from '../../components/Button'
import { StatCard } from '../../components/StatCard'
import { DataTable } from '../../components/DataTable'
import { ErrorState, LoadingState } from '../../components/PageState'
import { Note, Panel } from '../../components/Callout'
import { LineSeriesChart } from '../../components/charts/LineSeriesChart'
import { BarSeriesChart } from '../../components/charts/BarSeriesChart'
import { chartColor, type ChartColor } from '../../components/charts/chartColors'
import { downloadBlob } from '../../lib/downloadFile'
import { todayInBangkok } from '../../format'

type ChartView = 'monthly' | 'yearly' | 'compare'

const SHORTCUTS: { value: RangeShortcut; label: string }[] = [
  { value: 'last12', label: 'Last 12 months' },
  { value: 'thisYear', label: 'This year' },
  { value: 'allYears', label: 'All years' },
]

const VIEWS: { value: ChartView; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'compare', label: 'Compare years' },
]

const METRIC_COLOR: Record<UsageMetric, ChartColor> = { electric: 3, water: 2 }
const COMPARE_YEARS = 5

const MONTH_INPUT = 'min-h-11 rounded-lg border border-card-border bg-white px-3 py-2.5 text-sm text-ink'
const HEAD_CELL = 'border-b border-card-border px-3 py-3 text-xs font-semibold tracking-[0.6px] text-table-label uppercase'

function periodText(period: string): string {
  return period.length === 4 ? period : displayMonth(period)
}

/**
 * ภาพรวมการใช้น้ำไฟทั้งตึก (SSK-181) จาก GET /api/usage/building
 *
 * - ช่วงเวลาข้ามปีได้ มีปุ่มลัด และกราฟสามแบบ: เส้นรายเดือน แท่งรายปี และเทียบปี (ม.ค.-ธ.ค. หนึ่งเส้นต่อปี)
 * - เดือนที่ไม่มีข้อมูลเป็นช่องว่าง ไม่ใช่ 0 เดือนที่ข้อมูลไม่ครบมีจุดกลวงและบอกจำนวนห้องใต้กราฟ
 * - ตารางใต้กราฟเป็นข้อมูลชุดเดียวกัน ส่งออกเป็น CSV จาก backend ได้
 * - "ทุกปี" ขอสิบปีล่าสุดตามเพดานของ API แล้วตัดหัวท้ายที่ไม่มีข้อมูลออก ช่วงอื่นแสดงครบทุกเดือนที่เลือก
 */
export function BuildingUsagePanel() {
  const thisMonth = todayInBangkok().slice(0, 7)
  const [metric, setMetric] = useState<UsageMetric>('electric')
  const [view, setView] = useState<ChartView>('monthly')
  const [shortcut, setShortcut] = useState<RangeShortcut | null>('last12')
  const [range, setRange] = useState(() => shortcutRange('last12', thisMonth))
  const [exportError, setExportError] = useState<string | null>(null)
  const granularity: UsageGranularity = view === 'yearly' ? 'year' : 'month'

  const usage = useLoader(
    () => fetchBuildingUsage({ from: range.from, to: range.to, granularity, compare: true }),
    'Could not load the building usage',
    [range.from, range.to, granularity],
  )

  // useLoader เก็บคำตอบเก่าไว้ระหว่างโหลดคำขอใหม่ และเก็บไว้ต่อแม้คำขอใหม่ไม่ผ่าน
  // แสดงเฉพาะคำตอบที่ตรงกับช่วงและแบบกราฟที่เลือกอยู่ ไม่งั้นจุดรายเดือนจะถูกวาดเป็นแท่งรายปีใต้หัวช่วงใหม่
  const fresh =
    usage.data !== null &&
    usage.error === null &&
    usage.data.granularity === granularity &&
    usage.data.from === range.from &&
    usage.data.to === range.to
  const report = fresh ? usage.data : null
  const shown: BuildingUsagePoint[] = report
    ? shortcut === 'allYears'
      ? trimToData(report.points, metric)
      : report.points
    : []
  const hasData = shown.some((p) => unitsOf(p, metric) !== null)
  const unit = METRIC_UNIT[metric]
  const label = METRIC_LABEL[metric]
  // "ทุกปี" ตัดหัวท้ายที่ไม่มีข้อมูลออก ป้ายช่วงกับจำนวนเดือนจึงนับตามแถวที่เห็น ไม่ใช่สิบปีที่ขอไป
  const trimmed = shortcut === 'allYears' && shown.length > 0
  const rangeText = trimmed
    ? `${periodText(shown[0].period)} – ${periodText(shown[shown.length - 1].period)}`
    : `${displayMonth(range.from)} – ${displayMonth(range.to)}`
  const summary = report?.summary
  const monthsInRange = summary ? (trimmed ? shown.reduce((n, p) => n + p.months, 0) : summary.months) : 0
  const total = summary ? (metric === 'electric' ? summary.electricUnits : summary.waterUnits) : null
  const billed = summary ? (metric === 'electric' ? summary.electricAmount : summary.waterAmount) : null
  const average = summary ? (metric === 'electric' ? summary.averageElectricUnitsPerMonth : summary.averageWaterUnitsPerMonth) : null
  const peak = summary ? (metric === 'electric' ? summary.peakElectric : summary.peakWater) : null
  // เดือนที่ไม่มีข้อมูลเลยเป็นช่องว่างอยู่แล้ว ไม่นับซ้ำว่าเป็นเดือนที่ข้อมูลไม่ครบ
  const partial = (p: BuildingUsagePoint) => isIncomplete(p) && unitsOf(p, metric) !== null
  const incomplete = view === 'yearly' ? [] : shown.filter(partial)

  function pickShortcut(value: RangeShortcut) {
    setExportError(null)
    setShortcut(value)
    setRange(shortcutRange(value, thisMonth))
  }

  /** เลือกเดือนต้นหลังเดือนปลาย (หรือกลับกัน) ให้อีกฝั่งเลื่อนตาม แทนที่จะส่งช่วงกลับด้านไปให้ backend ตอบ 400 */
  function pickMonth(edge: 'from' | 'to', value: string) {
    if (!value) return
    setExportError(null)
    setShortcut(null)
    setRange((current) =>
      edge === 'from'
        ? { from: value, to: value > current.to ? value : current.to }
        : { from: value < current.from ? value : current.from, to: value },
    )
  }

  function pickView(value: ChartView) {
    setExportError(null)
    setView(value)
  }

  async function exportCsv() {
    setExportError(null)
    try {
      const blob = await downloadBuildingUsageCsv({ from: range.from, to: range.to, granularity, compare: true })
      downloadBlob(`building-usage-${granularity}-${range.from}-${range.to}.csv`, blob)
    } catch (err) {
      setExportError(errorMessage(err, 'Could not export the CSV'))
    }
  }

  function chart() {
    const chartLabel = `${label} usage for the whole building, ${rangeText}`
    if (view === 'yearly') {
      return (
        <BarSeriesChart
          categories={shown.map((p) => p.period)}
          values={shown.map((p) => unitsOf(p, metric))}
          unit={unit}
          label={chartLabel}
          color={METRIC_COLOR[metric]}
          flagged={shown.map(isPartialYear)}
          notes={shown.map((p) => (isPartialYear(p) ? `${p.monthsWithData} of 12 months have data` : null))}
          formatValue={formatUnits}
        />
      )
    }
    if (view === 'compare') {
      // ห้าปีล่าสุดพอให้สีของแต่ละเส้นไม่ซ้ำกัน (token สีกราฟมีห้าสี)
      const lines = yearLines(shown, metric).slice(-COMPARE_YEARS)
      return (
        <LineSeriesChart
          categories={MONTH_NAMES}
          series={lines.map((line, i) => ({ name: line.year, values: line.values, color: chartColor(i) }))}
          unit={unit}
          label={`${label} usage by year, ${rangeText}`}
          formatValue={formatUnits}
        />
      )
    }
    return (
      <LineSeriesChart
        categories={shown.map((p) => periodLabel(p.period))}
        series={[{ name: label, values: shown.map((p) => unitsOf(p, metric)), color: METRIC_COLOR[metric] }]}
        unit={unit}
        label={chartLabel}
        flagged={shown.map(partial)}
        notes={shown.map((p) => (partial(p) ? `${p.roomsWithData} of ${p.occupiedRooms} occupied units have data` : null))}
        formatValue={formatUnits}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Usage filters" className="rounded-xl border border-card-border bg-white p-4 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Utility</p>
            <div role="group" aria-label="Utility" className="usage-toggle">
              {(['electric', 'water'] as UsageMetric[]).map((m) => (
                <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)} className="usage-toggle-button">
                  {METRIC_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Group the chart by</p>
            <div role="group" aria-label="Chart" className="usage-toggle">
              {VIEWS.map((v) => (
                <button key={v.value} type="button" aria-pressed={view === v.value} onClick={() => pickView(v.value)} className="usage-toggle-button">
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 border-t border-card-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Range" className="flex flex-wrap gap-2">
              {SHORTCUTS.map((s) => (
                <button key={s.value} type="button" aria-pressed={shortcut === s.value} onClick={() => pickShortcut(s.value)} className="usage-range-button">
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-ink-muted">{rangeText}</p>
          </div>
          <details className="mt-3">
            <summary className="w-fit cursor-pointer rounded py-2 text-sm font-medium text-brand focus-visible:outline-2 focus-visible:outline-brand">Custom date range</summary>
            <div className="mt-2 grid max-w-lg gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="font-medium text-ink-muted">From</span>
                <input type="month" value={range.from} max={range.to} onChange={(e) => pickMonth('from', e.target.value)} className={MONTH_INPUT} />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="font-medium text-ink-muted">To</span>
                <input type="month" value={range.to} min={range.from} onChange={(e) => pickMonth('to', e.target.value)} className={MONTH_INPUT} />
              </label>
            </div>
          </details>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`${label} usage`}
          value={total === null ? '-' : `${formatUnits(total)} ${unit}`}
          icon={Lightning}
          footer={
            <p className="text-xs text-body-muted">
              {billed === null ? 'No billed amount in this range' : `฿${formatAmount(billed)} billed`} · {rangeText}
            </p>
          }
        />
        <StatCard
          label="Monthly average"
          value={average === null ? '-' : `${formatUnits(average)} ${unit}`}
          icon={Gauge}
          footer={
            <p className="text-xs text-body-muted">
              {summary ? `${summary.monthsWithData} of ${monthsInRange} months have data` : '-'}
            </p>
          }
        />
        <StatCard
          label={view === 'yearly' ? 'Peak year' : 'Peak month'}
          value={peak ? periodText(peak.period) : '-'}
          icon={ChartLine}
          footer={<p className="text-xs text-body-muted">{peak ? `${formatUnits(peak.units)} ${unit}` : 'No usage yet'}</p>}
        />
      </div>

      <Panel
        title={`${label} consumption · whole building`}
        description={`${rangeText} · ${unit}`}
        actions={
          <SecondaryButton onClick={exportCsv} disabled={!report}>
            <Download className="ui-icon size-icon-inline" aria-hidden="true" />
            Export CSV
          </SecondaryButton>
        }
      >
        <div className="flex flex-col gap-3 overflow-x-auto px-6 py-3">
          {exportError && <ErrorState message={exportError} />}
          {usage.error && <ErrorState message={usage.error} />}
          {!report && !usage.error && <LoadingState label="Loading usage..." />}
          {report && !hasData && (
            <div className="py-6 text-center text-sm text-body-muted">
              <p>No {label.toLowerCase()} usage recorded for this range yet.</p>
              <p className="mt-1">
                Import monthly meter readings under{' '}
                <Link to="/usage?view=units" className="text-brand underline">
                  Usage · By floor or unit
                </Link>
                .
              </p>
            </div>
          )}
          {report && hasData && chart()}
          {report && hasData && view === 'compare' && yearLines(shown, metric).length > COMPARE_YEARS && (
            <p className="text-xs text-body-muted">
              Showing the latest {COMPARE_YEARS} years. Narrow the range to compare earlier years.
            </p>
          )}
          {incomplete.length > 0 && (
            <p className="text-xs text-honey-615">
              {view === 'monthly' ? 'Incomplete data (hollow points):' : 'Incomplete data:'}{' '}
              {incomplete.map((p) => `${displayMonth(p.period)} ${p.roomsWithData} of ${p.occupiedRooms} occupied units`).join(' · ')}.
              These months add up only the units that have a reading or a bill.
            </p>
          )}
        </div>
        {report && hasData && (
          <div className="border-t border-card-border px-6 py-4 text-sm">
            <DataTable
              rows={shown}
              rowKey={(p) => p.period}
              headCellClass={HEAD_CELL}
              rowClass="border-t border-row-border"
              cellClass="px-3 py-2 text-table-label"
              columns={[
                { key: 'period', header: view === 'yearly' ? 'YEAR' : 'MONTH', cell: (p) => periodText(p.period) },
                {
                  key: 'units',
                  header: `${label.toUpperCase()} (${unit})`,
                  cell: (p) => {
                    const units = unitsOf(p, metric)
                    return units === null ? 'No data' : formatUnits(units)
                  },
                },
                {
                  key: 'amount',
                  header: 'BILLED (฿)',
                  cell: (p) => {
                    const amount = amountOf(p, metric)
                    return amount === null ? '-' : formatAmount(amount)
                  },
                },
                view === 'yearly'
                  ? { key: 'coverage', header: 'MONTHS WITH DATA', cell: (p) => `${p.monthsWithData} / ${p.months}` }
                  : {
                      key: 'coverage',
                      header: 'UNITS WITH DATA',
                      cell: (p) => `${p.roomsWithData} / ${p.occupiedRooms}${partial(p) ? ' (incomplete)' : ''}`,
                    },
                { key: 'yoy', header: 'VS LAST YEAR', cell: (p) => formatChange(changeOf(p, metric)) },
              ]}
            />
          </div>
        )}
      </Panel>

      <Note>
        Building totals add up every unit. Meter readings take priority; months without a reading use the units on that
        month&apos;s bill, and billed amounts come from bills only. A month with no data is left as a gap, not counted as 0, and
        averages divide by the months that have data. Year-on-year compares only months that have data in both years.
      </Note>
    </div>
  )
}
