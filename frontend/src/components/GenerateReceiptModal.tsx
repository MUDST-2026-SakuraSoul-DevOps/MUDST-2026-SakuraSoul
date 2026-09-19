import { useCallback, useState } from 'react'
import { Receipt, Download, Printer } from 'lucide-react'
import { yenAmount } from '../format'
import { downloadReceipt, printReceiptPdf, type ReceiptData, SAMPLE_RECEIPT } from '../domain/receipt'
import { Modal } from './Modal'

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

  function handleDownloadPdf() {
    downloadReceipt(receipt, 'pdf')
  }

  function handlePrint() {
    printReceiptPdf(receipt)
  }

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
        <Modal
          title="Generate Receipt"
          onClose={handleClose}
          footer={
            <div className="flex w-full gap-3">
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
                onClick={handlePrint}
                aria-label="Print receipt"
                className="flex items-center justify-center gap-2 rounded-lg border border-[rgba(212,194,195,0.5)] bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-black/5 cursor-pointer"
              >
                <Printer size={16} />
                Print
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                aria-label="Download (PDF)"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#5b3a3c] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#4a2e30] transition-colors cursor-pointer"
              >
                <Download size={16} />
                Download (PDF)
              </button>
            </div>
          }
        >
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
        </Modal>
      )}
    </>
  )
}

