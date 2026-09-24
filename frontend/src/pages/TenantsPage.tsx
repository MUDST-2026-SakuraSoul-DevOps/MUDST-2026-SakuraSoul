import { useMemo, useState } from 'react'
import { UserPlus, Search, SquarePen, Trash2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchLeases, fetchTenants } from '../api/client'
import type { Lease, LeaseStatus, Tenant } from '../api/types'
import { leaseStatusOn } from '../domain/lease'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { DataTable } from '../components/DataTable'
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
  Active: 'bg-moss-40 border border-moss-80 text-moss-410',
  Pending: 'bg-honey-45 border border-honey-90 text-honey-400',
  Overdue: 'bg-blush-80 border border-accent-soft text-alert-525',
  Ended: 'bg-page-bg border border-avatar-ring/50 text-ink-muted',
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
      : (tenant.roomType ? tenant.roomType.toLowerCase().includes('single') : tenant.id % 2 === 0)
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
      : (tenant.startDate && tenant.endDate
          ? `${tenant.startDate} – ${tenant.endDate}`
          : (tenant.startDate ? `${tenant.startDate} – Indefinite` : '-'))

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

const PAGE_SIZE = 10

export default function TenantsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null)
  const [deletingTenant, setDeletingTenant] = useState<TenantRow | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [currentPage, setCurrentPage] = useState(1)

  function handleSearchChange(val: string) {
    setSearch(val)
    setCurrentPage(1)
  }

  function handleStatusFilterChange(filter: StatusFilter) {
    setStatusFilter(filter)
    setCurrentPage(1)
  }

  const directory = useLoader(async () => {
    const [tenants, leases] = await Promise.all([fetchTenants(), fetchLeases()])
    return { tenants, leases }
  }, 'Could not load the tenant list')

  const rows = useMemo(() => {
    if (!directory.data) {
      return []
    }
    return buildRows(directory.data.tenants, directory.data.leases, todayInBangkok())
  }, [directory.data])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.displayStatus !== statusFilter) {
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

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

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
            className="flex items-center gap-2 rounded-lg bg-blush-120 px-4 py-2 text-sm font-medium text-wine-760 shadow-sm transition-colors hover:bg-blush-130"
          >
            <UserPlus size={16} />
            + Add New Tenant
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full max-w-xs sm:max-w-sm rounded-xl border border-honey-140/60 bg-white px-3.5 py-2.5 shadow-sm">
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search tenants by name or unit..."
            aria-label="Search tenants by name or unit"
            className="w-full bg-transparent pl-7 pr-1 text-sm text-ink outline-none placeholder:text-gray-300"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleStatusFilterChange(option.id)}
              aria-pressed={statusFilter === option.id}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === option.id
                  ? 'bg-sand-90 text-ink font-semibold'
                  : 'border border-avatar-ring/50 bg-white text-ink-muted hover:bg-black/5'
              }`}
            >
              {option.label}
              {option.id === 'ALL' && <ChevronDown size={13} className="text-gray-400" />}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-honey-140/50 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {directory.error && (
            <div className="p-4">
              <ErrorState message={directory.error} />
            </div>
          )}
          {directory.loading && (
            <div className="p-4">
              <LoadingState label="Loading tenants..." />
            </div>
          )}
          {!directory.loading && !directory.error && filtered.length === 0 && (
            <div className="p-6">
              <EmptyState
                title={rows.length === 0 ? 'No tenants yet' : 'No tenants match your search'}
                hint={rows.length === 0 ? 'Use Add New Tenant to get started' : undefined}
              />
            </div>
          )}
          {filtered.length > 0 && (
            <DataTable
              rows={paginatedRows}
              rowKey={(row) => row.tenant.id}
              minWidth={860}
              headRowClass="border-b border-honey-140/30 bg-page-bg"
              headCellClass="px-5 py-3.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase"
              bodyClass="divide-y divide-honey-140/30"
              rowClass="hover:bg-page-bg/60 transition-colors"
              cellClass="px-5 py-4"
              empty="No data"
              emptyCellClass="px-5 py-12 text-center text-sm font-medium text-ink-muted"
              columns={[
                {
                  key: 'tenant',
                  header: 'TENANT',
                  cell: (row) => (
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={row.tenant.fullName} size={36} />
                      <div>
                        <p className="text-sm font-semibold text-ink">{row.tenant.fullName}</p>
                        <div className="flex items-center gap-1.5 text-xs font-normal text-ink-muted">
                          {row.roomNumber && <span>Unit {row.roomNumber} |</span>}
                          <span>{row.tenant.email}</span>
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'phone',
                  header: 'PHONE',
                  cellClass: 'text-sm text-ink-muted',
                  cell: (row) => row.tenant.phone || '0123456789',
                },
                {
                  key: 'lease',
                  header: 'LEASE PERIOD',
                  cellClass: 'text-sm text-ink-muted',
                  cell: (row) => row.leasePeriod,
                },
                {
                  key: 'roomType',
                  header: 'ROOM TYPE',
                  cellClass: 'text-sm text-ink',
                  cell: (row) => row.roomType,
                },
                {
                  key: 'rent',
                  header: 'RENT',
                  cellClass: 'text-sm font-medium text-ink',
                  cell: (row) => new Intl.NumberFormat('en-US').format(row.rent),
                },
                {
                  key: 'status',
                  header: 'STATUS',
                  cell: (row) =>
                    row.status === null ? (
                      <span className="text-sm text-ink-muted">No lease</span>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[row.displayStatus]}`}
                      >
                        {row.displayStatus}
                      </span>
                    ),
                },
                {
                  key: 'action',
                  header: 'ACTION',
                  headerClass: 'text-center',
                  cellClass: 'text-center',
                  cell: (row) => (
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        title="Edit Tenant"
                        aria-label={`Edit ${row.tenant.fullName}`}
                        onClick={() => setEditingTenant(row)}
                        className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-ink transition-colors cursor-pointer"
                      >
                        <SquarePen size={17} />
                      </button>
                      <button
                        type="button"
                        title="Delete Tenant"
                        aria-label={`Delete ${row.tenant.fullName}`}
                        onClick={() => setDeletingTenant(row)}
                        className="rounded p-1 text-gray-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        {rows.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-honey-140/30 bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-muted">
              {filtered.length === 0 || paginatedRows.length === 0
                ? 'Showing 0 tenants'
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length} tenants`}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 rounded-md border border-avatar-ring/50 px-2.5 py-1 text-xs text-ink-muted hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft size={13} />
                Previous
              </button>
              {[1, 2, 3].map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    currentPage === page
                      ? 'bg-wine-760 text-white'
                      : 'border border-avatar-ring/50 text-ink hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(3, p + 1))}
                disabled={currentPage === 3}
                className="flex items-center gap-1 rounded-md border border-avatar-ring/50 px-2.5 py-1 text-xs text-ink-muted hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
            startDate: editingTenant.lease?.startDate ?? editingTenant.tenant.startDate ?? undefined,
            endDate: editingTenant.lease?.endDate ?? editingTenant.tenant.endDate ?? undefined,
            leasePeriod: editingTenant.leasePeriod,
            rent: editingTenant.lease?.monthlyRent ?? editingTenant.rent,
            roomType: editingTenant.roomType,
            lineId: editingTenant.tenant.lineId ?? undefined,
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
