import { useMemo, useState } from 'react'
import { Gauge, Lightning, ChartLine } from '@phosphor-icons/react'
import { Download } from 'lucide-react'
import { fetchUsage, type UsageRequest } from '../../api/client'
import type { RoomSummary, UsageGranularity, UsageMetric, UsageScope } from '../../api/types'
import { METRIC_LABEL, METRIC_UNIT, periodLabel } from '../../domain/usage'
import { displayMonth } from '../../domain/roomRate'
import { useLoader } from '../../hooks/useLoader'
import { SecondaryButton } from '../../components/Button'
import { SelectField } from '../../components/Field'
import { StatCard } from '../../components/StatCard'
import { DataTable } from '../../components/DataTable'
import { LoadingState, ErrorState } from '../../components/PageState'
import { Note, Panel } from '../../components/Callout'
import { UsageChart } from '../../components/UsageChart'
import { downloadTextFile } from '../../lib/downloadFile'
import { todayInBangkok } from '../../format'

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const MONTH_INPUT = 'min-h-11 rounded-lg border border-card-border bg-white px-3 py-2.5 text-sm text-ink'

/**
 * กราฟการใช้น้ำไฟต่อห้อง/ชั้น/ทั้งอาคาร รายเดือน/รายปี (SSK-167) ตามดีไซน์ Water & Electricity ของ SSK-177
 *
 * ตัวเลือกห้องและชั้นมาจากรายการห้องจริง ผังที่เพิ่มชั้นใน SSK-160 จึงโผล่ในตัวเลือกเอง
 * ช่วงเวลาเลือกข้ามปีได้ตามคอมเมนต์ในการ์ด (เพื่อให้ SSK-181 ต่อยอด) ค่าตั้งต้นคือ 12 เดือนที่ผ่านมา
 */
