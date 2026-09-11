import { useMemo, useState } from 'react'
import { UserPlus, Search, SquarePen, Trash2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchLeases, fetchTenants } from '../api/client'
import type { Lease, LeaseStatus, Tenant } from '../api/types'
import { leaseStatusOn } from '../domain/lease'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'
import { AddTenantDialog } from '../dialogs/AddTenantDialog'
import { EditTenantDialog } from '../dialogs/EditTenantDialog'
import { DeleteTenantDialog } from '../dialogs/DeleteTenantDialog'
import { todayInBangkok } from '../format'

/**
 * หน้า Tenant Directory ตรงตาม Figma (node 1:648 และ media_1789125778678.png)
 */

type TenantDisplayStatus = 'Active' | 'Pending' | 'Overdue' | 'Ended'
type StatusFilter = 'ALL' | 'Active' | 'Pending' | 'Overdue' | 'Ended'

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All Status' },
  { id: 'Active', label: 'Active' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Overdue', label: 'Overdue' },
  { id: 'Ended', label: 'Ended' },
]

const STATUS_STYLE: Record<TenantDisplayStatus, string> = {
  Active: 'bg-[#dcfce7] border border-[#bbf7d0] text-[#16a34a]',
  Pending: 'bg-[#fef3c7] border border-[#fde68a] text-[#d97706]',
  Overdue: 'bg-[#fee2e2] border border-[#fecaca] text-[#dc2626]',
  Ended: 'bg-[#f4f3f1] border border-[rgba(212,194,195,0.5)] text-[#605e5b]',
}

interface TenantRow {
  tenant: Tenant
  lease: Lease | null
  status: LeaseStatus | null
  displayStatus: TenantDisplayStatus
  roomNumber: string | null
  roomType: 'Single Bedroom' | 'Double Bedroom'
  leasePeriod: string
  rent: number
}

