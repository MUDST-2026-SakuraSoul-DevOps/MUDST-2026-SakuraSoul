import { useState } from 'react'
import { Download, Banknote, Wallet, Clock3, Info } from 'lucide-react'
import { INITIAL_REPORT_ROWS, exportCsvReport, type ReportRow } from '../domain/paymentPhase2'
import { bahtAmount } from '../format'
import { CustomSelect } from './CustomSelect'

const PERIOD_OPTIONS = [
  { value: 'Nov 2026', label: 'Nov 2026' },
  { value: 'Oct 2026', label: 'Oct 2026' },
  { value: 'All months', label: 'All months' },
]

const UNIT_OPTIONS = [
  { value: 'All units', label: 'All units' },
  { value: '101', label: '101' },
  { value: '102', label: '102' },
  { value: '201', label: '201' },
  { value: '202', label: '202' },
]

const TENANT_OPTIONS = [
  { value: 'All tenants', label: 'All tenants' },
  { value: 'Kant S.', label: 'Kant S.' },
  { value: 'Mali P.', label: 'Mali P.' },
  { value: 'Narin K.', label: 'Narin K.' },
  { value: 'Pim W.', label: 'Pim W.' },
]

export function SummaryReportsTab({
  reportData = INITIAL_REPORT_ROWS,
  onNotify,
}: {
  reportData?: ReportRow[]
  onNotify?: (msg: string) => void
}) {
  const [group, setGroup] = useState<'Unit' | 'Tenant' | 'Month'>('Unit')
  const [month, setMonth] = useState('Nov 2026')
  const [unit, setUnit] = useState('All units')
  const [tenant, setTenant] = useState('All tenants')

  const filtered = reportData.filter(
    (r) =>
      (month === 'All months' || r.month === month) &&
      (unit === 'All units' || r.unit === unit) &&
      (tenant === 'All tenants' || r.tenant === tenant),
  )

  const grouped = new Map<string, { charges: number; collected: number; balance: number }>()
  filtered.forEach((r) => {
    const key = group === 'Month' ? r.month : group === 'Tenant' ? r.tenant : r.unit
    const old = grouped.get(key) ?? { charges: 0, collected: 0, balance: 0 }
    grouped.set(key, {
      charges: old.charges + r.charges,
      collected: old.collected + r.collected,
      balance: old.balance + r.balance,
    })
  })

  const rows = Array.from(grouped.entries())

  const totalCharges = filtered.reduce((n, r) => n + r.charges, 0)
  const totalCollected = filtered.reduce((n, r) => n + r.collected, 0)
  const totalBalance = filtered.reduce((n, r) => n + r.balance, 0)

  function handleExport() {
    exportCsvReport(group, rows, month)
    onNotify?.(`Report exported by ${group.toLowerCase()} with current filters`)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Toolbar: Grouping Tabs & Export Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-xl border border-avatar-ring/50 bg-white/70 p-1">
          {(['Unit', 'Tenant', 'Month'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              aria-label={`Group by ${g}`}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                group === g ? 'bg-accent-soft text-brand shadow-xs' : 'text-body-muted hover:text-ink'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleExport}
          aria-label="Export report"
          className="flex items-center gap-2 rounded-xl border border-honey-140 bg-white px-4 py-2 text-xs font-semibold text-brand shadow-sm hover:bg-page-bg transition cursor-pointer"
        >
          <Download size={16} aria-hidden="true" />
          Export report
        </button>
      </div>

      {/* Filter Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="report-period" className="block text-xs font-medium text-body-muted mb-1.5">
            Billing period
          </label>
          <CustomSelect
            id="report-period"
            aria-label="Billing period"
            value={month}
            onChange={(val) => setMonth(val)}
            options={PERIOD_OPTIONS}
            buttonClassName="flex w-full items-center justify-between gap-2.5 rounded-lg border border-avatar-ring/50 bg-sidebar px-3.5 py-2.5 text-sm text-ink outline-none hover:border-brand/40 focus:border-brand cursor-pointer transition shadow-xs"
            menuClassName="absolute top-full left-0 z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-avatar-ring/50 bg-white p-1.5 shadow-xl backdrop-blur-md"
          />
        </div>

        <div>
          <label htmlFor="report-unit" className="block text-xs font-medium text-body-muted mb-1.5">
            Unit
          </label>
          <CustomSelect
            id="report-unit"
            aria-label="Unit"
            value={unit}
            onChange={(val) => setUnit(val)}
            options={UNIT_OPTIONS}
            buttonClassName="flex w-full items-center justify-between gap-2.5 rounded-lg border border-avatar-ring/50 bg-sidebar px-3.5 py-2.5 text-sm text-ink outline-none hover:border-brand/40 focus:border-brand cursor-pointer transition shadow-xs"
            menuClassName="absolute top-full left-0 z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-avatar-ring/50 bg-white p-1.5 shadow-xl backdrop-blur-md"
          />
        </div>

        <div>
          <label htmlFor="report-tenant" className="block text-xs font-medium text-body-muted mb-1.5">
            Tenant
          </label>
          <CustomSelect
            id="report-tenant"
            aria-label="Tenant"
            value={tenant}
            onChange={(val) => setTenant(val)}
            options={TENANT_OPTIONS}
            buttonClassName="flex w-full items-center justify-between gap-2.5 rounded-lg border border-avatar-ring/50 bg-sidebar px-3.5 py-2.5 text-sm text-ink outline-none hover:border-brand/40 focus:border-brand cursor-pointer transition shadow-xs"
            menuClassName="absolute top-full left-0 z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-avatar-ring/50 bg-white p-1.5 shadow-xl backdrop-blur-md"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 pt-2">
        <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 p-6 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
          <Banknote className="absolute top-4 right-4 size-8 text-body-muted/20" aria-hidden="true" />
          <p className="text-xs font-medium tracking-[0.6px] text-body-muted uppercase">CURRENT CHARGES</p>
          <p className="font-heading text-4xl tracking-[-0.32px] text-heading">{bahtAmount(totalCharges)}</p>
          <p className="text-xs text-body-muted mt-1">New charges within the selected period</p>
        </div>

        <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 p-6 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
          <Wallet className="absolute top-4 right-4 size-8 text-body-muted/20" aria-hidden="true" />
          <p className="text-xs font-medium tracking-[0.6px] text-body-muted uppercase">PAYMENTS RECEIVED</p>
          <p className="font-heading text-4xl tracking-[-0.32px] text-heading">{bahtAmount(totalCollected)}</p>
          <p className="text-xs text-body-muted mt-1">Cash and bank transfer collections</p>
        </div>

        <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 p-6 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
          <Clock3 className="absolute top-4 right-4 size-8 text-body-muted/20" aria-hidden="true" />
          <p className="text-xs font-medium tracking-[0.6px] text-body-muted uppercase">CLOSING BALANCE</p>
          <p className="font-heading text-4xl tracking-[-0.32px] text-heading">
            {month === 'All months' ? 'By period below' : bahtAmount(totalBalance)}
          </p>
          <p className="text-xs text-body-muted mt-1">Includes prior balances and interest</p>
        </div>
      </div>

      {/* Summary Table Card */}
      <div className="overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
        <div className="border-b border-avatar-ring/30 bg-white/50 p-6">
          <h2 className="font-heading text-xl font-bold text-heading">
            Summary by {group.toLowerCase()}
          </h2>
          <p className="text-xs text-body-muted mt-1">
            {month} · {unit} · {tenant}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-avatar-ring/30 bg-page-bg text-xs font-medium tracking-[0.6px] text-body-muted uppercase">
              <tr>
                <th className="px-6 py-4">{group.toUpperCase()}</th>
                <th className="px-6 py-4">CURRENT CHARGES</th>
                <th className="px-6 py-4">COLLECTED</th>
                <th className="px-6 py-4">CLOSING BALANCE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-avatar-ring/20 bg-white/40">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-body-muted">
                    No summary data matches the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map(([k, v]) => (
                  <tr key={k} className="hover:bg-black/[0.02] transition">
                    <td className="px-6 py-4 font-semibold text-ink">
                      {group === 'Unit' ? `Unit ${k}` : k}
                    </td>
                    <td className="px-6 py-4 text-ink">{bahtAmount(v.charges)}</td>
                    <td className="px-6 py-4 font-semibold text-moss-545">{bahtAmount(v.collected)}</td>
                    <td className="px-6 py-4 font-semibold text-brand">
                      {month === 'All months' && group !== 'Month' ? (
                        <span className="text-xs text-body-muted font-normal">Select one month</span>
                      ) : (
                        bahtAmount(v.balance)
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note */}
      <div className="flex items-start gap-3 rounded-xl border border-avatar-ring/40 bg-sand-50/60 p-4 text-xs text-ink-muted">
        <Info size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Closing balances are snapshots, not amounts to add across months. Current charges exclude prior debt so carried
          balances do not count as new revenue. The sample report is independent of edits on the Payments preview.
        </p>
      </div>
    </div>
  )
}
