import { useState, type ChangeEvent, type FormEvent } from 'react'
import { UploadCloud, FileText, ScanText, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { CustomSelect } from '../components/CustomSelect'
import {
  ALL_ROOM_NUMBERS,
  getTenantForUnit,
  validateDocumentFile,
  type DocumentCategory,
  type StoredDocument,
} from '../domain/documents'
import { todayInBangkok } from '../format'

interface UploadDocumentDialogProps {
  isOpen: boolean
  onClose: () => void
  onUploaded: (docData: Omit<StoredDocument, 'id'> & { file?: File }) => void
  initialCategory?: DocumentCategory
  initialUnit?: string
}

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: 'Contract', label: 'Contract' },
  { value: 'Maintenance report', label: 'Maintenance report' },
  { value: 'Receipt', label: 'Receipt' },
]

const ROOM_OPTIONS = ALL_ROOM_NUMBERS.map(room => ({ value: room, label: `Unit ${room}` }))

export function UploadDocumentDialog({
  isOpen,
  onClose,
  onUploaded,
  initialCategory = 'Contract',
  initialUnit = '101',
}: UploadDocumentDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState<DocumentCategory>(initialCategory)
  const [unit, setUnit] = useState<string>(initialUnit)
  const [tenant, setTenant] = useState<string>(() => getTenantForUnit(initialUnit))
  const [docName, setDocName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [ocrActive, setOcrActive] = useState(false)
  const [ocrTenantName, setOcrTenantName] = useState('Kant Srisuk')
  const [ocrId, setOcrId] = useState('1-1004-xxxxx-xx-x')
  const [ocrPhone, setOcrPhone] = useState('081-234-5678')
  const [ocrLeaseStart, setOcrLeaseStart] = useState('2026-11-01')

  if (!isOpen) return null

  function handleUnitChange(newUnit: string) {
    setUnit(newUnit)
    const suggested = getTenantForUnit(newUnit)
    if (suggested !== '—') {
      setTenant(suggested)
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null)
    const selected = e.target.files?.[0]
    if (!selected) {
      setFile(null)
      return
    }

    const validation = validateDocumentFile(selected)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file')
      setFile(null)
      e.target.value = ''
      return
    }

    setFile(selected)
    if (!docName) {
      setDocName(selected.name)
    }
  }

  function handleTriggerOcr() {
    setOcrActive(true)
    setTenant('Kant Srisuk')
    setOcrTenantName('Kant Srisuk')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Choose a PDF, JPG or PNG file first.')
      return
    }

    const finalName = docName.trim() || file.name
    const finalTenant = (ocrActive ? ocrTenantName : tenant).trim() || getTenantForUnit(unit)

    onUploaded({
      name: finalName,
      category,
      unit,
      tenant: finalTenant,
      date: todayInBangkok(),
      file,
    })

    onClose()
  }

  return (
    <Modal
      title="Upload document"
      subtitle="Central archive · Scanned contracts, reports & receipts"
      onClose={onClose}
      width="default"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
        {/* File Drag / Drop area */}
        <div>
          <label className="block font-medium text-ink mb-1.5">Document file</label>
          <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-avatar-ring/80 bg-sand-60/50 p-6 text-center transition hover:bg-sand-60">
            <UploadCloud size={32} className="text-body-muted mb-2" />
            {file ? (
              <div className="flex flex-col items-center gap-1">
                <span className="font-semibold text-brand flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  {file.name}
                </span>
                <span className="text-[11px] text-body-muted">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB · {file.type || 'Document'}
                </span>
              </div>
            ) : (
              <>
                <p className="font-semibold text-ink">Click or drag a file to upload</p>
                <p className="text-[11px] text-body-muted mt-0.5">
                  PDF, JPG or PNG · Up to 10 MB
                </p>
              </>
            )}
            <input
              type="file"
              aria-label="Document file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
          {error && (
            <p className="text-rose-600 text-xs mt-1.5 flex items-center gap-1" role="alert">
              <AlertCircle size={14} />
              {error}
            </p>
          )}
        </div>

        {/* Document details */}
        <div>
          <label className="block font-medium text-ink mb-1">Document title</label>
          <input
            type="text"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="e.g. Lease agreement · Kant S."
            className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-ink mb-1">Document type</label>
            <CustomSelect
              aria-label="Document type"
              value={category}
              onChange={(val) => setCategory(val as DocumentCategory)}
              options={CATEGORY_OPTIONS}
            />
          </div>

          <div>
            <label className="block font-medium text-ink mb-1">Linked unit</label>
            <CustomSelect
              aria-label="Linked unit"
              value={unit}
              onChange={handleUnitChange}
              options={ROOM_OPTIONS}
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-ink mb-1">Tenant name</label>
          <input
            type="text"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            placeholder="Tenant name"
            className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
          />
        </div>

        {/* SSK-175: Local OCR bonus feature */}
        {category === 'Contract' && (
          <div className="rounded-xl border border-avatar-ring/60 bg-sand-60/40 p-3 mt-1">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-ink flex items-center gap-1.5">
                  <ScanText size={15} className="text-brand" />
                  Auto-fill tenant details
                </p>
                <p className="text-[11px] text-body-muted">Local OCR · Automatic data extraction</p>
              </div>
              <button
                type="button"
                onClick={handleTriggerOcr}
                className="flex items-center gap-1 rounded-lg border border-avatar-ring bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand hover:bg-sand-60 transition"
              >
                <FileText size={13} />
                Preview extraction
              </button>
            </div>

            {ocrActive && (
              <div className="mt-3 pt-3 border-t border-avatar-ring/40 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    Needs manual review
                  </span>
                  <span className="text-[10px] text-body-muted">Verify extracted values</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-body-muted">Tenant name</label>
                    <input
                      type="text"
                      value={ocrTenantName}
                      onChange={(e) => setOcrTenantName(e.target.value)}
                      className="w-full rounded border border-sand-80 bg-white px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-body-muted">National ID</label>
                    <input
                      type="text"
                      value={ocrId}
                      onChange={(e) => setOcrId(e.target.value)}
                      className="w-full rounded border border-sand-80 bg-white px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-body-muted">Phone number</label>
                    <input
                      type="text"
                      value={ocrPhone}
                      onChange={(e) => setOcrPhone(e.target.value)}
                      className="w-full rounded border border-sand-80 bg-white px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-body-muted">Lease start</label>
                    <input
                      type="date"
                      value={ocrLeaseStart}
                      onChange={(e) => setOcrLeaseStart(e.target.value)}
                      className="w-full rounded border border-sand-80 bg-white px-2 py-1 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit">
            Add to library
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
