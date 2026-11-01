import { Paperclip, Settings2, Info } from 'lucide-react'
import { Bank, ClipboardText, CalendarCheck, Plus } from '@phosphor-icons/react'
import { StatCard } from './StatCard'
import { PrimaryButton } from './Button'
import { type PaymentRecord } from '../domain/paymentPhase2'
import { baht, bahtAmount } from '../format'

export function PaymentHistoryTab({
  records,
  onOpenSettings,
  onOpenNewDraft,
  totalOutstanding = 17645,
  paidInFullRatio = '1 / 4',
  invoicesAwaitingCount = 3,
}: {
  records: PaymentRecord[]
  onOpenSettings: () => void
  onOpenNewDraft?: () => void
  totalOutstanding?: number
  paidInFullRatio?: string
  invoicesAwaitingCount?: number
}) {
  const totalCollected = records.reduce((sum, r) => sum + r.amount, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard
          label="COLLECTED THIS MONTH"
          value={baht(totalCollected)}
          icon={Bank}
          footer={
            <span className="inline-flex items-center gap-1 rounded-sm bg-moss-360/10 px-2 py-1 text-xs font-medium text-moss-360">
              {records.length} Payment records · November 2026
            </span>
          }
        />
        <StatCard
          label="OUTSTANDING BALANCE"
          value={baht(totalOutstanding)}
          icon={ClipboardText}
          footer={
            <span className="text-xs font-medium text-honey-600">
              {invoicesAwaitingCount} Invoices Awaiting Payment
            </span>
          }
        />
        <StatCard
          label="PAID IN FULL"
          value={paidInFullRatio}
          icon={CalendarCheck}
          footer={
            <span className="text-xs font-medium text-ink-muted">
              Partial payments remain in the ledger
            </span>
          }
        />
      </div>

      {/* Top Toolbar */}
      <div className="flex justify-end items-center gap-3">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Billing Settings"
          className="flex items-center gap-2 rounded-xl border border-avatar-ring/60 bg-white px-4 py-2.5 text-xs font-semibold text-brand shadow-xs hover:bg-page-bg transition cursor-pointer"
        >
          <Settings2 size={16} aria-hidden="true" />
          Billing Settings
        </button>
        {onOpenNewDraft && (
          <PrimaryButton onClick={onOpenNewDraft} aria-label="New Invoice">
            <Plus weight="bold" aria-hidden="true" className="ui-icon size-icon-control" />
            New Invoice
          </PrimaryButton>
        )}
      </div>

      {/* Table Card */}
      <div className="overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
        <div className="border-b border-avatar-ring/30 bg-white/50 p-6">
          <h2 className="font-heading text-xl font-bold text-heading">Payment history</h2>
          <p className="text-xs text-body-muted mt-1">
            One receipt for each payment received. Original invoice balances remain traceable.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-avatar-ring/30 bg-page-bg text-xs font-medium tracking-[0.6px] text-body-muted uppercase">
              <tr>
                <th className="px-6 py-4">RECEIPT</th>
                <th className="px-6 py-4">UNIT / INVOICE</th>
                <th className="px-6 py-4">RECEIVED</th>
                <th className="px-6 py-4">AMOUNT</th>
                <th className="px-6 py-4">METHOD</th>
                <th className="px-6 py-4">PROOF</th>
                <th className="px-6 py-4 text-center">FILES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-avatar-ring/20 bg-white/40">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-body-muted">
                    No payment history recorded yet.
                  </td>
                </tr>
              ) : (
                records.map((h) => (
                  <tr key={h.id} className="hover:bg-black/[0.02] transition">
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-brand">{h.id}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink">Unit {h.roomNumber}</p>
                      <p className="text-xs text-body-muted">{h.receiptNo}</p>
                    </td>
                    <td className="px-6 py-4 text-ink">{h.date}</td>
                    <td className="px-6 py-4 font-semibold text-ink">{bahtAmount(h.amount)}</td>
                    <td className="px-6 py-4 text-ink">{h.method}</td>
                    <td className="px-6 py-4">
                      {h.slipName ? (
                        <span className="inline-flex items-center gap-1.5 text-moss-545 font-medium text-xs">
                          <Paperclip size={14} aria-hidden="true" />
                          {h.slipName}
                        </span>
                      ) : (
                        <span className="text-xs text-body-muted">Not attached (optional)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center">
                        <a
                          href={`/documents?type=Receipt&unit=${h.roomNumber}`}
                          className="flex size-9 items-center justify-center rounded-lg border border-avatar-ring/40 bg-white text-ink-muted hover:text-brand hover:bg-accent-soft transition cursor-pointer shadow-xs"
                          aria-label={`Receipt files for unit ${h.roomNumber}`}
                          title={`Receipt files for unit ${h.roomNumber}`}
                        >
                          <Paperclip size={16} aria-hidden="true" />
                        </a>
                      </div>
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
          Carried balances reference the original invoice. A payment is recorded once; carrying a debt forward must never
          create a second debt.
        </p>
      </div>
    </div>
  )
}
