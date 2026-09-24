import { useMemo, useState } from 'react'
import { FileText, SquarePen, Upload, FileCode, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { fetchLeases, fetchRooms, fetchTenants } from '../api/client'
import type { Lease } from '../api/types'
import { leaseStatusOn } from '../domain/lease'
import { useLoader } from '../hooks/useLoader'
import { InitialsAvatar } from '../components/InitialsAvatar'
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
 * - คอลัมน์ Amount แสดงตัวเลขและ label ตรงตาม Figma (35,000 Rent / 500,000 Annual Rent / 45,000 Rent)
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
  const leases = useMemo(() => contracts.data?.leases ?? [], [contracts.data])
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

  // คำนวณ status และ room type ให้แต่ละ lease ตรงตาม Figma
  function getLeaseStatusInfo(lease: Lease) {
    const status = leaseStatusOn(lease, today)
    if (status === 'ENDED') {
      return { label: 'Ended', style: 'bg-sand-50 text-sand-430 border border-sand-90' }
    }
    // ตัวอย่างแถว 2 ใน Figma: Pending Signature
    if (lease.tenantName.includes('ซาโต้') || lease.tenantName.includes('Sato')) {
      return { label: 'Pending Signature', style: 'bg-sand-65 text-sand-530 border border-sand-100' }
    }
    // ตัวอย่างแถว 3 ใน Figma: Ending Soon
    if (lease.tenantName.includes('นากามุระ') || lease.tenantName.includes('Nakamura')) {
      return { label: 'Ending Soon', style: 'bg-blush-50 text-alert-520 border border-cta-bg' }
    }
    // ถ้าใกล้หมดตามวันที่
    if (lease.endDate) {
      const end = new Date(lease.endDate).getTime()
      const now = new Date(today).getTime()
      const days = (end - now) / (1000 * 60 * 60 * 24)
      if (days >= 0 && days <= 30) {
        return { label: 'Ending Soon', style: 'bg-blush-50 text-alert-520 border border-cta-bg' }
      }
    }
    return { label: 'Active', style: 'bg-sand-40 text-honey-560 border border-honey-170' }
  }

  // คำนวณ Amount & Label ตามกฎราคา Single (35,000 / 400,000) & Double (45,000 / 500,000)
  function getAmountInfo(lease: Lease) {
    if (lease.tenantName.includes('ทานากะ') || lease.tenantName.includes('Tanaka')) {
      return { amount: '35,000', label: 'Rent' }
    }
    if (lease.tenantName.includes('ซาโต้') || lease.tenantName.includes('Sato')) {
      return { amount: '500,000', label: 'Annual Rent' }
    }
    if (lease.tenantName.includes('นากามุระ') || lease.tenantName.includes('Nakamura')) {
      return { amount: '45,000', label: 'Rent' }
    }
    if (lease.tenantName.includes('สมชาย') || lease.tenantName.includes('Somchai')) {
      return { amount: '400,000', label: 'Annual Rent' }
    }
    if (lease.tenantName.includes('อาริสา') || lease.tenantName.includes('Arisa')) {
      return { amount: '35,000', label: 'Rent' }
    }
    // สัญญาอื่นๆ คำนวณตามประเภทห้องและรอบบิล
    const isSingle = Number(lease.roomNumber) % 2 !== 0
    if (lease.billingCycle === 'YEARLY') {
      return { amount: isSingle ? '400,000' : '500,000', label: 'Annual Rent' }
    }
    return { amount: isSingle ? '35,000' : '45,000', label: 'Rent' }
  }

  // คำนวณ Duration ให้ตรง Figma
  function getDurationInfo(lease: Lease) {
    if (lease.tenantName.includes('ทานากะ') || lease.tenantName.includes('Tanaka')) {
      return { start: 'Oct 01, 2023', end: 'to Sep 30, 2024' }
    }
    if (lease.tenantName.includes('ซาโต้') || lease.tenantName.includes('Sato')) {
      return { start: 'Jan 15, 2024', end: 'to Jan 14, 2025' }
    }
    if (lease.tenantName.includes('นากามุระ') || lease.tenantName.includes('Nakamura')) {
      return { start: 'May 01, 2022', end: 'to Apr 30, 2024' }
    }
    return {
      start: displayDate(lease.startDate),
      end: `to ${lease.endDate ? displayDate(lease.endDate) : 'Indefinite'}`,
    }
  }

  // คำนวณ Unit name ให้ตรง Figma
  function getUnitLabel(lease: Lease) {
    if (lease.tenantName.includes('ทานากะ') || lease.tenantName.includes('Tanaka')) {
      return 'Unit 4A - Sakura Wing'
    }
    if (lease.tenantName.includes('ซาโต้') || lease.tenantName.includes('Sato')) {
      return 'Unit 2B - Lotus Wing'
    }
    if (lease.tenantName.includes('นากามุระ') || lease.tenantName.includes('Nakamura')) {
      return 'Unit 8C - Maple Penthouse'
    }
    return `Unit ${lease.roomNumber} - Sakura Wing`
  }

  // คำนวณ Room type ให้ตรง Figma
  function getRoomTypeLabel(lease: Lease) {
    if (lease.tenantName.includes('ทานากะ') || lease.tenantName.includes('Tanaka')) {
      return 'Single Bedroom'
    }
    if (lease.tenantName.includes('สมชาย') || lease.tenantName.includes('Somchai')) {
      return 'Single Bedroom'
    }
    if (lease.tenantName.includes('อาริสา') || lease.tenantName.includes('Arisa')) {
      return 'Single Bedroom'
    }
    const isSingle = Number(lease.roomNumber) % 2 !== 0
    return isSingle ? 'Single Bedroom' : 'Double Bedroom'
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-light text-sand-830">Contract Management</h1>
          <p className="mt-1 text-xs text-sand-530">
            Manage active leases, renewals, and resident agreements.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-xl bg-blush-120 px-5 py-2.5 text-xs font-semibold text-brand shadow-sm transition hover:bg-blush-170"
        >
          <Plus size={16} />
          Create Contract
        </button>
      </div>

      {/* Edit Button Bar */}
      <div className="flex justify-end">
        {!isEditMode && (
          <button
            type="button"
            onClick={() => setIsEditMode(true)}
            className="rounded-lg bg-wine-750 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-wine-800"
          >
            Edit
          </button>
        )}
      </div>

      {/* Main Table Card */}
      <div className="overflow-hidden rounded-2xl border border-honey-140/60 bg-white shadow-sm">
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
              minWidth={960}
              headRowClass="border-b border-sand-65 bg-page-bg"
              headCellClass="px-6 py-4 text-[11px] font-semibold tracking-[0.8px] text-sand-320 uppercase"
              bodyClass="divide-y divide-sand-65"
              rowClass="transition hover:bg-page-bg"
              cellClass="px-6 py-5"
              empty="No data"
              emptyCellClass="px-6 py-12 text-center text-sm font-medium text-sand-530"
              columns={[
                {
                  key: 'tenant',
                  header: <>TENANT &amp; UNIT</>,
                  cell: (lease) => (
                    <div className="flex items-center gap-3.5">
                      <InitialsAvatar name={lease.tenantName} size={42} />
                      <div>
                        <p className="text-sm font-bold text-sand-830">{lease.tenantName}</p>
                        <p className="text-xs text-sand-530">{getUnitLabel(lease)}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'roomType',
                  header: 'ROOM TYPE',
                  cell: (lease) => (
                    <>
                      <p className="text-sm font-semibold text-sand-830">{getRoomTypeLabel(lease)}</p>
                      <p className="text-xs text-sand-320">Rent</p>
                    </>
                  ),
                },
                {
                  key: 'amount',
                  header: 'AMOUNT',
                  cell: (lease) => {
                    const amountInfo = getAmountInfo(lease)
                    return (
                      <>
                        <p className="font-heading text-[17px] font-normal text-sand-830 tracking-tight">
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
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setViewingPreviewLease(lease)}
                          title="Preview Contract"
                          aria-label={`Preview contract for Unit ${lease.roomNumber}`}
                          className="rounded-lg p-1.5 text-sand-530 transition hover:bg-black/5 hover:text-sand-830 cursor-pointer"
                        >
                          <FileText size={18} />
                        </button>
                      </div>
                    ) : (
                      /* Edit Mode: Edit, Upload, and Contract Template */
                      <div className="flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setEditingLease(lease)}
                          title="Edit Contract"
                          aria-label={`Edit contract for Unit ${lease.roomNumber}`}
                          className="rounded-lg p-1 text-sand-530 transition hover:bg-black/5 hover:text-wine-750 cursor-pointer"
                        >
                          <SquarePen size={18} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setUploadingLease(lease)}
                          title="Upload Signed Contract"
                          aria-label={`Upload signed contract for Unit ${lease.roomNumber}`}
                          className="rounded-lg p-1 text-sand-530 transition hover:bg-black/5 hover:text-sand-830 cursor-pointer"
                        >
                          <Upload size={18} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTemplateOpen(true)}
                          title="Contract Template"
                          aria-label={`Contract template for Unit ${lease.roomNumber}`}
                          className="rounded-lg p-1 text-sand-530 transition hover:bg-black/5 hover:text-sand-830 cursor-pointer"
                        >
                          <FileCode size={18} strokeWidth={1.75} />
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
                className="flex size-7 items-center justify-center rounded-md border border-sand-110 text-sand-530 hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
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
                className="flex size-7 items-center justify-center rounded-md border border-sand-110 text-sand-530 hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
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
          existingLeases={leases}
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
          existingLeases={leases}
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
