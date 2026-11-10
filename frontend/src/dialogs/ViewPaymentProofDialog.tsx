import { useState, useEffect } from 'react'
import { Modal } from '../components/Modal'
import { SecondaryButton } from '../components/Button'
import { type PaymentRecord, createPaymentSlipPdfBlob } from '../domain/paymentPhase2'
import { Download, Printer, ExternalLink, FileText, Smartphone } from 'lucide-react'

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
  const [viewMode, setViewMode] = useState<'slip' | 'pdf'>(record?.slipUrl ? 'slip' : 'pdf')

  if (!record) return null

  function handlePrint() {
    if (!record) return
    const blob = createPaymentSlipPdfBlob(record)
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = url
    document.body.appendChild(iframe)
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch {
        window.print()
      }
      setTimeout(() => {
        try {
          document.body.removeChild(iframe)
        } catch {
          // ignore
        }
        URL.revokeObjectURL(url)
      }, 60000)
    }
  }

  function handleDownload() {
    if (!record) return
    const blob = createPaymentSlipPdfBlob(record)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fileName = record.slipName
      ? record.slipName.replace(/\.[^.]+$/, '.pdf')
      : `payment-record-${record.roomNumber}-${record.id}.pdf`
    a.download = fileName
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 1000)

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
            <div className="flex flex-col items-center justify-center p-8 text-center text-body-muted gap-2.5">
              <div className="flex size-12 items-center justify-center rounded-full bg-sand-100 text-sand-530">
                <FileText size={24} />
              </div>
              <h4 className="font-heading text-sm font-semibold text-ink">No payment proof uploaded</h4>
              <p className="text-xs text-body-muted max-w-xs">
                No transfer slip was uploaded for this record. You can inspect or download the system-generated payment record PDF below.
              </p>
              <button
                type="button"
                onClick={() => setViewMode('pdf')}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-honey-140 bg-white px-3 py-1.5 text-xs font-semibold text-brand shadow-xs hover:bg-page-bg transition cursor-pointer"
              >
                <FileText size={14} />
                View PDF Document
              </button>
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
