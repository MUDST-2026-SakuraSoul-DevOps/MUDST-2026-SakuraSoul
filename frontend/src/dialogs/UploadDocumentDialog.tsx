import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { UploadCloud, FileText, ScanText, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { CustomSelect } from '../components/CustomSelect'
import {
  errorMessage,
  fetchLeases,
  fetchReceipts,
  fetchRoomMaintenance,
  uploadDocument,
} from '../api/client'
import type {
  DocumentOwnerKind,
  DocumentType,
  Lease,
  MaintenanceStatus,
  RoomSummary,
  ScannedDocument,
} from '../api/types'
import { useLoader } from '../hooks/useLoader'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABEL,
  MAX_DESCRIPTION_LENGTH,
  OWNER_KIND_OF_TYPE,
  formatFileSize,
  ocrDescription,
  simulateContractOcr,
  type OcrExtractionData,
} from '../domain/documents'
import { NO_FILE_MESSAGE, UPLOAD_ACCEPT, UPLOAD_HINT, checkUploadFile } from '../lib/fileSignature'
import { displayDate, todayInBangkok } from '../format'

interface UploadDocumentDialogProps {
  /** null ระหว่างที่หน้า Documents ยังโหลดรายการห้องไม่เสร็จ */
  rooms: RoomSummary[] | null
  roomsError: string | null
  initialType: DocumentType
  /**
   * ห้องที่กรองอยู่ในหน้า Documents ไม่มีคือให้ผู้ใช้เลือกเอง จะได้ไม่แนบผิดห้องโดยไม่ตั้งใจ
   * ลิงก์ ?unit=102&upload=1 เปิดป็อปอัปก่อนรายการห้องโหลดเสร็จ ค่านี้จึงมาทีหลังได้ อย่าเก็บลง state ตอน mount
   */
  initialRoomId: number | null
  onClose: () => void
  onUploaded: (doc: ScannedDocument) => void
}

/** ตัวเลือกเจ้าของหนึ่งราย สัญญาแนบตัวสัญญามาด้วยให้ OCR จำลองใช้ */
interface OwnerOption {
  id: number
  label: string
  lease?: Lease
}

const OWNER_FIELD: Record<DocumentOwnerKind, { label: string; empty: string }> = {
  LEASE: { label: 'Lease', empty: 'This unit has no leases yet.' },
  MAINTENANCE_TICKET: { label: 'Maintenance ticket', empty: 'This unit has no maintenance tickets yet.' },
  RECEIPT: { label: 'Receipt', empty: 'This unit has no receipts yet.' },
}

const TICKET_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
}

const TYPE_OPTIONS = DOCUMENT_TYPES.map((type) => ({ value: type, label: DOCUMENT_TYPE_LABEL[type] }))

/** สัญญาที่มีผลวันนี้ */
function runsOn(lease: Lease, today: string): boolean {
  return lease.status === 'ACTIVE' && lease.startDate <= today && (lease.endDate === null || lease.endDate >= today)
}

function leaseLabel(lease: Lease): string {
  const end = lease.endDate ? displayDate(lease.endDate) : 'Indefinite'
  const ended = lease.status === 'ENDED' ? ' (ended)' : ''
  return `${lease.tenantName} · ${displayDate(lease.startDate)} – ${end}${ended}`
}

/**
 * เจ้าของที่เลือกได้ของห้องหนึ่งตามชนิดเอกสาร ตัวแรกคือตัวที่ถูกเลือกไว้ให้
 * สัญญาเอาทุกสถานะ สัญญาที่จบแล้วก็ยังสแกนเก็บได้ สัญญาที่มีผลวันนี้ขึ้นก่อน ที่เหลือใหม่สุดก่อน
 * (สัญญาที่เริ่มเดือนหน้าของห้องเดียวกันจึงไม่ถูกเลือกแทนโดยไม่ตั้งใจ)
 * ใบแจ้งซ่อมรวมใบที่ปิดแล้ว (DONE) ตามสัญญา API ใบเสร็จของห้องคือใบเสร็จของทุกสัญญาในห้องนั้น
 */
async function loadOwnerOptions(type: DocumentType, roomId: number): Promise<OwnerOption[]> {
  switch (OWNER_KIND_OF_TYPE[type]) {
    case 'LEASE': {
      const today = todayInBangkok()
      const leases = await fetchLeases({ roomId })
      return [...leases]
        .sort(
          (a, b) =>
            Number(runsOn(b, today)) - Number(runsOn(a, today)) ||
            b.startDate.localeCompare(a.startDate) ||
            b.id - a.id,
        )
        .map((lease) => ({ id: lease.id, label: leaseLabel(lease), lease }))
    }
    case 'MAINTENANCE_TICKET': {
      const tickets = await fetchRoomMaintenance(roomId)
      return [...tickets]
        .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt) || b.id - a.id)
        .map((ticket) => ({
          id: ticket.id,
          label: `#${ticket.id} ${ticket.title} · ${TICKET_STATUS_LABEL[ticket.status]}`,
        }))
    }
    case 'RECEIPT': {
      const leases = await fetchLeases({ roomId })
      const receipts = (await Promise.all(leases.map((lease) => fetchReceipts({ leaseId: lease.id })))).flat()
      return receipts
        .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth) || b.id - a.id)
        .map((receipt) => ({
          id: receipt.id,
          label: `${receipt.receiptNo} · ${receipt.billingMonth} · ${receipt.tenantName}`,
        }))
    }
  }
}

