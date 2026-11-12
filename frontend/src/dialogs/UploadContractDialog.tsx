import { useRef, useState, type ChangeEvent } from 'react'
import { AlertCircle, Building2, FileText, FileUp, Upload, X } from 'lucide-react'
import { errorMessage, uploadDocument } from '../api/client'
import type { Lease } from '../api/types'
import { formatFileSize } from '../domain/documents'
import { UPLOAD_ACCEPT, UPLOAD_HINT, checkUploadFile } from '../lib/fileSignature'
import { displayDate, todayInBangkok } from '../format'

/**
 * Dialog อัปโหลดไฟล์สัญญาที่เซ็นแล้ว ตรงกับ Figma "Upload Signed Contract"
 *
 * ส่งไฟล์จริงเข้าคลังเอกสาร (SSK-172) เป็นเอกสารชนิด CONTRACT_SCAN ของสัญญานี้ วันที่สแกนเป็นวันนี้
 * ไฟล์ตรวจด้วยกฎเดียวกับ backend ก่อนส่ง ถ้า server ปฏิเสธ ป็อปอัปไม่ปิดและโชว์ข้อความที่ได้กลับมา
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
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // ไฟล์ที่เลือกทีหลังชนะเสมอ แม้ไฟล์ก่อนหน้าจะตรวจเสร็จช้ากว่า
  const latestPick = useRef(0)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    // ล้างค่าใน input ให้เลือกไฟล์เดิมซ้ำได้หลังกดเอาไฟล์ออก
    e.target.value = ''
    const pick = ++latestPick.current
    setError(null)
    if (!selected) {
      return
    }
    const problem = await checkUploadFile(selected)
    if (pick !== latestPick.current) {
      return
    }
    setFile(problem ? null : selected)
    setError(problem)
  }

  async function handleUpload() {
    if (!file) {
      return
    }
    setUploading(true)
    setError(null)
    try {
      await uploadDocument({
        file,
        type: 'CONTRACT_SCAN',
        scanDate: todayInBangkok(),
        description: 'Signed lease agreement',
        owner: { kind: 'LEASE', id: lease.id },
      })
      onUploaded()
    } catch (err) {
      setError(errorMessage(err, 'Could not upload the contract. Please try again.'))
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={uploading ? undefined : onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload Signed Contract"
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-honey-140/50 bg-white p-7 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between pb-4">
          <div>
            <h2 className="font-heading text-xl font-bold text-sand-830">Upload Signed Contract</h2>
            <p className="mt-0.5 text-xs text-sand-530">Store the physical copy after both parties have signed</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close"
            className="icon-button rounded-md p-1 text-sand-530 hover:bg-black/5 hover:text-sand-830"
          >
            <X aria-hidden="true" className="ui-icon size-icon-control" />
          </button>
        </div>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3.5 rounded-xl border border-sand-65 bg-sand-45 p-3.5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-white border border-sand-110 text-sand-530">
              <Building2 aria-hidden="true" className="ui-icon size-icon-inline" />
            </div>
            <div>
              <p className="text-sm font-semibold text-sand-830">
                Unit {lease.roomNumber} · {lease.tenantName}
              </p>
              <p className="text-xs text-sand-530">
                Contract CT-00{lease.id} · {displayDate(lease.startDate)} —{' '}
                {lease.endDate ? displayDate(lease.endDate) : 'Indefinite'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-830 mb-1.5">
              Signed contract file <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRef}
              aria-label="Signed contract file"
              onChange={handleFileChange}
              accept={UPLOAD_ACCEPT}
              className="hidden"
            />
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blush-150 bg-page-bg py-9 px-6 text-center transition hover:border-wine-750"
            >
              <div className="flex size-10 items-center justify-center text-wine-600 mb-2">
                <FileUp strokeWidth={1.5} className="ui-icon size-icon-feature text-blush-490" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-sand-830">
                Drag a file here, or <span className="text-wine-630 underline">browse</span>
              </p>
              <p className="mt-1 text-xs text-sand-320">{UPLOAD_HINT}</p>
            </div>
          </div>

          {file && (
            <div className="flex items-center justify-between rounded-xl border border-blush-125 bg-page-bg p-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded bg-blush-80 text-alert-520">
                  <FileText aria-hidden="true" className="ui-icon size-icon-inline" />
                </div>
                <div>
                  <p className="break-all text-xs font-semibold text-sand-830">{file.name}</p>
                  <p className="text-xs text-sand-320">{formatFileSize(file.size)} · selected</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Remove attached contract"
                onClick={() => setFile(null)}
                disabled={uploading}
                className="icon-button rounded p-1 text-sand-530 hover:bg-black/5 hover:text-rose-600"
              >
                <X aria-hidden="true" className="ui-icon size-icon-control" />
              </button>
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1 text-xs text-rose-600" role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

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
            <Upload aria-hidden="true" className="ui-icon size-icon-control" />
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
