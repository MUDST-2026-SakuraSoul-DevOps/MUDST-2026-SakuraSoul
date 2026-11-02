import { useState, useMemo } from 'react'
import { Droplets, Zap, Upload, Download, FileSpreadsheet, Info } from 'lucide-react'
import { CustomSelect } from './CustomSelect'
import { ImportUsageDialog } from '../dialogs/ImportUsageDialog'
import { getImportedUsage, downloadCsvFile, type UsageRow } from '../domain/unitsPhase2'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BASE_WATER = [9, 10, 13, 12, 11, 9, 10, 12, 11, 10, 10, 11]
const BASE_ELECTRICITY = [110, 118, 140, 152, 145, 130, 126, 128, 122, 124, 124, 118]
const ROOM_FACTORS: Record<string, number> = { '101': 1, '102': 1.2, '201': 0.9, '202': 0.95 }

const VIEW_OPTIONS = [
  { value: 'Room', label: 'Room' },
  { value: 'Floor', label: 'Floor' },
]

const ROOM_OPTIONS = [
  { value: '101', label: 'Unit 101' },
  { value: '102', label: 'Unit 102' },
  { value: '201', label: 'Unit 201' },
  { value: '202', label: 'Unit 202' },
]

const FLOOR_OPTIONS = [
  { value: '1', label: 'Floor 1' },
  { value: '2', label: 'Floor 2' },
]

const PERIOD_OPTIONS = [
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Yearly', label: 'Yearly' },
]

