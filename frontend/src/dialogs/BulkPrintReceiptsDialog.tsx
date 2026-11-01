import { Printer, Paperclip } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { type PaymentRecord } from '../domain/paymentPhase2'
import { baht } from '../format'

export function BulkPrintReceiptsDialog({
  isOpen,
  receipts,
  onClose,
}: {
  isOpen: boolean
  receipts: PaymentRecord[]
  onClose: () => void
}) {
  if (!isOpen) return null

  function handlePrint() {
    window.print()
  }

  return (
    <Modal
      title="Bulk print receipts"
      subtitle="SSK-169 · Only payments actually received become receipts."
      onClose={onClose}
      width="wide"
    >
      <div className="flex flex-col gap-6">
        {receipts.length === 0 ? (
          <div className="rounded-lg border border-honey-140/60 bg-honey-20/40 p-6 text-center text-sm text-honey-600">
            No payment receipts found for the selected invoices. Only received payments generate receipts.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-1 flex flex-col gap-4">
            {receipts.map((rc) => (
              <article
                key={rc.id}
                className="flex flex-col gap-3 rounded-xl border border-avatar-ring/40 bg-white/70 p-5 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-avatar-ring/30 pb-3">
                  <div>
                    <h4 className="font-heading text-base font-semibold text-brand">Sakura Soul Apartment</h4>
                    <p className="text-xs text-body-muted">PAYMENT RECEIPT · {rc.id}</p>
                  </div>
                  <span className="inline-flex items-center rounded-sm bg-moss-50 px-2.5 py-1 text-xs font-medium text-moss-545">
                    Paid
                  </span>
                </div>

                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-body-muted">Tenant</span>
                    <strong className="text-ink font-semibold">{rc.tenantName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-body-muted">Unit / Invoice</span>
                    <span className="text-ink">
                      Unit {rc.roomNumber} · {rc.receiptNo}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-body-muted">Received on</span>
                    <span className="text-ink">
                      {rc.date} · {rc.method}
                    </span>
                  </div>
                  {rc.slipName && (
                    <div className="flex justify-between">
                      <span className="text-body-muted">Proof</span>
                      <span className="inline-flex items-center gap-1 text-moss-545 font-medium">
                        <Paperclip size={13} />
                        {rc.slipName}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-avatar-ring/30 pt-2 text-sm">
                    <span className="font-medium text-ink">Amount received</span>
                    <strong className="font-bold text-brand">{baht(rc.amount)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-avatar-ring/30 pt-4">
          <SecondaryButton type="button" onClick={onClose} aria-label="Close">
            Close
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={receipts.length === 0}
            onClick={handlePrint}
            aria-label={`Print ${receipts.length} receipts`}
          >
            <Printer size={16} aria-hidden="true" />
            Print {receipts.length} receipts
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  )
}