export function UsagePanel({ rooms, version }: { rooms: RoomSummary[]; version: number }) {
  const thisMonth = todayInBangkok().slice(0, 7)
  const floors = useMemo(() => [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b), [rooms])
  const [metric, setMetric] = useState<UsageMetric>('electric')
  const [scope, setScope] = useState<UsageScope>('floor')
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? 0)
  const [floor, setFloor] = useState(floors[0] ?? 1)
  const [granularity, setGranularity] = useState<UsageGranularity>('month')
  // จบที่เดือนที่แล้ว เพราะเดือนนี้ส่วนใหญ่ยังไม่มีหน่วย กราฟจะได้ไม่ดิ่งลงศูนย์ที่จุดสุดท้าย
  const [from, setFrom] = useState(shiftMonth(thisMonth, -12))
  const [to, setTo] = useState(shiftMonth(thisMonth, -1))

  const query: UsageRequest = {
    metric,
    scope,
    granularity,
    from,
    to,
    ...(scope === 'room' ? { roomId } : {}),
    ...(scope === 'floor' ? { floor } : {}),
  }
  const key = JSON.stringify(query)
  const usage = useLoader(() => fetchUsage(query), 'Could not load the usage', [key, version])

  const unit = METRIC_UNIT[metric]
  const points = usage.data ?? []
  const total = points.reduce((sum, p) => sum + p.units, 0)
  const monthCount = points.length === 0 ? 0 : granularity === 'month' ? points.length : rangeMonths(from, to)
  const peak = points.reduce<(typeof points)[number] | null>((best, p) => (best === null || p.units > best.units ? p : best), null)
  const scopeName =
    scope === 'room' ? `Unit ${rooms.find((r) => r.id === roomId)?.roomNumber ?? ''}` : scope === 'floor' ? `Floor ${floor}` : 'Whole building'
  const rangeText = `${displayMonth(from)} – ${displayMonth(to)}`
  const empty = usage.data !== null && points.every((p) => p.units === 0)

  function exportCsv() {
    const lines = ['period,' + `${metric}_${metric === 'electric' ? 'kwh' : 'm3'}`, ...points.map((p) => `${p.period},${p.units}`)]
    downloadTextFile(`usage-${metric}-${scope}-${from}-${to}.csv`, `${lines.join('\n')}\n`, 'text/csv')
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Utility" className="inline-grid w-fit grid-flow-col gap-1 rounded-[7px] border border-card-border bg-chip-bg p-1">
        {(['water', 'electric'] as UsageMetric[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={metric === m}
            onClick={() => setMetric(m)}
            className="min-h-10 rounded px-4 text-[13px] text-ink-muted hover:text-brand aria-pressed:bg-white aria-pressed:text-brand aria-pressed:shadow-[0_1px_3px_var(--color-sand-100)]"
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField
          label="View"
          value={scope}
          onChange={(v) => setScope(v as UsageScope)}
          options={[
            { value: 'room', label: 'Unit' },
            { value: 'floor', label: 'Floor' },
            { value: 'building', label: 'Whole building' },
          ]}
        />
        {scope === 'room' && (
          <SelectField
            label="Unit"
            value={roomId}
            onChange={(v) => setRoomId(Number(v))}
            options={rooms.map((r) => ({ value: r.id, label: r.roomNumber }))}
          />
        )}
        {scope === 'floor' && (
          <SelectField
            label="Floor"
            value={floor}
            onChange={(v) => setFloor(Number(v))}
            options={floors.map((f) => ({ value: f, label: `Floor ${f}` }))}
          />
        )}
        <SelectField
          label="Period"
          value={granularity}
          onChange={(v) => setGranularity(v as UsageGranularity)}
          options={[
            { value: 'month', label: 'Monthly' },
            { value: 'year', label: 'Yearly' },
          ]}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-muted">From</span>
          <input type="month" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={MONTH_INPUT} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-muted">To</span>
          <input type="month" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={MONTH_INPUT} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`${METRIC_LABEL[metric]} usage`}
          value={`${total.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`}
          icon={Lightning}
          footer={<p className="text-xs text-body-muted">{scopeName} · {rangeText}</p>}
        />
        <StatCard
          label="Monthly average"
          value={`${(monthCount ? total / monthCount : 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} ${unit}`}
          icon={Gauge}
          footer={<p className="text-xs text-body-muted">Across {monthCount} months</p>}
        />
        <StatCard
          label="Peak period"
          value={peak && peak.units > 0 ? periodLabel(peak.period) : '-'}
          icon={ChartLine}
          footer={<p className="text-xs text-body-muted">{peak && peak.units > 0 ? `${peak.units.toLocaleString('en-US')} ${unit}` : 'No usage yet'}</p>}
        />
      </div>

      <Panel
        title={`${METRIC_LABEL[metric]} consumption`}
        description={`${scopeName} · ${rangeText} · ${unit}`}
        actions={
          <SecondaryButton onClick={exportCsv} disabled={!usage.data}>
            <Download className="ui-icon size-icon-inline" aria-hidden="true" />
            Export CSV
          </SecondaryButton>
        }
      >
        <div className="overflow-x-auto px-6 py-3">
          {usage.error && <ErrorState message={usage.error} />}
          {usage.loading && !usage.data && <LoadingState label="Loading usage..." />}
          {empty && (
            <p className="py-6 text-center text-sm text-body-muted">
              No usage recorded for this selection yet. Use Import usage CSV to add monthly readings.
            </p>
          )}
          {usage.data && !empty && (
            <UsageChart points={points} unit={unit} label={`${METRIC_LABEL[metric]} usage for ${scopeName}, ${rangeText}`} />
          )}
        </div>
        {usage.data && (
          <details className="border-t border-card-border px-6 py-4 text-sm">
            <summary className="cursor-pointer text-brand">View usage data table</summary>
            <DataTable
              rows={points}
              rowKey={(p) => p.period}
              headCellClass="border-b border-card-border px-3 py-3 text-xs font-semibold tracking-[0.6px] text-table-label uppercase"
              rowClass="border-t border-row-border"
              cellClass="px-3 py-2 text-table-label"
              columns={[
                { key: 'period', header: 'PERIOD', cell: (p) => (p.period.length === 4 ? p.period : displayMonth(p.period)) },
                { key: 'units', header: `${METRIC_LABEL[metric].toUpperCase()} (${unit})`, cell: (p) => p.units.toLocaleString('en-US') },
              ]}
            />
          </details>
        )}
      </Panel>

      <Note>
        Water and electricity use separate charts and units. Floor and building figures add up every unit in them.
        Imported readings take priority; months without a reading use the units on that month&apos;s bill.
      </Note>
    </div>
  )
}

function rangeMonths(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm) + 1
}
