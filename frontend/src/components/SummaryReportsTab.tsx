import { useEffect, useState } from 'react'
import { Download, Banknote, Wallet, Clock3, Info } from 'lucide-react'
import { fetchSummaryReport, downloadSummaryReportCsv } from '../api/client'
import type { SummaryReportResponse } from '../api/types'
import { bahtAmount, todayInBangkok } from '../format'
import { downloadBlob } from '../lib/downloadFile'

export function SummaryReportsTab({ onNotify }: { onNotify?: (message: string) => void }) {
  const year = todayInBangkok().slice(0, 4)
  const [group, setGroup] = useState<'Unit' | 'Tenant' | 'Month'>('Unit')
  const [from, setFrom] = useState(`${year}-01`)
  const [to, setTo] = useState(`${year}-12`)
  const queryKey = `${group}:${from}:${to}`
  const [result, setResult] = useState<{ key: string; data: SummaryReportResponse | null; error: string | null } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<{ key: string; message: string } | null>(null)
  const loading = result?.key !== queryKey
  const loadError = result?.key === queryKey ? result.error : null
  const error = loadError ?? (exportError?.key === queryKey ? exportError.message : null)
  const report = result?.key === queryKey ? result.data : null

  useEffect(() => {
    let active = true
    fetchSummaryReport({ groupBy: group.toLowerCase() as 'unit' | 'tenant' | 'month', from, to })
      .then(data => { if (active) { setResult({ key: queryKey, data, error: null }); setExportError(null) } })
      .catch(err => { if (active) setResult({ key: queryKey, data: null, error: err instanceof Error ? err.message : 'Could not load summary report' }) })
    return () => { active = false }
  }, [group, from, to, queryKey])

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    const groupBy = group.toLowerCase() as 'unit' | 'tenant' | 'month'
    try {
      const blob = await downloadSummaryReportCsv({ groupBy, from, to })
      downloadBlob(`summary-${groupBy}-${from}-${to}.csv`, blob)
      onNotify?.(`Report exported by ${groupBy} with current filters`)
    } catch (err) {
      setExportError({ key: queryKey, message: err instanceof Error ? err.message : 'Could not export summary report' })
    } finally { setExporting(false) }
  }

  const displayRows = report?.rows ?? []
  const totalCharges = report?.total.billed ?? 0
  const totalCollected = report?.total.received ?? 0
  const totalBalance = report?.total.outstanding ?? 0

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
          disabled={exporting || loading || Boolean(loadError)}
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

      {loading && <p role="status">Loading summary report...</p>}
      {!loading && !loadError && <>
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
      </>}
    </div>
  )
}