export function UtilitiesTab({ onNotify }: { onNotify?: (msg: string) => void }) {
  const [utility, setUtility] = useState<'Water' | 'Electricity'>('Water')
  const [group, setGroup] = useState<'Room' | 'Floor'>('Room')
  const [unit, setUnit] = useState('101')
  const [period, setPeriod] = useState<'Monthly' | 'Yearly'>('Monthly')
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [imported, setImported] = useState<UsageRow[]>(() => getImportedUsage())

  const roomNumbers = useMemo(() => {
    return group === 'Floor'
      ? Object.keys(ROOM_FACTORS).filter((r) => r.startsWith(unit))
      : [unit]
  }, [group, unit])

  const factor = useMemo(() => {
    return roomNumbers.reduce((sum, r) => sum + (ROOM_FACTORS[r] ?? 1), 0)
  }, [roomNumbers])

  const base = utility === 'Water' ? BASE_WATER : BASE_ELECTRICITY
  const unitLabel = utility === 'Water' ? 'm³' : 'kWh'

  const values = useMemo(() => {
    if (period === 'Monthly') {
      return base.map((v, i) => {
        const month = `2026-${String(i + 1).padStart(2, '0')}`
        return Math.round(
          roomNumbers.reduce((sum, room) => {
            const update = imported.find((r) => r.month === month && r.room === room)
            return sum + (update ? (utility === 'Water' ? update.water : update.electricity) : v * (ROOM_FACTORS[room] ?? 1))
          }, 0),
        )
      })
    }

    const baseSum = base.reduce((a, b) => a + b, 0) * factor
    return [baseSum * 0.88, baseSum * 0.94, baseSum].map(Math.round)
  }, [base, period, roomNumbers, imported, utility, factor])

  const labels = period === 'Monthly' ? MONTHS : ['2024', '2025', '2026']
  const totalUsage = values.reduce((n, v) => n + v, 0)
  const averageUsage = Math.round(totalUsage / (period === 'Monthly' ? 12 : 36))
  const maximum = Math.max(...values, 1)

  const points = values
    .map((v, i) => `${55 + (i * 770) / (values.length - 1 || 1)},${220 - (v / maximum) * 170}`)
    .join(' ')

  function handleExportCsv() {
    const csvRows = [
      `period,${utility.toLowerCase()}_${unitLabel}`,
      ...labels.map((l, i) => `${l},${values[i]}`),
    ].join('\n')
    downloadCsvFile(`${utility.toLowerCase()}-usage-preview.csv`, csvRows)
    onNotify?.(`${utility} usage data exported to CSV`)
  }

  function handleImportSuccess(count: number) {
    setImported(getImportedUsage())
    onNotify?.(`Successfully imported ${count} usage records`)
  }

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Utility Tab Buttons */}
        <div className="flex rounded-xl border border-avatar-ring/50 bg-white/70 p-1">
          <button
            type="button"
            onClick={() => setUtility('Water')}
            aria-label="Water utility"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              utility === 'Water' ? 'bg-accent-soft text-brand shadow-xs' : 'text-body-muted hover:text-ink'
            }`}
          >
            <Droplets size={16} aria-hidden="true" />
            Water
          </button>
          <button
            type="button"
            onClick={() => setUtility('Electricity')}
            aria-label="Electricity utility"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              utility === 'Electricity' ? 'bg-accent-soft text-brand shadow-xs' : 'text-body-muted hover:text-ink'
            }`}
          >
            <Zap size={16} aria-hidden="true" />
            Electricity
          </button>
        </div>

        {/* Import Button */}
        <button
          type="button"
          onClick={() => setIsImportOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blush-120 px-5 py-2.5 text-xs font-semibold text-brand shadow-xs transition hover:bg-blush-170 cursor-pointer"
        >
          <Upload size={16} aria-hidden="true" />
          Import usage CSV
        </button>
      </div>

      {/* Filter Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="utility-view" className="block text-xs font-medium text-body-muted mb-1.5">
            View
          </label>
          <CustomSelect
            id="utility-view"
            aria-label="View"
            value={group}
            onChange={(val) => {
              const newGroup = val as 'Room' | 'Floor'
              setGroup(newGroup)
              setUnit(newGroup === 'Floor' ? '1' : '101')
            }}
            options={VIEW_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="utility-unit" className="block text-xs font-medium text-body-muted mb-1.5">
            {group === 'Room' ? 'Unit' : 'Floor'}
          </label>
          <CustomSelect
            id="utility-unit"
            aria-label={group === 'Room' ? 'Unit' : 'Floor'}
            value={unit}
            onChange={setUnit}
            options={group === 'Room' ? ROOM_OPTIONS : FLOOR_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="utility-period" className="block text-xs font-medium text-body-muted mb-1.5">
            Period
          </label>
          <CustomSelect
            id="utility-period"
            aria-label="Period"
            value={period}
            onChange={(val) => setPeriod(val as 'Monthly' | 'Yearly')}
            options={PERIOD_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="utility-year-range" className="block text-xs font-medium text-body-muted mb-1.5">
            {period === 'Monthly' ? 'Year' : 'Year range'}
          </label>
          <input
            id="utility-year-range"
            readOnly
            value={period === 'Monthly' ? '2026' : '2024–2026'}
            aria-label={period === 'Monthly' ? 'Year' : 'Year range'}
            className="w-full rounded-lg border border-avatar-ring/50 bg-sand-60/40 px-3.5 py-2 text-sm text-body-muted outline-none select-none cursor-default shadow-xs"
          />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-honey-140/60 bg-white/70 p-5 shadow-xs backdrop-blur-[6px]">
          {utility === 'Water' ? (
            <Droplets className="absolute top-4 right-4 size-8 text-blue-500/20" aria-hidden="true" />
          ) : (
            <Zap className="absolute top-4 right-4 size-8 text-amber-500/20" aria-hidden="true" />
          )}
          <p className="text-[11px] font-semibold tracking-wider text-body-muted uppercase">
            {utility.toUpperCase()} USAGE
          </p>
          <p className="font-heading text-3xl font-bold tracking-tight text-heading">
            {totalUsage.toLocaleString()} <span className="text-base font-normal text-body-muted">{unitLabel}</span>
          </p>
          <p className="text-xs text-body-muted">
            {group} {unit} · {period === 'Monthly' ? '2026' : '2024–2026'}
          </p>
        </div>

        <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-honey-140/60 bg-white/70 p-5 shadow-xs backdrop-blur-[6px]">
          <FileSpreadsheet className="absolute top-4 right-4 size-8 text-body-muted/20" aria-hidden="true" />
          <p className="text-[11px] font-semibold tracking-wider text-body-muted uppercase">
            MONTHLY AVERAGE
          </p>
          <p className="font-heading text-3xl font-bold tracking-tight text-heading">
            {averageUsage.toLocaleString()} <span className="text-base font-normal text-body-muted">{unitLabel}</span>
          </p>
          <p className="text-xs text-body-muted">Based on displayed sample period</p>
        </div>

        <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-honey-140/60 bg-white/70 p-5 shadow-xs backdrop-blur-[6px]">
          <Upload className="absolute top-4 right-4 size-8 text-body-muted/20" aria-hidden="true" />
          <p className="text-[11px] font-semibold tracking-wider text-body-muted uppercase">
            LATEST IMPORT
          </p>
          <p className="font-heading text-3xl font-bold tracking-tight text-heading">
            {imported.length ? `${imported.length} rows` : 'No imports'}
          </p>
          <p className="text-xs text-body-muted">Import CSV to update records</p>
        </div>
      </div>

      {/* Consumption Chart Card */}
      <div className="rounded-2xl border border-honey-140/60 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sand-80 pb-4">
          <div>
            <h2 className="text-lg font-bold text-heading font-heading">{utility} consumption</h2>
            <p className="text-xs text-body-muted mt-0.5">
              {group} {unit} · {period === 'Monthly' ? 'January–December 2026' : '2024–2026'} · {unitLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            aria-label="Export CSV"
            className="flex items-center gap-2 rounded-xl border border-honey-140 bg-white px-4 py-2 text-xs font-semibold text-brand shadow-sm hover:bg-page-bg transition cursor-pointer"
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
        </div>

        {/* SVG Chart */}
        <div className="py-4">
          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 880 275"
              role="img"
              aria-label={`${utility} consumption for ${group.toLowerCase()} ${unit}. Values are listed in the table below.`}
              className="w-full min-w-[650px] text-xs font-mono"
            >
              {/* Grid lines and y-axis ticks */}
              {[0, 1, 2, 3, 4].map((i) => (
                <g key={i}>
                  <line
                    x1="55"
                    x2="825"
                    y1={50 + i * 42.5}
                    y2={50 + i * 42.5}
                    stroke="rgba(122,84,87,0.15)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x="45"
                    y={55 + i * 42.5}
                    textAnchor="end"
                    fill="var(--color-body-muted, #7A696B)"
                    fontSize="11"
                  >
                    {Math.round(maximum * (1 - i / 4))}
                  </text>
                </g>
              ))}

              {/* Chart Line */}
              <polyline
                fill="none"
                stroke="var(--color-brand, #7A5457)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
              />

              {/* Data points & X-axis labels */}
              {values.map((v, i) => {
                const cx = 55 + (i * 770) / (values.length - 1 || 1)
                const cy = 220 - (v / maximum) * 170
                return (
                  <g key={labels[i]}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r="4.5"
                      fill="#FFFFFF"
                      stroke="var(--color-brand, #7A5457)"
                      strokeWidth="2.5"
                      className="cursor-pointer transition hover:scale-125"
                    >
                      <title>
                        {labels[i]}: {v} {unitLabel}
                      </title>
                    </circle>
                    <text
                      x={cx}
                      y="252"
                      textAnchor="middle"
                      fill="var(--color-ink, #2B2325)"
                      fontSize="11"
                      fontFamily="inherit"
                    >
                      {labels[i]}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* Collapsible Usage Data Table */}
        <details className="mt-4 rounded-xl border border-sand-80 bg-sidebar/50 p-4">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline select-none">
            View usage data table
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-sand-80 bg-sand-60/50 text-body-muted">
                <tr>
                  <th className="py-2 px-3 font-semibold">PERIOD</th>
                  <th className="py-2 px-3 text-right font-semibold">
                    {utility.toUpperCase()} ({unitLabel})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-80/60">
                {labels.map((l, i) => (
                  <tr key={l} className="hover:bg-sand-60/30">
                    <td className="py-2 px-3 font-medium text-ink">{l}</td>
                    <td className="py-2 px-3 text-right font-semibold text-heading">
                      {values[i].toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* Note box */}
      <div className="flex items-start gap-3 rounded-xl border border-accent-soft bg-accent-soft/30 p-4 text-xs text-body-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
        <p>
          Water and electricity use separate charts and units. Floor totals include the sampled rooms per floor.
          Imported rows update the relevant room/month. Yearly sample history is aggregated from monthly usage.
        </p>
      </div>

      {/* Import dialog */}
      <ImportUsageDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={handleImportSuccess}
      />
    </div>
  )
}
