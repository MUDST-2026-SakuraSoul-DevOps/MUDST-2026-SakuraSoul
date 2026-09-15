import { useState, useRef } from 'react'
import { Building2, FileText, FileUp, Upload, X } from 'lucide-react'
import type { Lease } from '../api/types'

/**
 * Dialog อัปโหลดไฟล์สัญญาที่เซ็นแล้ว — ตรงกับ Figma "Upload Signed Contract"
 */
export function UploadContractDialog({
  lease,
  onClose,
  onUploaded,
}: {
  lease: Lease
  onClose: () => void
  onUploaded: () => void
}) {
  const [file, setFile] = useState<{ name: string; size: string } | null>({
    name: 'CT-0042-signed.pdf',
    size: '2.4 MB · uploaded just now',
  })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0]
      const sizeMb = (f.size / (1024 * 1024)).toFixed(1)
      setFile({
        name: f.name,
        size: `${sizeMb} MB · selected`,
      })
    }
  }

  function handleUpload() {
    setUploading(true)
    setTimeout(() => {
      setUploading(false)
      onUploaded()
      onClose()
    }, 500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload Signed Contract"
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-white p-7 shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4">
          <div>
            <h2 className="font-heading text-xl font-bold text-sand-830">Upload Signed Contract</h2>
            <p className="mt-0.5 text-xs text-sand-530">Store the physical copy after both parties have signed</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-sand-530 hover:bg-black/5 hover:text-sand-830"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 py-2">
          {/* Unit info banner card */}
          <div className="flex items-center gap-3.5 rounded-xl border border-sand-65 bg-sand-45 p-3.5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-white border border-sand-110 text-sand-530">
              <Building2 size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-sand-830">
                Unit {lease?.roomNumber ?? '101'} · {lease?.tenantName ?? 'Somchai P.'}
              </p>
              <p className="text-xs text-sand-530">
                Contract CT-00{lease?.id ?? 42} · 1 Sep 2026 — 31 Aug 2027
              </p>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div>
            <label className="block text-xs font-semibold text-sand-830 mb-1.5">
              Signed contract file <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blush-150 bg-page-bg py-9 px-6 text-center transition hover:border-wine-750"
            >
              <div className="flex size-10 items-center justify-center text-wine-600 mb-2">
                <FileUp size={36} strokeWidth={1.5} className="text-blush-490" />
              </div>
              <p className="text-sm font-medium text-sand-830">
                Drag a file here, or <span className="text-wine-630 underline">browse</span>
              </p>
              <p className="mt-1 text-xs text-sand-320">PDF or JPG · up to 10 MB</p>
            </div>
          </div>

          {/* Attached File Preview Box */}
          {file && (
            <div className="flex items-center justify-between rounded-xl border border-blush-125 bg-page-bg p-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded bg-blush-80 text-alert-520">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-sand-830">{file.name}</p>
                  <p className="text-[11px] text-sand-320">{file.size}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="rounded p-1 text-sand-530 hover:bg-black/5 hover:text-rose-600"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-start gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg border border-sand-110 bg-white px-5 py-2 text-xs font-medium text-sand-830 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file}
            className="flex items-center gap-2 rounded-lg bg-wine-750 px-5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-wine-800 disabled:opacity-40"
          >
            <Upload size={14} />
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
