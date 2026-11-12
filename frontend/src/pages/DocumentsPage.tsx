import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, Search, UploadCloud, Eye, Trash2, X, FileCheck, AlertCircle } from 'lucide-react'
import { Folder, Files as FilesIcon, Receipt } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { CustomSelect } from '../components/CustomSelect'
import { ErrorState } from '../components/PageState'
import { deleteDocument, errorMessage, fetchDocuments, fetchRooms } from '../api/client'
import type { DocumentType, ScannedDocument } from '../api/types'
import { useLoader } from '../hooks/useLoader'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABEL,
  documentOwnerLabel,
  documentTitle,
  documentTypeBadgeClass,
  documentTypeFromParam,
  formatFileSize,
} from '../domain/documents'
import { UPLOAD_HINT } from '../lib/fileSignature'
import { displayDate } from '../format'
import { UploadDocumentDialog } from '../dialogs/UploadDocumentDialog'
import { ViewDocumentDialog } from '../dialogs/ViewDocumentDialog'

/** รอให้พิมพ์เสร็จก่อนค่อยค้น ไม่ยิงคำขอทุกตัวอักษร */
const SEARCH_DELAY_MS = 300

const NO_DOCUMENTS: ScannedDocument[] = []

/**
 * คลังเอกสารสแกน (SSK-161, SSK-172) อ่านและลบผ่าน /api/documents ไฟล์จริงอยู่ในฐานข้อมูลของ backend
 *
 * ตัวกรองอยู่ใน URL (?type=Receipt&unit=102&upload=1) หน้าอื่นลิงก์มาที่ชนิดกับห้องได้ตรง ๆ
 * กรองที่ server ทั้งหมด ชนิดส่งเป็น type ห้องแปลงเลขห้องเป็น roomId และคำค้นส่งเป็น q
 * การ์ดสรุปนับจากเอกสารทั้งหมด ไม่ขึ้นกับตัวกรอง
 */
