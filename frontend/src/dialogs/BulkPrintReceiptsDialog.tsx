import { useEffect, useRef, useState } from 'react'
import { Printer, Paperclip } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { type PaymentRecord } from '../domain/paymentPhase2'
import { printReceipts } from '../api/client'
import { downloadBlob } from '../lib/downloadFile'
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
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  const [pdf, setPdf] = useState<{ blob: Blob; url: string } | null>(null)
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url) }, [pdf])

  if (!isOpen) return null

  async function handlePrint() {
    setPrinting(true)
    setPrintError(null)
    const token = ++request.current
    try {
      const receiptIds = [...new Set(receipts.map(receipt => receipt.receiptId))]
      const blob = await printReceipts({ receiptIds })
      if (request.current === token) setPdf({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      if (request.current === token) setPrintError(err instanceof Error ? err.message : 'Could not print receipts')
    } finally {
      if (request.current === token) setPrinting(false)
    }
  }

  return (
    <Modal
      title="Bulk print receipts"
      subtitle="Only payments actually received become receipts."
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
                      {rc.date}{rc.method ? ` · ${rc.method}` : ''}
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

        {pdf && <>
          <iframe title="Receipt PDF preview" src={pdf.url} className="h-[60vh] w-full rounded-lg border" />
          <SecondaryButton onClick={() => downloadBlob('receipts.pdf', pdf.blob)} aria-label="Download receipt PDF">Download PDF</SecondaryButton>
        </>}
        {printError && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            {printError}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-avatar-ring/30 pt-4">
          <SecondaryButton type="button" onClick={onClose} aria-label="Close">
            Close
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={receipts.length === 0 || printing}
            onClick={handlePrint}
            aria-label={`Print ${receipts.length} receipts`}
          >
            <Printer size={16} aria-hidden="true" />
            {printing ? 'Generating PDF...' : `Print ${receipts.length} receipts`}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  )
}
