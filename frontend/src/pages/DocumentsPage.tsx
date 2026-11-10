import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileText,
  Search,
  UploadCloud,
  Eye,
  Trash2,
  X,
  FileCheck,
  AlertCircle,
} from 'lucide-react'
import { Folder, Files as FilesIcon, Receipt } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { CustomSelect } from '../components/CustomSelect'
import {
  ALL_ROOM_NUMBERS,
  useDocuments,
  getCategoryBadgeClass,
  type DocumentCategory,
  type StoredDocument,
} from '../domain/documents'
import { UploadDocumentDialog } from '../dialogs/UploadDocumentDialog'
import { ViewDocumentDialog } from '../dialogs/ViewDocumentDialog'

type TabType = 'All documents' | DocumentCategory

const TAB_OPTIONS: TabType[] = ['All documents', 'Contract', 'Maintenance report', 'Receipt']

const UNIT_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All units' },
  ...ALL_ROOM_NUMBERS.map(room => ({ value: room, label: `Unit ${room}` })),
]

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [docs, addDocument, deleteDocument] = useDocuments()

  // URL state
  const paramType = searchParams.get('type')
  const activeTab: TabType = useMemo(() => {
    if (paramType === 'Contract' || paramType === 'Maintenance report' || paramType === 'Receipt') {
      return paramType
    }
    return 'All documents'
  }, [paramType])

  const selectedUnit = searchParams.get('unit') || 'ALL'
  const isUploadParam = searchParams.get('upload') === '1'

  const [searchQuery, setSearchQuery] = useState('')
  const [manualUploadOpen, setManualUploadOpen] = useState(false)
  const [viewingDoc, setViewingDoc] = useState<StoredDocument | null>(null)
  const [deletingDoc, setDeletingDoc] = useState<StoredDocument | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const uploadOpen = isUploadParam || manualUploadOpen

  function showToast(message: string) {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage(null)
    }, 3500)
  }

  function handleTabChange(tab: TabType) {
    const nextParams = new URLSearchParams(searchParams)
    if (tab === 'All documents') {
      nextParams.delete('type')
    } else {
      nextParams.set('type', tab)
    }
    setSearchParams(nextParams, { replace: true })
  }

  function handleUnitChange(unit: string) {
    const nextParams = new URLSearchParams(searchParams)
    if (unit === 'ALL') {
      nextParams.delete('unit')
    } else {
      nextParams.set('unit', unit)
    }
    setSearchParams(nextParams, { replace: true })
  }

  function handleResetFilters() {
    setSearchQuery('')
    setSearchParams({}, { replace: true })
  }

  function handleCloseUpload() {
    setManualUploadOpen(false)
    if (isUploadParam) {
      const next = new URLSearchParams(searchParams)
      next.delete('upload')
      setSearchParams(next, { replace: true })
    }
  }

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      // Category Tab filter
      if (activeTab !== 'All documents' && doc.category !== activeTab) {
        return false
      }

      // Unit filter
      if (selectedUnit !== 'ALL' && doc.unit !== selectedUnit) {
        return false
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const searchable = `${doc.name} ${doc.category} ${doc.unit} ${doc.tenant} ${doc.date}`.toLowerCase()
        if (!searchable.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [docs, activeTab, selectedUnit, searchQuery])

  function handleDeleteConfirm() {
    if (!deletingDoc) return
    deleteDocument(deletingDoc.id)
    showToast(`Deleted document "${deletingDoc.name}"`)
    setDeletingDoc(null)
  }

  const hasActiveFilters = searchQuery.trim() !== '' || selectedUnit !== 'ALL' || activeTab !== 'All documents'

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Toast Notification */}
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

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between text-xs text-body-muted gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Sakura Soul</span>
          <span>›</span>
          <span className="text-ink font-semibold">Documents</span>
        </div>
      </div>

      {/* Page Header */}
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

      {/* 3 Bento Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="STORED DOCUMENTS"
          value={String(docs.length)}
          icon={Folder}
          footer={<p className="text-xs text-body-muted">Across all categories and units</p>}
        />
        <StatCard
          label="CONTRACTS"
          value={String(docs.filter((d) => d.category === 'Contract').length)}
          icon={FilesIcon}
          footer={<p className="text-xs text-body-muted">Active and archived lease scans</p>}
        />
        <StatCard
          label="REPORTS & RECEIPTS"
          value={String(docs.filter((d) => d.category !== 'Contract').length)}
          icon={Receipt}
          footer={<p className="text-xs text-body-muted">Service reports and payment proofs</p>}
        />
      </div>

      {/* Subnavigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 p-1 bg-white/70 rounded-xl border border-avatar-ring/40 w-fit">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              aria-label={`${tab} tab`}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === tab
                  ? 'bg-accent-soft text-brand shadow-xs'
                  : 'text-body-muted hover:text-ink'
              }`}
            >
              {tab}
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

      {/* Filter and Search Bar Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-honey-140/60 bg-white p-4 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-body-muted"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Search documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search filename, unit, tenant or date"
              className="w-full rounded-xl border border-avatar-ring/80 bg-sand-60/40 pl-9 pr-3 py-2 text-xs text-ink placeholder:text-body-muted/70 focus:border-brand focus:bg-white focus:outline-none transition"
            />
          </div>

          {/* Unit Filter dropdown */}
          <div className="w-40">
            <CustomSelect
              aria-label="Filter by unit"
              value={selectedUnit}
              onChange={handleUnitChange}
              options={UNIT_FILTER_OPTIONS}
            />
          </div>
        </div>

        <span className="text-xs text-body-muted">
          Showing <strong>{filteredDocs.length}</strong> of {docs.length} documents
        </span>
      </div>

      {/* Main Documents Table Card */}
      <div className="overflow-hidden rounded-2xl border border-honey-140/60 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-sand-80 bg-sand-60/60 text-ink-muted uppercase tracking-[0.5px]">
                <th scope="col" className="py-3.5 px-5 font-semibold">Document</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Type</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Unit / Tenant</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Added</th>
                <th scope="col" className="py-3.5 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-80/60">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-body-muted">
                    <p className="font-medium text-ink">No matching documents found</p>
                    <p className="text-xs text-body-muted mt-1">
                      Try clearing your search query or uploading a new document.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-sand-60/30 transition">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sand-60 text-brand">
                          <FileText size={16} />
                        </div>
                        <div>
                          <span className="font-semibold text-ink block">{doc.name}</span>
                          <span className="text-[11px] text-body-muted">{doc.size || '1.0 MB'}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getCategoryBadgeClass(
                          doc.category,
                        )}`}
                      >
                        {doc.category}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-semibold text-ink">Unit {doc.unit}</div>
                      <div className="text-[11px] text-body-muted">{doc.tenant}</div>
                    </td>

                    <td className="py-3 px-4 text-body-muted">
                      {doc.date}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingDoc(doc)}
                          aria-label={`View document ${doc.name}`}
                          className="flex size-8 items-center justify-center rounded-lg border border-transparent text-body-muted hover:border-avatar-ring hover:bg-white hover:text-brand transition cursor-pointer"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingDoc(doc)}
                          aria-label={`Delete document ${doc.name}`}
                          className="flex size-8 items-center justify-center rounded-lg border border-transparent text-body-muted hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="border-t border-sand-80/60 bg-sand-60/20 px-5 py-3 text-right text-[11px] text-body-muted">
          PDF, JPG, PNG · Maximum 10 MB per file · Encrypted and stored securely in Sakura Soul archive
        </div>
      </div>

      {/* Upload Document Dialog */}
      <UploadDocumentDialog
        isOpen={uploadOpen}
        onClose={handleCloseUpload}
        initialCategory={activeTab !== 'All documents' ? activeTab : 'Contract'}
        initialUnit={selectedUnit !== 'ALL' ? selectedUnit : '101'}
        onUploaded={(newDoc) => {
          const created = addDocument(newDoc)
          showToast(`Uploaded "${created.name}" to archive`)
        }}
      />

      {/* View Document Dialog */}
      <ViewDocumentDialog
        doc={viewingDoc}
        onClose={() => setViewingDoc(null)}
      />

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDeletingDoc(null)}
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
              Are you sure you want to remove <strong>{deletingDoc.name}</strong> from the document archive?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="rounded-lg border border-sand-80 bg-white px-3.5 py-1.5 font-medium text-ink hover:bg-sand-60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="rounded-lg bg-rose-600 px-3.5 py-1.5 font-medium text-white hover:bg-rose-700 transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
