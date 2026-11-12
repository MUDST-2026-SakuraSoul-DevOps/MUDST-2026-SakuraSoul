import { useEffect, useMemo, useState } from 'react'
import { Download, Banknote, Wallet, Clock3, Info } from 'lucide-react'
import { fetchSummaryReport, downloadSummaryReportCsv } from '../api/client'
import type { SummaryReportResponse, SummaryReportRow } from '../api/types'
import { exportCsvReport, type ReportRow } from '../domain/paymentPhase2'
import { bahtAmount } from '../format'

export function SummaryReportsTab({
  reportData,
  onNotify,
  initialFrom = '2026-01',
  initialTo = '2026-12',
}: {
  reportData?: ReportRow[]
  onNotify?: (msg: string) => void
  initialFrom?: string
  initialTo?: string
}) {
  const [group, setGroup] = useState<'Unit' | 'Tenant' | 'Month'>('Unit')
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [report, setReport] = useState<SummaryReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const propRows = useMemo<SummaryReportRow[]>(() => {
    if (!reportData || reportData.length === 0) return []
    if (group === 'Tenant') {
      const tenantMap = new Map<string, { billed: number; received: number; outstanding: number }>()
      reportData.forEach((r) => {
        const curr = tenantMap.get(r.tenant) ?? { billed: 0, received: 0, outstanding: 0 }
        tenantMap.set(r.tenant, {
          billed: curr.billed + r.charges,
          received: curr.received + r.collected,
          outstanding: curr.outstanding + r.balance,
        })
      })
      return Array.from(tenantMap.entries()).map(([name, val]) => ({
        key: name,
        label: name,
        ...val,
        rent: 0,
        electricAmount: 0,
        waterAmount: 0,
        commonAreaFee: 0,
        internetFee: 0,
        extraCharges: 0,
        lateInterest: 0,
      }))
    }
    if (group === 'Month') {
      const monthMap = new Map<string, { billed: number; received: number; outstanding: number }>()
      reportData.forEach((r) => {
        const curr = monthMap.get(r.month) ?? { billed: 0, received: 0, outstanding: 0 }
        monthMap.set(r.month, {
          billed: curr.billed + r.charges,
          received: curr.received + r.collected,
          outstanding: curr.outstanding + r.balance,
        })
      })
      return Array.from(monthMap.entries()).map(([m, val]) => ({
        key: m,
        label: m,
        ...val,
        rent: 0,
        electricAmount: 0,
        waterAmount: 0,
        commonAreaFee: 0,
        internetFee: 0,
        extraCharges: 0,
        lateInterest: 0,
      }))
    }
    const unitMap = new Map<string, { billed: number; received: number; outstanding: number }>()
    reportData.forEach((r) => {
      const curr = unitMap.get(r.unit) ?? { billed: 0, received: 0, outstanding: 0 }
      unitMap.set(r.unit, {
        billed: curr.billed + r.charges,
        received: curr.received + r.collected,
        outstanding: curr.outstanding + r.balance,
      })
    })
    return Array.from(unitMap.entries()).map(([u, val]) => ({
      key: u,
      label: u,
      ...val,
      rent: 0,
      electricAmount: 0,
      waterAmount: 0,
      commonAreaFee: 0,
      internetFee: 0,
      extraCharges: 0,
      lateInterest: 0,
    }))
  }, [reportData, group])

  useEffect(() => {
    let active = true
    const apiGroup = group.toLowerCase() as 'unit' | 'tenant' | 'month'

    fetchSummaryReport({ groupBy: apiGroup, from, to })
      .then((res) => {
        if (active) {
          setReport(res)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load summary report')
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [group, from, to])

  function handleExport() {
    setExporting(true)
    const apiGroup = group.toLowerCase() as 'unit' | 'tenant' | 'month'

    const currentRows = displayRows.map((r) => [
      r.label,
      { charges: r.billed, collected: r.received, balance: r.outstanding },
    ]) as [string, { charges: number; collected: number; balance: number }][]
    exportCsvReport(group, currentRows, from)

    downloadSummaryReportCsv({ groupBy: apiGroup, from, to })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const a = document.createElement('a')
          a.href = url
          a.download = `summary-${apiGroup}-${from}-${to}.csv`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
      })
      .catch(() => {})
      .finally(() => {
        setExporting(false)
      })

    onNotify?.(`Report exported by ${group.toLowerCase()} with current filters`)
  }

  const displayRows = report?.rows ?? propRows
  const totalCharges = report?.total.billed ?? displayRows.reduce((sum, r) => sum + r.billed, 0)
  const totalCollected = report?.total.received ?? displayRows.reduce((sum, r) => sum + r.received, 0)
  const totalBalance = report?.total.outstanding ?? displayRows.reduce((sum, r) => sum + r.outstanding, 0)

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
          disabled={exporting}
          aria-label="Export report"
          className="flex items-center gap-2 rounded-xl border border-honey-140 bg-white px-4 py-2 text-xs font-semibold text-brand shadow-sm hover:bg-page-bg transition cursor-pointer disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? 'Exporting...' : 'Export report'}
        </button>
      </div>

      {/* Filter Row: From and To months */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-md">
        <div>
          <label htmlFor="report-from" className="block text-xs font-medium text-body-muted mb-1.5">
            From month
          </label>
          <input
            id="report-from"
            type="month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From month"
            className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor="report-to" className="block text-xs font-medium text-body-muted mb-1.5">
            To month
          </label>
          <input
            id="report-to"
            type="month"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To month"
            className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 pt-2">
        <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 p-6 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
          <Banknote className="absolute top-4 right-4 size-8 text-body-muted/20" aria-hidden="true" />
          <p className="text-xs font-medium tracking-[0.6px] text-body-muted uppercase">CURRENT CHARGES</p>
          <p className="font-heading text-4xl tracking-[-0.32px] text-heading">{bahtAmount(totalCharges)}</p>
          <p className="text-xs text-body-muted mt-1">Billed charges within the selected period (excluding carryover)</p>
        </div>

        <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 p-6 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
          <Wallet className="absolute top-4 right-4 size-8 text-body-muted/20" aria-hidden="true" />
          <p className="text-xs font-medium tracking-[0.6px] text-body-muted uppercase">PAYMENTS RECEIVED</p>
          <p className="font-heading text-4xl tracking-[-0.32px] text-heading">{bahtAmount(totalCollected)}</p>
          <p className="text-xs text-body-muted mt-1">Actual collections allocated to bills in this period</p>
        </div>

        <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 p-6 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
          <Clock3 className="absolute top-4 right-4 size-8 text-body-muted/20" aria-hidden="true" />
          <p className="text-xs font-medium tracking-[0.6px] text-body-muted uppercase">CLOSING BALANCE</p>
          <p className="font-heading text-4xl tracking-[-0.32px] text-heading">
            {bahtAmount(totalBalance)}
          </p>
          <p className="text-xs text-body-muted mt-1">Outstanding debt as of today</p>
        </div>
      </div>

      {/* Summary Table Card */}
      <div className="overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
        <div className="border-b border-avatar-ring/30 bg-white/50 p-6">
          <h2 className="font-heading text-xl font-bold text-heading">
            Summary by {group.toLowerCase()}
          </h2>
          <p className="text-xs text-body-muted mt-1">
            Period: {from} to {to}
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
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-body-muted">
                    {loading ? 'Loading summary report...' : 'No summary data matches the selected period.'}
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => (
                  <tr key={r.key} className="hover:bg-black/[0.02] transition">
                    <td className="px-6 py-4 font-semibold text-ink">
                      {group === 'Unit' ? (r.label.startsWith('Unit') ? r.label : `Unit ${r.label}`) : r.label}
                    </td>
                    <td className="px-6 py-4 text-ink">{bahtAmount(r.billed)}</td>
                    <td className="px-6 py-4 font-semibold text-moss-545">{bahtAmount(r.received)}</td>
                    <td className="px-6 py-4 font-semibold text-brand">
                      {bahtAmount(r.outstanding)}
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
          Billed charges exclude prior carryover so earlier debts are never counted twice.
          Received amounts reflect payments allocated directly to bills. Closing balance represents live outstanding debt.
        </p>
      </div>
    </div>
  )
}