export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeType = documentTypeFromParam(searchParams.get('type'))
  const unitParam = searchParams.get('unit')
  const isUploadParam = searchParams.get('upload') === '1'

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [manualUploadOpen, setManualUploadOpen] = useState(false)
  const [viewingDoc, setViewingDoc] = useState<ScannedDocument | null>(null)
  const [deletingDoc, setDeletingDoc] = useState<ScannedDocument | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const rooms = useLoader(fetchRooms, 'Could not load the units')
  const roomsLoading = rooms.data === null && rooms.error === null
  const unitRoom = unitParam === null ? null : (rooms.data?.find((room) => room.roomNumber === unitParam) ?? null)
  // ?unit= เป็นเลขห้อง แต่ API กรองด้วย roomId จึงต้องรอรายการห้องก่อน ไม่งั้นตารางโชว์เอกสารทุกห้องแวบหนึ่ง
  // เลขห้องที่ไม่มีจริงได้รายการว่าง เหมือนที่ backend ตอบ roomId ที่ไม่มีจริง
  const unitPending = unitParam !== null && unitRoom === null
  const listKey = [activeType, unitParam, unitRoom?.id, search].join('|')
  const documents = useLoader(
    async () => ({
      key: listKey,
      waitedForUnit: unitPending,
      rows: unitPending
        ? NO_DOCUMENTS
        : await fetchDocuments({ type: activeType ?? undefined, roomId: unitRoom?.id, q: search }),
    }),
    'Could not load the documents',
    [listKey],
  )
  const allDocuments = useLoader(() => fetchDocuments(), 'Could not load the documents')

  // เปลี่ยนตัวกรองแล้วยังโชว์ผลเดิมระหว่างรอผลใหม่ ยกเว้นผลว่างที่ได้ตอนยังแปลงเลขห้องไม่ได้
  const list = documents.data
  const loadingList =
    (unitPending && roomsLoading) ||
    (list === null ? documents.error === null : list.key !== listKey && list.waitedForUnit)
  const shown = list?.rows ?? NO_DOCUMENTS
  const all = allDocuments.data ?? NO_DOCUMENTS
  const uploadOpen = isUploadParam || manualUploadOpen

  function reloadDocuments() {
    documents.reload()
    allDocuments.reload()
  }

  function showToast(message: string) {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 3500)
  }

  function updateParam(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams)
    if (value === null) {
      next.delete(name)
    } else {
      next.set(name, value)
    }
    setSearchParams(next, { replace: true })
  }

  function handleResetFilters() {
    setSearchInput('')
    setSearch('')
    setSearchParams({}, { replace: true })
  }

  function handleCloseUpload() {
    setManualUploadOpen(false)
    if (isUploadParam) {
      updateParam('upload', null)
    }
  }

  function handleUploaded(doc: ScannedDocument) {
    handleCloseUpload()
    reloadDocuments()
    showToast(`Uploaded "${documentTitle(doc)}" to archive`)
  }

  function closeDeleteDialog() {
    setDeletingDoc(null)
    setDeleteError(null)
  }

  async function handleDeleteConfirm() {
    if (!deletingDoc) {
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteDocument(deletingDoc.id)
      showToast(`Deleted document "${documentTitle(deletingDoc)}"`)
      setDeletingDoc(null)
      reloadDocuments()
    } catch (error) {
      setDeleteError(errorMessage(error, 'Could not delete the document. Please try again.'))
    } finally {
      setDeleting(false)
    }
  }

  const hasActiveFilters = searchInput.trim() !== '' || unitParam !== null || activeType !== null
  const tabs: { type: DocumentType | null; label: string }[] = [
    { type: null, label: 'All documents' },
    ...DOCUMENT_TYPES.map((type) => ({ type, label: DOCUMENT_TYPE_LABEL[type] })),
  ]
  const unitOptions = [
    { value: 'ALL', label: 'All units' },
    ...(rooms.data ?? []).map((room) => ({ value: room.roomNumber, label: `Unit ${room.roomNumber}` })),
  ]
  const listError = documents.error ?? rooms.error

  return (
    <div className="flex flex-col gap-6 font-sans">
      {toastMessage && (
        <div
          role="status"
          className="fixed top-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-avatar-ring/80 bg-white px-4 py-3 text-xs font-semibold text-brand shadow-lg transition"
        >
          <FileCheck size={18} className="text-emerald-600" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-body-muted hover:text-ink"
            aria-label="Dismiss toast"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between text-xs text-body-muted gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Sakura Soul</span>
          <span>›</span>
          <span className="text-ink font-semibold">Documents</span>
        </div>
      </div>

      <PageHeader
        title="Document Library"
        description="Find contracts, maintenance reports, and receipts across all units and tenants."
        actions={
          <button
            type="button"
            onClick={() => setManualUploadOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-blush-120 px-5 py-2.5 text-xs font-semibold text-brand shadow-xs transition hover:bg-blush-170 cursor-pointer"
          >
            <UploadCloud size={16} aria-hidden="true" />
            Upload document
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="STORED DOCUMENTS"
          value={allDocuments.data ? String(all.length) : '–'}
          icon={Folder}
          footer={<p className="text-xs text-body-muted">Across all categories and units</p>}
        />
        <StatCard
          label="CONTRACTS"
          value={allDocuments.data ? String(all.filter((d) => d.type === 'CONTRACT_SCAN').length) : '–'}
          icon={FilesIcon}
          footer={<p className="text-xs text-body-muted">Active and archived lease scans</p>}
        />
        <StatCard
          label="REPORTS & RECEIPTS"
          value={allDocuments.data ? String(all.filter((d) => d.type !== 'CONTRACT_SCAN').length) : '–'}
          icon={Receipt}
          footer={<p className="text-xs text-body-muted">Service reports and receipt scans</p>}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 p-1 bg-white/70 rounded-xl border border-avatar-ring/40 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => updateParam('type', tab.type === null ? null : tab.label)}
              aria-label={`${tab.label} tab`}
              aria-pressed={activeType === tab.type}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeType === tab.type ? 'bg-accent-soft text-brand shadow-xs' : 'text-body-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs font-medium text-brand hover:underline cursor-pointer"
          >
            Reset all filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-honey-140/60 bg-white p-4 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-body-muted"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Search documents"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search description, file name, unit or tenant"
              className="w-full rounded-xl border border-avatar-ring/80 bg-sand-60/40 pl-9 pr-3 py-2 text-xs text-ink placeholder:text-body-muted/70 focus:border-brand focus:bg-white focus:outline-none transition"
            />
          </div>

          <div className="w-40">
            <CustomSelect
              aria-label="Filter by unit"
              value={unitParam ?? 'ALL'}
              onChange={(unit) => updateParam('unit', unit === 'ALL' ? null : unit)}
              options={unitOptions}
            />
          </div>
        </div>

        <span className="text-xs text-body-muted">
          Showing <strong>{shown.length}</strong> of {all.length} documents
        </span>
      </div>

      {listError && <ErrorState message={listError} />}

      <div className="overflow-hidden rounded-2xl border border-honey-140/60 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-sand-80 bg-sand-60/60 text-ink-muted uppercase tracking-[0.5px]">
                <th scope="col" className="py-3.5 px-5 font-semibold">Document</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Type</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Unit / Tenant</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Scan date</th>
                <th scope="col" className="py-3.5 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-80/60">
              {loadingList ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-body-muted">
                    Loading documents...
                  </td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-body-muted">
                    <p className="font-medium text-ink">No matching documents found</p>
                    <p className="text-xs text-body-muted mt-1">
                      Try clearing your search query or uploading a new document.
                    </p>
                  </td>
                </tr>
              ) : (
                shown.map((doc) => {
                  const title = documentTitle(doc)
                  return (
                    <tr key={doc.id} className="hover:bg-sand-60/30 transition">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sand-60 text-brand">
                            <FileText size={16} />
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-ink block break-words">{title}</span>
                            <span className="text-[11px] text-body-muted break-all">
                              {doc.description === null ? '' : `${doc.fileName} · `}
                              {formatFileSize(doc.sizeBytes)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${documentTypeBadgeClass(doc.type)}`}
                        >
                          {DOCUMENT_TYPE_LABEL[doc.type]}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-ink">Unit {doc.owner.roomNumber}</div>
                        <div className="text-[11px] text-body-muted">
                          {doc.owner.tenantName ?? documentOwnerLabel(doc.owner)}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-body-muted">{displayDate(doc.scanDate)}</td>

                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingDoc(doc)}
                            aria-label={`View document ${title}`}
                            className="flex size-8 items-center justify-center rounded-lg border border-transparent text-body-muted hover:border-avatar-ring hover:bg-white hover:text-brand transition cursor-pointer"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDoc(doc)}
                            aria-label={`Delete document ${title}`}
                            className="flex size-8 items-center justify-center rounded-lg border border-transparent text-body-muted hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-sand-80/60 bg-sand-60/20 px-5 py-3 text-right text-[11px] text-body-muted">
          {UPLOAD_HINT} per file · Stored in the Sakura Soul archive
        </div>
      </div>

      {uploadOpen && (
        <UploadDocumentDialog
          rooms={rooms.data}
          roomsError={rooms.error}
          initialType={activeType ?? 'CONTRACT_SCAN'}
          initialRoomId={unitRoom?.id ?? null}
          onClose={handleCloseUpload}
          onUploaded={handleUploaded}
        />
      )}

      {viewingDoc && <ViewDocumentDialog key={viewingDoc.id} doc={viewingDoc} onClose={() => setViewingDoc(null)} />}

      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={deleting ? undefined : closeDeleteDialog}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm Delete Document"
            className="relative z-10 w-full max-w-sm rounded-2xl border border-avatar-ring bg-white p-6 shadow-xl text-xs"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="font-heading text-sm font-bold text-ink">Delete Document</h3>
                <p className="text-body-muted text-[11px]">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-body-muted mb-4">
              Are you sure you want to remove <strong>{documentTitle(deletingDoc)}</strong> from the document archive?
            </p>

            {deleteError && (
              <p className="mb-3 text-rose-600" role="alert">
                {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deleting}
                className="rounded-lg border border-sand-80 bg-white px-3.5 py-1.5 font-medium text-ink hover:bg-sand-60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="rounded-lg bg-rose-600 px-3.5 py-1.5 font-medium text-white hover:bg-rose-700 transition cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