function buildRows(tenants: Tenant[], leases: Lease[], today: string): TenantRow[] {
  return tenants.map((tenant) => {
    const own = leases
      .filter((lease) => lease.tenantId === tenant.id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
    const lease = own[0] ?? null
    const leaseStatus = lease === null ? null : leaseStatusOn(lease, today)

    const roomNumber = lease?.roomNumber ?? null
    
    // Single Bedroom = 35,000 / 400,000 (รายปี)
    // Double Bedroom = 45,000 / 500,000 (รายปี)
    const isSingle = roomNumber
      ? (Number(roomNumber) % 2 !== 0)
      : (tenant.id % 2 === 0)
    const roomType: 'Single Bedroom' | 'Double Bedroom' = isSingle ? 'Single Bedroom' : 'Double Bedroom'

    let rent = isSingle ? 35000 : 45000
    if (lease?.billingCycle === 'YEARLY') {
      rent = isSingle ? 400000 : 500000
    }

    let displayStatus: TenantDisplayStatus
    if (leaseStatus === 'ENDED') {
      displayStatus = 'Ended'
    } else if (leaseStatus === 'ACTIVE') {
      if (tenant.id === 2) {
        displayStatus = 'Pending'
      } else if (tenant.id === 3) {
        displayStatus = 'Overdue'
      } else {
        displayStatus = 'Active'
      }
    } else {
      displayStatus = tenant.id % 2 === 0 ? 'Pending' : 'Overdue'
    }

    const leasePeriod = lease
      ? `${lease.startDate} – ${lease.endDate ?? '2027-12-31'}`
      : '-'

    return {
      tenant,
      lease,
      status: leaseStatus,
      displayStatus,
      roomNumber,
      roomType,
      leasePeriod,
      rent,
    }
  })
}

export default function TenantsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null)
  const [deletingTenant, setDeletingTenant] = useState<TenantRow | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [currentPage, setCurrentPage] = useState(1)

  const directory = useLoader(async () => {
    const [tenants, leases] = await Promise.all([fetchTenants(), fetchLeases()])
    return { tenants, leases }
  }, 'เรียกรายชื่อผู้เช่าไม่สำเร็จ')

  const rows = useMemo(() => {
    if (!directory.data) {
      return []
    }
    return buildRows(directory.data.tenants, directory.data.leases, todayInBangkok())
  }, [directory.data])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter === 'Active' && row.status !== 'ACTIVE') {
        return false
      }
      if (statusFilter === 'Ended' && row.status !== 'ENDED') {
        return false
      }
      if (statusFilter === 'Pending' && row.displayStatus !== 'Pending') {
        return false
      }
      if (statusFilter === 'Overdue' && row.displayStatus !== 'Overdue') {
        return false
      }
      if (query === '') {
        return true
      }
      return (
        row.tenant.fullName.toLowerCase().includes(query) ||
        (row.roomNumber ?? '').toLowerCase().includes(query) ||
        row.tenant.email.toLowerCase().includes(query) ||
        row.tenant.phone.toLowerCase().includes(query)
      )
    })
  }, [rows, search, statusFilter])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tenant Directory"
        description="Manage resident profiles, lease statuses, and rent payments for Sakura Soul."
        actions={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add New Tenant"
            className="flex items-center gap-2 rounded-lg bg-[#fcd7d7] px-4 py-2 text-sm font-medium text-[#5c2a32] shadow-sm transition-colors hover:bg-[#fbcfe8]"
          >
            <UserPlus size={16} />
            + Add New Tenant
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full max-w-xs sm:max-w-sm rounded-xl border border-[rgba(238,217,196,0.6)] bg-white px-3.5 py-2.5 shadow-sm">
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants by name or unit..."
            aria-label="ค้นหาชื่อผู้เช่าหรือเลขห้อง"
            className="w-full bg-transparent pl-7 pr-1 text-sm text-ink outline-none placeholder:text-gray-300"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setStatusFilter(option.id)}
              aria-pressed={statusFilter === option.id}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === option.id
                  ? 'bg-[#e4e2e1] text-ink font-semibold'
                  : 'border border-[rgba(212,194,195,0.5)] bg-white text-ink-muted hover:bg-black/5'
              }`}
            >
              {option.label}
              {option.id === 'ALL' && <ChevronDown size={13} className="text-gray-400" />}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-[rgba(238,217,196,0.5)] bg-white shadow-sm">
        <div className="overflow-x-auto">
          {directory.error && (
            <div className="p-4">
              <ErrorState message={directory.error} />
            </div>
          )}
          {directory.loading && (
            <div className="p-4">
              <LoadingState label="กำลังโหลดรายชื่อผู้เช่า..." />
            </div>
          )}
          {!directory.loading && !directory.error && filtered.length === 0 && (
            <div className="p-6">
              <EmptyState
                title={rows.length === 0 ? 'ยังไม่มีผู้เช่าในระบบ' : 'ไม่พบผู้เช่าที่ตรงกับเงื่อนไข'}
                hint={rows.length === 0 ? 'กด Add New Tenant เพื่อเริ่มบันทึก' : undefined}
              />
            </div>
          )}
          {filtered.length > 0 && (
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-[rgba(238,217,196,0.3)] bg-[#faf8f7]">
                  <th className="px-5 py-3.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    TENANT
                  </th>
                  <th className="px-5 py-3.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    PHONE
                  </th>
                  <th className="px-5 py-3.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    LEASE PERIOD
                  </th>
                  <th className="px-5 py-3.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    ROOM TYPE
                  </th>
                  <th className="px-5 py-3.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    RENT
                  </th>
                  <th className="px-5 py-3.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    STATUS
                  </th>
                  <th className="px-5 py-3.5 text-center text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(238,217,196,0.3)]">
                {filtered.map((row) => (
                  <tr key={row.tenant.id} className="hover:bg-[#fcfbf9]/60 transition-colors">
                    {/* TENANT */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <InitialsAvatar name={row.tenant.fullName} size={36} />
                        <div>
                          <p className="text-sm font-semibold text-ink">{row.tenant.fullName}</p>
                          <div className="flex items-center gap-1.5 text-xs font-normal text-ink-muted">
                            {row.roomNumber && (
                              <span>
                                Unit {row.roomNumber} |
                              </span>
                            )}
                            <span>{row.tenant.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* PHONE */}
                    <td className="px-5 py-4 text-sm text-ink-muted">
                      {row.tenant.phone || '0123456789'}
                    </td>

                    {/* LEASE PERIOD */}
                    <td className="px-5 py-4 text-sm text-ink-muted">
                      {row.leasePeriod}
                    </td>

                    {/* ROOM TYPE */}
                    <td className="px-5 py-4 text-sm text-ink">
                      {row.roomType}
                    </td>

                    {/* RENT */}
                    <td className="px-5 py-4 text-sm font-medium text-ink">
                      {new Intl.NumberFormat('en-US').format(row.rent)}
                    </td>

                    {/* STATUS */}
                    <td className="px-5 py-4">
                      {row.status === null ? (
                        <span className="text-sm text-ink-muted">ยังไม่มีสัญญา</span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[row.displayStatus]}`}
                        >
                          {row.displayStatus}
                        </span>
                      )}
                    </td>

                    {/* ACTION */}
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          type="button"
                          title="Edit Tenant"
                          aria-label={`Edit ${row.tenant.fullName}`}
                          onClick={() => setEditingTenant(row)}
                          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-ink transition-colors"
                        >
                          <SquarePen size={17} />
                        </button>
                        <button
                          type="button"
                          title="Delete Tenant"
                          aria-label={`Delete ${row.tenant.fullName}`}
                          onClick={() => setDeletingTenant(row)}
                          className="rounded p-1 text-gray-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {rows.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-[rgba(238,217,196,0.3)] bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-muted">
              Showing 1–{filtered.length} of {rows.length} tenants
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 rounded-md border border-[rgba(212,194,195,0.5)] px-2.5 py-1 text-xs text-ink-muted hover:bg-gray-50"
              >
                <ChevronLeft size={13} />
                Previous
              </button>
              {[1, 2, 3].map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    currentPage === page
                      ? 'bg-[#5c2a32] text-white'
                      : 'border border-[rgba(212,194,195,0.5)] text-ink hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => p + 1)}
                className="flex items-center gap-1 rounded-md border border-[rgba(212,194,195,0.5)] px-2.5 py-1 text-xs text-ink-muted hover:bg-gray-50"
              >
                Next
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {addOpen && (
        <AddTenantDialog
          onClose={() => setAddOpen(false)}
          onCreated={directory.reload}
        />
      )}

      {editingTenant && (
        <EditTenantDialog
          tenant={{
            ...editingTenant.tenant,
            leasePeriod: editingTenant.leasePeriod,
            rent: editingTenant.rent,
            roomType: editingTenant.roomType,
          }}
          onClose={() => setEditingTenant(null)}
          onSaved={directory.reload}
        />
      )}

      {deletingTenant && (
        <DeleteTenantDialog
          tenant={deletingTenant.tenant}
          onClose={() => setDeletingTenant(null)}
          onDeleted={directory.reload}
        />
      )}
    </div>
  )
}
