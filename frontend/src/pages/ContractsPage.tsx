import { useMemo, useState } from 'react'
import { FileText, SquarePen, Upload, FileCode, ChevronLeft, ChevronRight, Plus, Paperclip, Search, Clock } from 'lucide-react'
import { fetchLeases, fetchRooms, fetchTenants, fetchDocuments } from '../api/client'
import type { Lease } from '../api/types'
import { leaseDisplayStatus, leaseRentInfo, type LeaseDisplayStatus } from '../domain/lease'
import { roomTypeLabel } from '../domain/room'
import { useLoader } from '../hooks/useLoader'
import { DataTable } from '../components/DataTable'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'
import { ContractFormDialog } from '../dialogs/ContractFormDialog'
import { ContractPreviewDialog } from '../dialogs/ContractPreviewDialog'
import { ContractPdfDialog } from '../dialogs/ContractPdfDialog'
import { ContractTemplateDialog } from '../dialogs/ContractTemplateDialog'
import { UploadContractDialog } from '../dialogs/UploadContractDialog'
import { displayDate, todayInBangkok } from '../format'

/**
 * หน้า Contract Management ตรงกับ Figma ดีไซน์
 * - ทุกคอลัมน์อ่านจากข้อมูลจริง ค่าเช่าคือ monthlyRent ที่ backend ล็อกตามประเภทห้อง (SSK-127)
 * - มีปุ่ม Create Contract
 * - มีปุ่ม Edit เพื่อสลับโหมดแก้ไข
 * - ในโหมดแก้ไข คอลัมน์ Actions จะแสดงครบทั้ง 3 ปุ่ม:
 *     1. Edit Contract (Pencil)
 *     2. Print / Save as PDF (FileText)
 *     3. Contract Template (FileCode)
 */
