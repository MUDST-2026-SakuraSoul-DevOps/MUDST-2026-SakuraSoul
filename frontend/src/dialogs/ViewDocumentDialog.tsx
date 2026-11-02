import { useState, useEffect } from 'react'
import { Printer, Download, CheckCircle2 } from 'lucide-react'
import { Modal } from '../components/Modal'
import { SecondaryButton } from '../components/Button'
import type { StoredDocument } from '../domain/documents'

interface ViewDocumentDialogProps {
  doc: StoredDocument | null
  onClose: () => void
}

function UploadedFileView({ file, name }: { file: File; name: string }) {
  const [url] = useState(() => URL.createObjectURL(file))

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [url])

  if (file.type === 'application/pdf') {
    return (
      <iframe
        title={name}
        src={url}
        className="w-full h-[450px] rounded-lg border border-sand-80 bg-white"
      />
    )
  }

  return (
    <div className="flex items-center justify-center p-2">
      <img
        src={url}
        alt={`Document preview for ${name}`}
        className="max-h-[450px] max-w-full rounded-lg object-contain shadow-xs"
      />
    </div>
  )
}

export function ViewDocumentDialog({ doc, onClose }: ViewDocumentDialogProps) {
  if (!doc) return null

  function handlePrint() {
    window.print()
  }

  function handleDownload() {
    if (doc?.file) {
      const url = URL.createObjectURL(doc.file)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.name
      a.click()
      URL.revokeObjectURL(url)
    } else {
      alert(`Downloading ${doc?.name || 'document'}...`)
    }
  }

  return (
    <Modal
      title={doc.name}
      subtitle={`${doc.category} · Unit ${doc.unit} · ${doc.tenant}`}
      onClose={onClose}
      width="wide"
    >
      <div className="flex flex-col gap-4">
        {/* Document Viewer Frame */}
        <div className="min-h-[350px] max-h-[500px] overflow-auto rounded-xl border border-avatar-ring/60 bg-sand-60/30 p-4">
          {doc.file ? (
            <UploadedFileView file={doc.file} name={doc.name} />
          ) : (
            /* Styled Paper Representation for Seed / Archival Documents */
            <div className="mx-auto max-w-lg rounded-xl border border-avatar-ring/80 bg-white p-8 shadow-xs text-ink font-sans">
              <div className="flex items-start justify-between border-b border-sand-80 pb-4">
                <div>
                  <h3 className="font-heading text-lg font-bold text-brand">Sakura Soul Apartment</h3>
                  <p className="text-xs text-body-muted">Central Document Archive</p>
                </div>
                <div className="rounded-lg bg-sand-60 px-2.5 py-1 text-right">
                  <span className="block text-[10px] font-semibold tracking-wider text-brand uppercase">
                    {doc.category}
                  </span>
                  <span className="text-[11px] text-body-muted">{doc.date}</span>
                </div>
              </div>

              <div className="py-6 flex flex-col gap-3 text-xs">
                <div className="flex justify-between py-1 border-b border-sand-80">
                  <span className="text-body-muted">Document Name:</span>
                  <strong className="text-ink">{doc.name}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-sand-80">
                  <span className="text-body-muted">Target Unit:</span>
                  <strong className="text-ink">Unit {doc.unit}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-sand-80">
                  <span className="text-body-muted">Tenant / Resident:</span>
                  <strong className="text-ink">{doc.tenant}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-sand-80">
                  <span className="text-body-muted">Archived Date:</span>
                  <strong className="text-ink">{doc.date}</strong>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-body-muted">File Size:</span>
                  <span className="text-body-muted">{doc.size || '1.2 MB'}</span>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200/60 p-3 text-emerald-800 flex items-center gap-2 text-xs">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>Verified scanned archival record · Stored in Sakura Soul repository</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-sand-80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-avatar-ring bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-sand-60 transition"
            >
              <Download size={14} />
              Download file
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg border border-avatar-ring bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-sand-60 transition"
            >
              <Printer size={14} />
              Print
            </button>
          </div>

          <SecondaryButton type="button" onClick={onClose}>
            Close
          </SecondaryButton>
        </div>
      </div>
    </Modal>
  )
}
