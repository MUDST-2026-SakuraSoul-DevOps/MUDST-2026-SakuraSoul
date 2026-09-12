import { useCallback, useEffect, useState } from 'react'
import { Receipt, Download, Printer, X } from 'lucide-react'
import { yenAmount } from '../format'
import { downloadReceipt, type ReceiptData, SAMPLE_RECEIPT } from '../domain/receipt'

export function GenerateReceiptModal({
  receipt = SAMPLE_RECEIPT,
  isOpen,
  onClose,
  trigger = true,
}: {
  receipt?: ReceiptData
  isOpen?: boolean
  onClose?: () => void
  trigger?: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = isOpen !== undefined
  const open = isControlled ? isOpen : internalOpen

  const handleClose = useCallback(() => {
    if (isControlled && onClose) {
      onClose()
    } else {
      setInternalOpen(false)
    }
  }, [isControlled, onClose])

  function handleOpen() {
    if (!isControlled) {
      setInternalOpen(true)
    }
  }

  function handleDownloadImage() {
    downloadReceipt(receipt, 'image')
  }

  function handlePrintPdf() {
    downloadReceipt(receipt, 'pdf')
  }

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  return (
    <>
      {trigger && (
        <button
          type="button"
          aria-label="View invoice"
          className="hover:text-ink cursor-pointer"
          onClick={handleOpen}
        >
          <Receipt size={18} />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={handleClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-receipt-title"
            className="flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-[rgba(238,217,196,0.5)] bg-white p-8 shadow-[0px_20px_60px_-15px_rgba(122,84,87,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="generate-receipt-title" className="text-2xl font-bold text-ink">
                Generate Receipt
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={handleClose}
                className="text-body-muted hover:text-ink cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex flex-col gap-5 rounded-lg border border-[rgba(212,194,195,0.4)] p-6">
              <div className="flex flex-col items-center gap-1 border-b border-[rgba(212,194,195,0.3)] pb-4 text-center">
                <p className="text-lg font-semibold text-ink">Sakura Soul Apartment</p>
                <p className="text-sm text-body-muted">Payment Receipt</p>
              </div>

              <div className="flex flex-col gap-2 border-b border-[rgba(212,194,195,0.3)] pb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-body-muted">Receipt no.</span>
                  <span className="text-ink">{receipt.receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-body-muted">Tenant</span>
                  <span className="text-ink">{receipt.tenant}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-body-muted">Unit</span>
                  <span className="text-ink">{receipt.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-body-muted">Billing month</span>
                  <span className="text-ink">{receipt.billingMonth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-body-muted">Due date</span>
                  <span className="text-ink">{receipt.dueDate}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-2 text-xs font-medium tracking-[0.6px] text-body-muted uppercase">
                  <span>Item</span>
                  <span className="text-right">Usage</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Amount</span>
                </div>
                {receipt.items.map((row) => (
                  <div key={row.id} className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-ink">{row.item}</p>
                      {row.detail && <p className="text-xs text-body-muted">{row.detail}</p>}
                    </div>
                    <span className="text-right text-ink">
                      {row.usageValue != null ? `${row.usageValue} ${row.usageUnit || ''}` : '—'}
                    </span>
                    <span className="text-right text-ink">{row.rate != null ? yenAmount(row.rate) : '—'}</span>
                    <span data-testid="receipt-item-amount" className="text-right text-ink">
                      {yenAmount(row.amount)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] pt-4">
                <span className="text-lg text-ink">Total amount</span>
                <span data-testid="receipt-total-amount" className="font-heading text-3xl font-bold text-brand">
                  {yenAmount(receipt.totalAmount)}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] pt-4">
                <span
                  className={`inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium ${
                    receipt.status === 'Paid' ? 'bg-[#e8f5e9] text-[#2e7d32]' : 'bg-[#fff8e1] text-[#f57f17]'
                  }`}
                >
                  {receipt.status}
                </span>
                <span className="text-sm text-body-muted">
                  {receipt.paidDate ? `${receipt.paidDate} · ${receipt.paymentMethod || 'Bank transfer'}` : 'Unpaid'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cancel"
                className="rounded-lg border border-[rgba(212,194,195,0.5)] bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-black/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrintPdf}
                aria-label="Print / PDF"
                className="flex items-center justify-center gap-2 rounded-lg border border-[#5b3a3c] bg-white px-4 py-2.5 text-sm font-medium text-[#5b3a3c] shadow-sm hover:bg-[#5b3a3c]/5 transition-colors cursor-pointer"
              >
                <Printer size={16} />
                Print / PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadImage}
                aria-label="Download"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#5b3a3c] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#4a2e30] transition-colors cursor-pointer"
              >
                <Download size={16} />
                Download (Image)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

