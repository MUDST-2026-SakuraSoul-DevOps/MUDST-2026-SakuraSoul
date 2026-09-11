import { useMemo, useState } from 'react'
import { UserPlus } from '@phosphor-icons/react'
import { Search, SquarePen } from 'lucide-react'
import { fetchLeases, fetchTenants } from '../api/client'
import type { Lease, LeaseStatus, Tenant } from '../api/types'
import { leaseStatusOn } from '../domain/lease'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'
import { AddTenantDialog } from '../dialogs/AddTenantDialog'
import { EditTenantDialog } from '../dialogs/EditTenantDialog'
import { yen, displayDate, todayInBangkok } from '../format'

/**
 * ตรงกับเฟรม "Tenant Directory" ใน Figma (node 1:648) และครอบ US-07
 */

type StatusFilter = LeaseStatus | 'ALL'

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All Status' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'ENDED', label: 'Ended' },
]

const STATUS_STYLE: Record<LeaseStatus, string> = {
  ACTIVE: 'bg-[#e8f5e9] border-[#c8e6c9] text-[#2e7d32]',
  ENDED: 'bg-[#f4f3f1] border-[rgba(212,194,195,0.5)] text-[#605e5b]',
}

interface TenantRow {
  tenant: Tenant
  lease: Lease | null
  status: LeaseStatus | null
}

function buildRows(tenants: Tenant[], leases: Lease[], today: string): TenantRow[] {
  return tenants.map((tenant) => {
    const own = leases
      .filter((lease) => lease.tenantId === tenant.id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
    const lease = own[0] ?? null
    return {
      tenant,
      lease,
      status: lease === null ? null : leaseStatusOn(lease, today),
    }
  })
}

export default function TenantsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

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
      if (statusFilter !== 'ALL' && row.status !== statusFilter) {
        return false
      }
      if (query === '') {
        return true
      }
      return (
        row.tenant.fullName.toLowerCase().includes(query) ||
        (row.lease?.roomNumber ?? '').toLowerCase().includes(query)
      )
    })
  }, [rows, search, statusFilter])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tenant Directory"
        description="Manage resident profiles, lease statuses, and rent payments for Sakura Soul."
        actions={
          <PrimaryButton onClick={() => setAddOpen(true)}>
            <UserPlus size={14} weight="bold" />
            Add New Tenant
          </PrimaryButton>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-[rgba(238,217,196,0.5)] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex-1 sm:max-w-xs">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#c9c6c2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants by name or unit..."
            aria-label="Search tenants by name or unit"
            className="w-full rounded-md border-b border-transparent py-2 pr-3 pl-9 text-sm text-ink outline-none placeholder:text-[#c9c6c2]"
          />
        </label>
        <div className="flex flex-wrap gap-2.5">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setStatusFilter(option.id)}
              aria-pressed={statusFilter === option.id}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                statusFilter === option.id
                  ? 'bg-[#e4e2e1] text-ink'
                  : 'border border-[rgba(212,194,195,0.5)] text-ink-muted hover:bg-black/5'
              }`}
            >
              {option.label}
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
              <LoadingState label="Loading tenants..." />
            </div>
          )}
          {!directory.loading && !directory.error && filtered.length === 0 && (
            <div className="p-4">
              <EmptyState
                title={rows.length === 0 ? 'No tenants yet' : 'No tenants match your search'}
                hint={rows.length === 0 ? 'Use Add New Tenant to get started' : undefined}
              />
            </div>
          )}
          {filtered.length > 0 && (
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-[rgba(238,217,196,0.3)] bg-[rgba(251,249,248,0.5)]">
                  {['TENANT', 'PHONE', 'ROOM', 'LEASE PERIOD', 'RENT', 'STATUS', 'ACTIONS'].map((column, idx) => (
                    <th
                      key={column}
                      className={`px-5 py-3.5 text-[10px] font-medium tracking-[0.5px] text-ink-muted uppercase ${
                        idx === 6 ? 'text-center' : ''
                      }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ tenant, lease, status }) => (
                  <tr key={tenant.id} className="border-t border-[rgba(238,217,196,0.3)]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={tenant.fullName} />
                        <div>
                          <p className="text-sm font-medium text-ink">{tenant.fullName}</p>
                          <p className="text-[10px] text-ink-muted">{tenant.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-ink-muted">{tenant.phone ?? '-'}</td>
                    <td className="px-5 py-4 text-sm text-ink">{lease?.roomNumber ?? '-'}</td>
                    <td className="px-5 py-4 text-sm text-ink-muted">
                      {lease === null
                        ? '-'
                        : `${displayDate(lease.startDate)} - ${lease.endDate === null ? 'no end date' : displayDate(lease.endDate)}`}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-[#667085]">
                      {lease === null ? '-' : yen(lease.monthlyRent)}
                    </td>
                    <td className="px-5 py-4">
                      {status === null ? (
                        <span className="text-sm text-ink-muted">No lease</span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}
                        >
                          {status === 'ACTIVE' ? 'Active' : 'Ended'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          title="Edit Tenant"
                          aria-label={`Edit ${tenant.fullName}`}
                          onClick={() => setEditingTenant({ tenant, lease, status })}
                          className="rounded p-1 text-ink-muted hover:bg-black/5 hover:text-ink transition-colors cursor-pointer"
                        >
                          <SquarePen size={17} />
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
          <div className="flex items-center justify-between border-t border-[rgba(238,217,196,0.3)] px-4 py-3.5">
            <p className="text-[10px] text-ink-muted">
              Showing {filtered.length} of {rows.length} tenants
            </p>
          </div>
        )}
      </div>

      {addOpen && (
        <AddTenantDialog onClose={() => setAddOpen(false)} onCreated={directory.reload} />
      )}

      {editingTenant && (
        <EditTenantDialog
          tenant={{
            ...editingTenant.tenant,
            startDate: editingTenant.lease?.startDate,
            endDate: editingTenant.lease?.endDate ?? undefined,
            rent: editingTenant.lease?.monthlyRent ?? 45000,
            roomType: 'Single Bedroom',
          }}
          onClose={() => setEditingTenant(null)}
          onSaved={directory.reload}
        />
      )}
    </div>
  )
}
