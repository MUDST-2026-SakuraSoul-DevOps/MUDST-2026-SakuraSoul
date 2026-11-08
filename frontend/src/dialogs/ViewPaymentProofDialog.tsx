import { useState, useEffect } from 'react'
import { Modal } from '../components/Modal'
import { SecondaryButton } from '../components/Button'
import { type PaymentRecord, createPaymentSlipPdfBlob } from '../domain/paymentPhase2'
import { baht } from '../format'
import { CheckCircle2, Download, Printer, ExternalLink, ShieldCheck, FileText, Smartphone } from 'lucide-react'

export interface ViewPaymentProofDialogProps {
  record: PaymentRecord | null
  onClose: () => void
}

function SlipPdfViewer({ record }: { record: PaymentRecord }) {
  const [url] = useState(() => {
    const blob = createPaymentSlipPdfBlob(record)
    return URL.createObjectURL(blob)
  })

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [url])

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <iframe
        title={`Payment Slip PDF - ${record.id}`}
        src={url}
        className="w-full h-[430px] rounded-lg border border-sand-80 bg-white"
      />
      <span className="text-xs font-mono text-body-muted">
        {record.slipName ? record.slipName.replace(/\.[^.]+$/, '.pdf') : `${record.id}.pdf`}
      </span>
    </div>
  )
}

export function ViewPaymentProofDialog({ record, onClose }: ViewPaymentProofDialogProps) {
  const [downloadNotice, setDownloadNotice] = useState(false)
  const [viewMode, setViewMode] = useState<'slip' | 'pdf'>('slip')

  if (!record) return null

  function handlePrint() {
    window.print()
  }

  function handleDownload() {
    if (!record) return
    const blob = createPaymentSlipPdfBlob(record)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fileName = record.slipName
      ? record.slipName.replace(/\.[^.]+$/, '.pdf')
      : `transfer-${record.roomNumber}-${record.id}.pdf`
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)

    setDownloadNotice(true)
    setTimeout(() => setDownloadNotice(false), 2500)
  }

  return (
    <Modal
      title="Payment Proof"
      subtitle={`${record.id} · Unit ${record.roomNumber} · ${record.tenantName}`}
      onClose={onClose}
      width="default"
    >
      <div className="flex flex-col gap-4">
        {/* Toggle between E-Slip Card and PDF File view */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-lg border border-avatar-ring/60 bg-sand-50/70 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('slip')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition cursor-pointer ${
                viewMode === 'slip' ? 'bg-white text-brand shadow-xs' : 'text-body-muted hover:text-ink'
              }`}
            >
              <Smartphone size={14} />
              Mobile E-Slip
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition cursor-pointer ${
                viewMode === 'pdf' ? 'bg-white text-brand shadow-xs' : 'text-body-muted hover:text-ink'
              }`}
            >
              <FileText size={14} />
              PDF Document
            </button>
          </div>
        </div>

        {/* Proof Viewer Container */}
        <div className="overflow-hidden rounded-xl border border-avatar-ring/60 bg-sand-60/25 p-4 flex flex-col items-center">
          {viewMode === 'pdf' ? (
            <SlipPdfViewer record={record} />
          ) : record.slipUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={record.slipUrl}
                alt={`Proof slip for receipt ${record.id}`}
                className="max-h-[420px] max-w-full rounded-lg object-contain shadow-md"
              />
              <span className="text-xs font-mono text-body-muted">{record.slipName}</span>
            </div>
          ) : (
            /* Styled Authentic Mobile Banking Transfer E-Slip Card */
            <div className="w-full max-w-sm rounded-2xl border border-honey-140/60 bg-white p-5 shadow-sm text-ink">
              {/* Slip Header Banner */}
              <div className="flex items-center justify-between border-b border-sand-80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-moss-360/15 text-moss-545 font-bold text-xs">
                    {record.method === 'PromptPay' ? 'PP' : 'KB'}
                  </div>
                  <div>
                    <h4 className="font-heading text-sm font-bold text-ink">
                      {record.method === 'PromptPay' ? 'PromptPay E-Slip' : 'Bank Transfer Slip'}
                    </h4>
                    <p className="text-[11px] text-body-muted">Kasikornbank · K PLUS</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-moss-360/10 px-2 py-0.5 text-[11px] font-semibold text-moss-545">
                  <CheckCircle2 size={13} className="shrink-0" />
                  Successful
                </span>
              </div>

              {/* Amount */}
              <div className="my-4 rounded-xl bg-sand-50/70 p-3 text-center">
                <span className="block text-[11px] font-medium uppercase tracking-wider text-body-muted">
                  Amount Transferred
                </span>
                <span className="font-mono text-2xl font-bold text-brand">
                  {baht(record.amount)}
                </span>
              </div>

              {/* Transfer Details */}
              <div className="flex flex-col gap-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-sand-70/60 pb-2">
                  <span className="text-body-muted">Date & Time</span>
                  <span className="font-medium text-ink">{record.date} · 10:42</span>
                </div>
                <div className="flex items-center justify-between border-b border-sand-70/60 pb-2">
                  <span className="text-body-muted">From</span>
                  <span className="font-medium text-ink text-right">
                    {record.tenantName} <span className="text-body-muted">(Unit {record.roomNumber})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-sand-70/60 pb-2">
                  <span className="text-body-muted">To</span>
                  <span className="font-medium text-ink text-right">
                    Sakura Soul Apartment
                    <small className="block text-[10px] text-body-muted">012-3-45678-9 (KBank)</small>
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-sand-70/60 pb-2">
                  <span className="text-body-muted">Invoice Ref</span>
                  <span className="font-mono font-medium text-ink">{record.receiptNo}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-body-muted">Transaction ID</span>
                  <span className="font-mono text-xs text-brand">{record.id}</span>
                </div>
              </div>

              {/* Security Verification Footer */}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-moss-360/20 bg-moss-360/5 px-2.5 py-1.5 text-[11px] text-moss-545">
                <span className="inline-flex items-center gap-1 font-medium">
                  <ShieldCheck size={14} />
                  Slip Verified & Archived
                </span>
                <span className="font-mono text-[10px] text-body-muted">{record.slipName}</span>
              </div>
            </div>
          )}
        </div>

        {downloadNotice && (
          <p className="rounded-lg bg-moss-360/10 p-2 text-center text-xs text-moss-545 font-medium">
            Downloaded PDF slip for {record.slipName || `${record.id}.pdf`}!
          </p>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-avatar-ring/30 pt-3">
          <a
            href={`/documents?type=Receipt&unit=${record.roomNumber}`}
            className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline font-medium"
          >
            <ExternalLink size={14} />
            View receipts for Unit {record.roomNumber} in Documents
          </a>

          <div className="flex items-center gap-2">
            <SecondaryButton onClick={handlePrint} aria-label="Print slip">
              <Printer size={15} />
              Print
            </SecondaryButton>
            <SecondaryButton onClick={handleDownload} aria-label="Download slip">
              <Download size={15} />
              Download PDF
            </SecondaryButton>
            <SecondaryButton onClick={onClose} aria-label="Close proof dialog">
              Close
            </SecondaryButton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
