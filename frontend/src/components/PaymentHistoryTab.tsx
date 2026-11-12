import { Paperclip, Settings2, Info } from 'lucide-react'
import { Bank, ClipboardText, CalendarCheck, Plus } from '@phosphor-icons/react'
import { StatCard } from './StatCard'
import { PrimaryButton } from './Button'
import { type PaymentRecord } from '../domain/paymentPhase2'
import { baht, bahtAmount, todayInBangkok } from '../format'
import { displayBillingMonth } from '../domain/billing'
import { paymentRevenue } from '../domain/paymentLedger'

export function PaymentHistoryTab({
  records,
  onOpenSettings,
  onOpenNewDraft,
  onViewSlip,
  onVoidPayment,
  totalOutstanding = 0,
  paidInFullRatio = '0 / 0',
  invoicesAwaitingCount = 0,
}: {
  records: PaymentRecord[]
  onOpenSettings: () => void
  onOpenNewDraft?: () => void
  /** เปิดสลิปของการชำระนั้น (SSK-163) ดูหรือแนบภายหลังได้ ไม่ส่งมาคือไม่มีปุ่ม */
  onViewSlip?: (record: PaymentRecord) => void
  onVoidPayment?: (paymentId: number) => void
  totalOutstanding?: number
  paidInFullRatio?: string
  invoicesAwaitingCount?: number
}) {
  const isPendingLedger = (r: PaymentRecord) => r.status === 'Pending' || r.status === 'Overdue'
  const today = todayInBangkok()
  const revenue = paymentRevenue(records, today)

  return (
    <div className="flex flex-col gap-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard
          label="COLLECTED THIS MONTH"
          value={baht(revenue.monthly)}
          icon={Bank}
          footer={
            <span className="inline-flex items-center gap-1 rounded-sm bg-moss-360/10 px-2 py-1 text-xs font-medium text-moss-360">
              {revenue.monthlyCount} Payment records · {displayBillingMonth(today.slice(0, 7))}
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
                records.map((h) => {
                  const isPending = isPendingLedger(h)
                  return (
                    <tr key={h.id} className="hover:bg-black/[0.02] transition">
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-brand">{h.id}</td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-ink">Unit {h.roomNumber}</p>
                        <p className="text-xs text-body-muted">{h.receiptNo}</p>
                      </td>
                      <td className="px-6 py-4 text-ink">
                        {isPending ? (
                          <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium border border-honey-88/50 bg-honey-20 text-honey-350">
                            Awaiting payment
                          </span>
                        ) : (
                          <>{h.date}{h.status === 'Voided' && <span className="ml-2 text-xs text-alert-525">Voided</span>}</>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-ink">{bahtAmount(h.amount)}</td>
                      <td className="px-6 py-4 text-ink">
                        {isPending ? (
                          <span className="text-xs text-body-muted">Pending</span>
                        ) : (
                          h.method
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isPending ? (
                          <span className="text-xs text-body-muted/70">Unpaid</span>
                        ) : onViewSlip && h.paymentId !== undefined && h.status !== 'Voided' ? (
                          <button
                            type="button"
                            onClick={() => onViewSlip(h)}
                            aria-label={`Payment slip for ${h.id}`}
                            className="inline-flex items-center gap-1.5 text-moss-545 hover:text-moss-600 hover:underline font-medium text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-moss-545 rounded-sm"
                          >
                            <Paperclip size={14} aria-hidden="true" />
                            Slip
                          </button>
                        ) : (
                          <span className="text-xs text-body-muted">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <a
                            href={`/documents?type=Receipt&unit=${h.roomNumber}`}
                            className="flex size-9 items-center justify-center rounded-lg border border-avatar-ring/40 bg-white text-ink-muted hover:text-brand hover:bg-accent-soft transition cursor-pointer shadow-xs"
                            aria-label={`Receipt files for unit ${h.roomNumber}`}
                            title={`View receipts for Unit ${h.roomNumber} in Documents`}
                          >
                            <Paperclip size={15} aria-hidden="true" />
                          </a>
                          {onVoidPayment && h.paymentId !== undefined && h.canVoid && (
                            <button
                              type="button"
                              onClick={() => onVoidPayment(h.paymentId!)}
                              aria-label={`Void payment ${h.id}`}
                              className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
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