export default function ContractsPage() {
  const [isEditMode, setIsEditMode] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingLease, setEditingLease] = useState<Lease | null>(null)
  const [viewingPreviewLease, setViewingPreviewLease] = useState<Lease | null>(null)
  const [viewingPdfLease, setViewingPdfLease] = useState<Lease | null>(null)
  const [uploadingLease, setUploadingLease] = useState<Lease | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)

  const contracts = useLoader(async () => {
    const [leases, rooms, tenants] = await Promise.all([fetchLeases(), fetchRooms(), fetchTenants()])
    return { leases, rooms, tenants }
  }, 'Failed to load contracts')

  const today = todayInBangkok()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(() => new URLSearchParams(window.location.search).get('status') ?? 'all')
  const scans = useLoader(() => fetchDocuments({ type: 'CONTRACT_SCAN' }), 'Could not load attached scans')
  const allLeases = useMemo(() => contracts.data?.leases ?? [], [contracts.data])
  const leases = useMemo(() => allLeases.filter((lease) => {
    const matchesStatus = status === 'all' || leaseDisplayStatus(lease, today) === status
    const text = `${lease.roomNumber} ${lease.tenantName} ${lease.id}`.toLowerCase()
    return matchesStatus && text.includes(search.trim().toLowerCase())
  }), [allLeases, status, search, today])
  const PAGE_SIZE = 5

  /*
    จำนวนหน้าคิดจากสัญญาจริง เดิมเขียนตายตัวไว้ 3 หน้า มีสัญญาเกิน 15 ฉบับก็เปิดดูไม่ได้
    หน้าที่แสดงจริงบีบไม่ให้เกินหน้าสุดท้ายเสมอ ลบสัญญาจนหน้าหายไปก็ไม่ค้างอยู่หน้าว่าง
    และสร้างสัญญาใหม่แล้วสั่งไปหน้าสุดท้ายได้ด้วยการตั้งเลขหน้าให้เกินไว้ (E2E-CONTRACT-001)
  */
  const totalPages = Math.max(1, Math.ceil(leases.length / PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)

  const paginatedLeases = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return leases.slice(start, start + PAGE_SIZE)
  }, [leases, page])

  /*
    SSK-127 ทุกคอลัมน์อ่านจากข้อมูลจริงของสัญญากับห้อง

    เดิมฟังก์ชันชุดนี้เขียนค่าตายตัวตามชื่อผู้เช่าให้ตรงกับตัวอย่างใน Figma เช่น
    Tanaka ได้ "Unit 4A - Sakura Wing" ค่าเช่า 35,000 และ Sato ได้ Pending Signature
    ใช้กับข้อมูลจริงแล้วผิดทันที (ผู้เช่าชื่อสมชายที่เช่าเดือนละ 3,500 ขึ้นเป็น 400,000 ต่อปี)
    และขัดกับ feedback อาจารย์ข้อ 5 ที่ให้ค่าเช่าฟิกตามประเภทห้อง
  */
  const roomById = useMemo(
    () => new Map((contracts.data?.rooms ?? []).map((room) => [room.id, room])),
    [contracts.data],
  )

  const STATUS_STYLE: Record<LeaseDisplayStatus, string> = {
    Active: 'bg-sand-40 text-honey-560 border border-honey-170',
    'Ending Soon': 'bg-blush-50 text-alert-520 border border-cta-bg',
    Ended: 'bg-sand-50 text-sand-430 border border-sand-90',
  }

  function getLeaseStatusInfo(lease: Lease) {
    const label = leaseDisplayStatus(lease, today)
    return { label, style: STATUS_STYLE[label] }
  }

  function getAmountInfo(lease: Lease) {
    return leaseRentInfo(lease)
  }

  function getDurationInfo(lease: Lease) {
    return {
      start: displayDate(lease.startDate),
      end: `to ${lease.endDate ? displayDate(lease.endDate) : 'Indefinite'}`,
    }
  }

  // ชั้นกับประเภทห้องยึดสำเนาในสัญญาก่อน ปรับโครงสร้างอาคารแล้วสัญญาเก่ายังแสดงค่าเดิม (SSK-160/SSK-180)
  function getRoomTypeLabel(lease: Lease) {
    return roomTypeLabel(lease.roomType ?? roomById.get(lease.roomId)?.roomType)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-normal text-ink sm:text-4xl">Contract Management</h1>
          <p className="mt-2 text-sm text-ink-muted">Manage resident agreements, lease periods, and their attached documents.</p>
        </div>
        <a href="/documents?type=Contract" className="dashboard-shortcut"><FileText size={16} aria-hidden="true" />View all documents</a>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="flex w-full flex-col gap-2 text-sm text-ink-muted sm:w-52">
          Contract status
          <select aria-label="Contract status" value={status} onChange={(e) => { setStatus(e.target.value); setCurrentPage(1) }} className="min-h-11 rounded-lg border border-card-border bg-white px-3 py-2 text-ink">
            <option value="all">All contracts</option><option value="Active">Active</option><option value="Ending Soon">Ending soon</option><option value="Ended">Ended</option>
          </select>
        </label>
        <button type="button" onClick={() => setCreating(true)} className="flex min-h-11 items-center gap-2 rounded-lg bg-blush-120 px-5 py-2.5 text-sm font-medium text-brand shadow-sm hover:bg-blush-170">
          <Plus size={18} aria-hidden="true" />Create Contract
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Current leases', value: String(allLeases.filter((lease) => leaseDisplayStatus(lease, today) !== 'Ended').length), description: 'Current occupancy agreements', icon: FileText },
          { label: 'Ending soon', value: String(allLeases.filter((lease) => leaseDisplayStatus(lease, today) === 'Ending Soon').length), description: 'Within the next 30 days', icon: Clock },
          { label: 'Attached scans', value: scans.data ? String(scans.data.length) : '—', description: scans.error ?? 'Shared with the Document Library', icon: Paperclip },
        ].map(({ label, value, description, icon: Icon }) => (
          <div key={label} className="relative rounded-xl border border-card-border bg-white p-5">
            <Icon className="absolute right-5 top-5 size-5 text-brand/40" aria-hidden="true" />
            <p className="pr-6 text-xs uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-3 font-heading text-3xl text-ink">{value}</p><p className="mt-3 text-xs text-ink-muted">{description}</p>
          </div>
        ))}
      </div>

      {/* Main Table Card */}
      <div className="overflow-hidden rounded-xl border border-card-border bg-white">
        <div className="border-b border-card-border p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-heading text-xl text-ink">Lease agreements</h2><p className="mt-1 text-xs text-ink-muted">Manage agreements here. Open Files on an agreement to view its scans in Documents.</p></div>
            {!isEditMode && <button type="button" onClick={() => setIsEditMode(true)} className="min-h-11 rounded-lg border border-card-border px-4 py-2 text-sm text-brand hover:bg-page-bg">Edit</button>}
          </div>
          <label className="relative mt-5 block w-full max-w-md">
            <span className="sr-only">Search contract, room or tenant</span><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }} placeholder="Search contract, room or tenant" className="min-h-11 w-full rounded-lg border border-card-border bg-page-bg py-2 pl-10 pr-3 text-sm outline-none focus:border-brand" />
          </label>
        </div>
        {contracts.loading && (
          <div className="p-8">
            <LoadingState label="Loading contracts..." />
          </div>
        )}
        {contracts.error && (
          <div className="p-8">
            <ErrorState message={contracts.error} />
          </div>
        )}
        {!contracts.loading && !contracts.error && leases.length === 0 && (
          <div className="p-8">
            <EmptyState
              title="No contracts found"
              hint="Click 'Create Contract' or check in a tenant from the Dashboard."
            />
          </div>
        )}

        {leases.length > 0 && (
          <div className="overflow-x-auto">
            <DataTable
              rows={paginatedLeases}
              rowKey={(lease) => lease.id}
              minWidth={880}
              headRowClass="border-b border-sand-65 bg-page-bg"
              headCellClass="px-6 py-4 text-xs font-semibold tracking-[0.8px] text-sand-320 uppercase"
              bodyClass="divide-y divide-sand-65"
              rowClass="transition hover:bg-page-bg"
              cellClass="px-5 py-4"
              empty="No data"
              emptyCellClass="px-6 py-12 text-center text-sm font-medium text-sand-530"
              columns={[
                {
                  key: 'unit',
                  header: 'UNIT',
                  cell: (lease) => <div><p className="font-medium text-ink">{lease.roomNumber}</p><p className="mt-1 text-xs text-ink-muted">{getRoomTypeLabel(lease)}</p></div>,
                },
                {
                  key: 'tenant',
                  header: 'CONTRACT / TENANT',
                  cell: (lease) => <div><p className="font-medium text-ink">{lease.tenantName}</p><p className="mt-1 text-xs text-ink-muted">LS-{lease.id}</p></div>,
                },
                {
                  key: 'amount',
                  header: 'RENT / MONTH',
                  cell: (lease) => {
                    const amountInfo = getAmountInfo(lease)
                    return (
                      <>
                        <p className="font-heading text-lg font-normal text-sand-830 tracking-tight">
                          {amountInfo.amount}
                        </p>
                        <p className="text-xs text-sand-530">{amountInfo.label}</p>
                      </>
                    )
                  },
                },
                {
                  key: 'duration',
                  header: 'DURATION',
                  cellClass: 'text-xs text-sand-830',
                  cell: (lease) => {
                    const durationInfo = getDurationInfo(lease)
                    return (
                      <>
                        <p className="font-medium text-sand-830">{durationInfo.start}</p>
                        <p className="text-sand-530">{durationInfo.end}</p>
                      </>
                    )
                  },
                },
                {
                  key: 'status',
                  header: 'STATUS',
                  cell: (lease) => {
                    const statusInfo = getLeaseStatusInfo(lease)
                    return (
                      <span
                        className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium ${statusInfo.style}`}
                      >
                        {statusInfo.label}
                      </span>
                    )
                  },
                },
                {
                  key: 'actions',
                  header: 'ACTIONS',
                  headerClass: 'text-center',
                  cell: (lease) =>
                    !isEditMode ? (
                      /* Normal Mode: Preview Contract (SSK-129) */
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingPreviewLease(lease)}
                          title="Preview Contract"
                          aria-label={`Preview contract for Unit ${lease.roomNumber}`}
                          className="icon-button rounded-lg border border-card-border p-1.5 text-sand-530 transition hover:bg-black/5 hover:text-sand-830 cursor-pointer"
                        >
                          <FileText aria-hidden="true" className="ui-icon size-icon-control" />
                        </button>
                        <button type="button" onClick={() => setEditingLease(lease)} aria-label={`Edit contract for Unit ${lease.roomNumber}`} title="Edit contract" className="icon-button rounded-lg border border-card-border text-brand hover:bg-page-bg"><SquarePen size={18} aria-hidden="true" /></button>
                        <a
                          href={`/documents?type=Contract&unit=${lease.roomNumber}`}
                          title="View attached files in Documents"
                          aria-label={`Files for contract ${lease.roomNumber}`}
                          className="icon-button rounded-lg border border-card-border p-1.5 text-sand-530 transition hover:bg-black/5 hover:text-sand-830 cursor-pointer"
                        >
                          <Paperclip aria-hidden="true" size={17} />
                        </a>
                      </div>
                    ) : (
                      /* Edit Mode: Edit, Upload, and Contract Template */
                      <div className="flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setEditingLease(lease)}
                          title="Edit Contract"
                          aria-label={`Edit contract for Unit ${lease.roomNumber}`}
                          className="icon-button rounded-lg p-1 text-sand-530 transition hover:bg-black/5 hover:text-wine-750 cursor-pointer"
                        >
                          <SquarePen strokeWidth={1.75} aria-hidden="true" className="ui-icon size-icon-control" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setUploadingLease(lease)}
                          title="Upload Signed Contract"
                          aria-label={`Upload signed contract for Unit ${lease.roomNumber}`}
                          className="icon-button rounded-lg p-1 text-sand-530 transition hover:bg-black/5 hover:text-sand-830 cursor-pointer"
                        >
                          <Upload strokeWidth={1.75} aria-hidden="true" className="ui-icon size-icon-control" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTemplateOpen(true)}
                          title="Contract Template"
                          aria-label={`Contract template for Unit ${lease.roomNumber}`}
                          className="icon-button rounded-lg p-1 text-sand-530 transition hover:bg-black/5 hover:text-sand-830 cursor-pointer"
                        >
                          <FileCode strokeWidth={1.75} aria-hidden="true" className="ui-icon size-icon-control" />
                        </button>
                      </div>
                    ),
                },
              ]}
            />
          </div>
        )}

        {/* Pagination & Footer */}
        {leases.length > 0 && (
          <div className="flex flex-wrap items-center justify-between border-t border-sand-65 px-6 py-4 text-xs text-sand-530">
            <p>
              {paginatedLeases.length === 0
                ? 'Showing 0 entries'
                : `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, leases.length)} of ${leases.length} entries`}
            </p>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => setCurrentPage(page - 1)}
                className="icon-button flex items-center justify-center rounded-md border border-sand-110 text-sand-530 hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft aria-hidden="true" className="ui-icon size-icon-control" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Page ${n}`}
                  aria-current={page === n ? 'page' : undefined}
                  onClick={() => setCurrentPage(n)}
                  className={`flex size-7 items-center justify-center rounded-md font-semibold transition-colors ${
                    page === n
                      ? 'bg-blush-120 text-brand'
                      : 'text-sand-530 hover:bg-black/5'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                aria-label="Next page"
                disabled={page === totalPages}
                onClick={() => setCurrentPage(page + 1)}
                className="icon-button flex items-center justify-center rounded-md border border-sand-110 text-sand-530 hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight aria-hidden="true" className="ui-icon size-icon-control" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Done / Cancel Buttons in Edit Mode */}
      {isEditMode && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsEditMode(false)}
            className="rounded-lg border border-sand-110 bg-white px-6 py-2 text-sm font-medium text-sand-530 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setIsEditMode(false)}
            className="rounded-lg bg-wine-750 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-wine-800"
          >
            Done
          </button>
        </div>
      )}

      {/* ══════════ MODALS / DIALOGS ══════════ */}

      {/* 1. Create Contract Modal */}
      {creating && contracts.data && (
        <ContractFormDialog
          rooms={contracts.data.rooms}
          tenants={contracts.data.tenants}
          existingLeases={allLeases}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            // สัญญาใหม่ต่อท้ายรายการ พาไปหน้าสุดท้ายให้เห็นทันทีว่าสร้างสำเร็จ
            setCurrentPage(Number.MAX_SAFE_INTEGER)
            contracts.reload()
          }}
        />
      )}

      {/* 2. Edit Contract Modal (Action 1) */}
      {editingLease && contracts.data && (
        <ContractFormDialog
          lease={editingLease}
          rooms={contracts.data.rooms}
          tenants={contracts.data.tenants}
          existingLeases={allLeases}
          onClose={() => setEditingLease(null)}
          onSaved={() => {
            setEditingLease(null)
            contracts.reload()
          }}
        />
      )}

      {/* Contract Preview Modal (Normal Mode Action 1) */}
      {viewingPreviewLease && (
        <ContractPreviewDialog
          lease={viewingPreviewLease}
          onClose={() => setViewingPreviewLease(null)}
          onPrint={() => {
            const targetLease = viewingPreviewLease
            setViewingPreviewLease(null)
            setViewingPdfLease(targetLease)
          }}
        />
      )}

      {/* 3. View / Print PDF Modal (Normal Mode Action 2 / Edit Mode Action 2) */}
      {viewingPdfLease && (
        <ContractPdfDialog
          lease={viewingPdfLease}
          onClose={() => setViewingPdfLease(null)}
        />
      )}

      {/* 4. Upload Signed Contract Modal (Action 2) */}
      {uploadingLease && (
        <UploadContractDialog
          lease={uploadingLease}
          onClose={() => setUploadingLease(null)}
          onUploaded={() => {
            setUploadingLease(null)
            contracts.reload()
          }}
        />
      )}

      {/* 5. Contract Template Modal (Action 3) */}
      {templateOpen && (
        <ContractTemplateDialog
          onClose={() => setTemplateOpen(false)}
          onSaved={() => {
            setTemplateOpen(false)
          }}
        />
      )}
    </div>
  )
}