/**
 * อัปโหลดเอกสารสแกนเข้าคลังกลาง (SSK-172) ส่งไฟล์จริงแบบ multipart ไปที่ POST /api/documents
 *
 * ผู้ใช้เลือกห้องแล้วเลือกเจ้าของตามชนิดเอกสาร (สัญญา ใบแจ้งซ่อม หรือใบเสร็จ) แทนการพิมพ์เลขห้องกับชื่อผู้เช่า
 * ห้องกับชื่อผู้เช่าที่โชว์ในคลังจึงมาจากข้อมูลจริงเสมอ ไฟล์ตรวจด้วยกฎเดียวกับ backend ก่อนส่ง
 * ถ้า server ปฏิเสธ ป็อปอัปไม่ปิดและค่าที่กรอกไว้ไม่หาย
 */
export function UploadDocumentDialog({
  rooms,
  roomsError,
  initialType,
  initialRoomId,
  onClose,
  onUploaded,
}: UploadDocumentDialogProps) {
  const today = todayInBangkok()
  const [type, setType] = useState<DocumentType>(initialType)
  const [chosenRoomId, setChosenRoomId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [scanDate, setScanDate] = useState(today)
  const [description, setDescription] = useState('')
  const [chosenOwner, setChosenOwner] = useState<{ key: string; id: number } | null>(null)
  const [ocr, setOcr] = useState<{ ownerId: number; data: OcrExtractionData } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // ไฟล์ที่เลือกทีหลังชนะเสมอ แม้ไฟล์ก่อนหน้าจะตรวจเสร็จช้ากว่า
  const latestPick = useRef(0)

  const roomId = chosenRoomId ?? initialRoomId
  const ownerKind = OWNER_KIND_OF_TYPE[type]
  // ตัวเลือกเจ้าของผูกกับชนิดและห้องที่โหลดมา เปลี่ยนชนิดหรือห้องแล้วจะไม่หยิบรายการเก่ามาโชว์หรือส่ง
  const ownerKey = `${type}:${roomId ?? ''}`
  const owners = useLoader(
    async () => ({ key: ownerKey, options: roomId === null ? [] : await loadOwnerOptions(type, roomId) }),
    'Could not load what this document can be attached to',
    [ownerKey],
  )
  const ownerOptions = owners.data?.key === ownerKey ? owners.data.options : null
  const ownerId =
    chosenOwner?.key === ownerKey && ownerOptions?.some((option) => option.id === chosenOwner.id)
      ? chosenOwner.id
      : (ownerOptions?.[0]?.id ?? null)
  const selectedLease = ownerOptions?.find((option) => option.id === ownerId)?.lease ?? null
  const ocrData = ocr !== null && ocr.ownerId === ownerId ? ocr.data : null

  // ปิดระหว่างอัปโหลดไม่ได้ ไม่งั้น error ที่ตามมาจะไม่มีที่ให้โชว์ (Esc ฉากหลัง และปุ่มกากบาทของ Modal เรียกตัวนี้)
  function handleClose() {
    if (!submitting) {
      onClose()
    }
  }

  // select ที่ซ่อนอยู่ของ CustomSelect ส่งค่าอะไรก็ได้มา รับเฉพาะชนิดที่มีจริง
  function handleTypeChange(value: string) {
    const next = DOCUMENT_TYPES.find((candidate) => candidate === value)
    if (next) {
      setType(next)
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    const pick = ++latestPick.current
    setFileError(null)
    if (!selected) {
      setFile(null)
      return
    }
    const problem = await checkUploadFile(selected)
    if (pick !== latestPick.current) {
      return
    }
    if (problem) {
      setFile(null)
      setFileError(problem)
      e.target.value = ''
      return
    }
    setFile(selected)
  }

  function handlePreviewOcr() {
    if (selectedLease && ownerId !== null) {
      setOcr({ ownerId, data: simulateContractOcr(selectedLease) })
    }
  }

  function updateOcr(change: Partial<OcrExtractionData>) {
    if (ocr !== null) {
      setOcr({ ...ocr, data: { ...ocr.data, ...change } })
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setFileError(NO_FILE_MESSAGE)
      return
    }
    if (ownerId === null) {
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await uploadDocument({
        file,
        type,
        scanDate,
        description,
        owner: { kind: ownerKind, id: ownerId },
      })
      onUploaded(created)
    } catch (error) {
      setSubmitError(errorMessage(error, 'Could not upload the document. Please try again.'))
      setSubmitting(false)
    }
  }

  const roomOptions = (rooms ?? []).map((room) => ({ value: String(room.id), label: `Unit ${room.roomNumber}` }))
  const ownerField = OWNER_FIELD[ownerKind]

  return (
    <Modal title="Upload document" subtitle="Central archive · Scanned contracts, reports & receipts" onClose={handleClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs" noValidate>
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
                <span className="text-[11px] text-body-muted">{formatFileSize(file.size)}</span>
              </div>
            ) : (
              <>
                <p className="font-semibold text-ink">Click or drag a file to upload</p>
                <p className="text-[11px] text-body-muted mt-0.5">{UPLOAD_HINT}</p>
              </>
            )}
            <input
              type="file"
              aria-label="Document file"
              accept={UPLOAD_ACCEPT}
              onChange={handleFileChange}
              disabled={submitting}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
          {fileError && (
            <p className="text-rose-600 text-xs mt-1.5 flex items-center gap-1" role="alert">
              <AlertCircle size={14} />
              {fileError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-ink mb-1">Document type</label>
            <CustomSelect<DocumentType>
              aria-label="Document type"
              value={type}
              onChange={handleTypeChange}
              options={TYPE_OPTIONS}
              placeholder=""
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block font-medium text-ink mb-1">Linked unit</label>
            <CustomSelect
              aria-label="Linked unit"
              value={roomId === null ? '' : String(roomId)}
              onChange={(value) => setChosenRoomId(value === '' ? null : Number(value))}
              options={roomOptions}
              placeholder={rooms !== null ? 'Choose a unit' : roomsError ? 'Units unavailable' : 'Loading units...'}
              disabled={submitting || rooms === null}
            />
          </div>
        </div>
        {roomsError && (
          <p className="text-rose-600" role="alert">
            {roomsError}
          </p>
        )}

        <div>
          <label className="block font-medium text-ink mb-1">{ownerField.label}</label>
          {owners.error && ownerOptions === null ? (
            <p className="text-rose-600" role="alert">
              {owners.error}
            </p>
          ) : ownerOptions === null ? (
            <p className="text-body-muted" role="status">
              Loading...
            </p>
          ) : ownerOptions.length === 0 ? (
            <p className="text-body-muted" role="status">
              {roomId === null ? 'Choose a unit first.' : ownerField.empty}
            </p>
          ) : (
            <CustomSelect
              aria-label={ownerField.label}
              value={String(ownerId)}
              onChange={(value) => setChosenOwner({ key: ownerKey, id: Number(value) })}
              options={ownerOptions.map((option) => ({ value: String(option.id), label: option.label }))}
              disabled={submitting}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="document-scan-date" className="block font-medium text-ink mb-1">
              Scan date
            </label>
            <input
              id="document-scan-date"
              type="date"
              max={today}
              value={scanDate}
              onChange={(e) => setScanDate(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="document-description" className="block font-medium text-ink mb-1">
              Description <span className="font-normal text-body-muted">(optional)</span>
            </label>
            <input
              id="document-description"
              type="text"
              value={description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Signed lease agreement"
              disabled={submitting}
              className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        {/* SSK-175 OCR ในเบราว์เซอร์ ใช้เติมคำอธิบายเท่านั้น */}
        {ownerKind === 'LEASE' && selectedLease && (
          <div className="rounded-xl border border-avatar-ring/60 bg-sand-60/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-ink flex items-center gap-1.5">
                  <ScanText size={15} className="text-brand" />
                  Auto-fill from the contract
                </p>
                <p className="text-[11px] text-body-muted">Local OCR · Only the description is saved</p>
              </div>
              <button
                type="button"
                onClick={handlePreviewOcr}
                disabled={submitting}
                className="flex items-center gap-1 rounded-lg border border-avatar-ring bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand hover:bg-sand-60 transition"
              >
                <FileText size={13} />
                Preview extraction
              </button>
            </div>

            {ocrData && (
              <div className="mt-3 pt-3 border-t border-avatar-ring/40 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    Needs manual review
                  </span>
                  <span className="text-[10px] text-body-muted">Check the values before using them</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-body-muted">
                    Tenant name
                    <input
                      type="text"
                      value={ocrData.tenantName}
                      onChange={(e) => updateOcr({ tenantName: e.target.value })}
                      className="mt-0.5 w-full rounded border border-sand-80 bg-white px-2 py-1 text-xs text-ink"
                    />
                  </label>
                  <label className="text-[10px] text-body-muted">
                    Lease start
                    <input
                      type="date"
                      value={ocrData.leaseStart}
                      onChange={(e) => updateOcr({ leaseStart: e.target.value })}
                      className="mt-0.5 w-full rounded border border-sand-80 bg-white px-2 py-1 text-xs text-ink"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setDescription(ocrDescription(ocrData).slice(0, MAX_DESCRIPTION_LENGTH))}
                  className="self-start rounded-lg border border-avatar-ring bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand hover:bg-sand-60 transition"
                >
                  Use as description
                </button>
              </div>
            )}
          </div>
        )}

        {submitError && (
          <p className="text-rose-600 text-xs flex items-center gap-1" role="alert">
            <AlertCircle size={14} />
            {submitError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <SecondaryButton type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting || ownerId === null}>
            {submitting ? 'Uploading...' : 'Add to library'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
