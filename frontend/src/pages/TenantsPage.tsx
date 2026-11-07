import { useEffect, useMemo, useState } from 'react'
import { UserPlus, Search, SquarePen, Trash2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchLeases, fetchReceipts, fetchRooms, fetchTenants, searchTenants } from '../api/client'
import type { Lease, Receipt, RoomSummary, Tenant, TenantMatch } from '../api/types'
import { MATCH_RANK } from '../domain/tenantSearch'
import { tenantPaymentStatus } from '../domain/billing'
import { leaseDisplayStatus, type LeaseDisplayStatus } from '../domain/lease'
import { paginate } from '../domain/pagination'
import { roomTypeLabel } from '../domain/room'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { DataTable } from '../components/DataTable'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'
import { AddTenantDialog } from '../dialogs/AddTenantDialog'
import { EditTenantDialog } from '../dialogs/EditTenantDialog'
import { DeleteTenantDialog } from '../dialogs/DeleteTenantDialog'
import { bahtAmount, todayInBangkok } from '../format'

/**
 * หน้า Tenant Directory ตรงตาม Figma (node 1:648 และ media_1789125778678.png)
 *
 * SSK-136 ป้ายสถานะมาจากสัญญาจริงด้วยกฎเดียวกับหน้า Contracts (leaseDisplayStatus)
 * เดิมป้าย Pending / Overdue ตั้งตาม id ของผู้เช่า (id 2 ขึ้น Pending, id 3 ขึ้น Overdue)
 * ไม่เกี่ยวกับการจ่ายเงินจริงเลย
 *
 * SSK-16 Pending / Overdue กลับมาแล้ว คิดจากใบเสร็จจริงของทุกสัญญาของผู้เช่าคนนั้น
 * (tenantPaymentStatus กฎเดียวกับป้ายในหน้า Payments) มีใบเลยกำหนดขึ้น Overdue ก่อน
 * มีใบรอจ่ายขึ้น Pending ไม่มีทั้งสองอย่างค่อยใช้สถานะของสัญญา
 */

type TenantDisplayStatus = LeaseDisplayStatus | 'Pending' | 'Overdue'
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
  // สีเดียวกับป้าย Ending Soon ของหน้า Contracts สองหน้าจะได้สื่อความหมายเดียวกัน
  'Ending Soon': 'bg-blush-50 border border-cta-bg text-alert-520',
  Ended: 'bg-page-bg border border-avatar-ring/50 text-ink-muted',
}

/** ตัวกรอง Active นับสัญญาที่ใกล้หมดด้วย เพราะผู้เช่ายังอยู่จริง แค่ต้องตามต่อสัญญา */
function matchesFilter(status: TenantDisplayStatus | null, filter: StatusFilter): boolean {
  if (filter === 'ALL') {
    return true
  }
  if (filter === 'Active') {
    return status === 'Active' || status === 'Ending Soon'
  }
  return status === filter
}

interface TenantRow {
  tenant: Tenant
  lease: Lease | null
  /** null เมื่อผู้เช่ายังไม่มีสัญญาเลย ตารางขึ้นว่า No lease */
  displayStatus: TenantDisplayStatus | null
  roomNumber: string | null
  roomType: string
  leasePeriod: string
  /** ค่าเช่าของสัญญาล่าสุด null เมื่อผู้เช่ายังไม่มีสัญญา */
  rent: number | null
}

function buildRows(
  tenants: Tenant[],
  leases: Lease[],
  rooms: RoomSummary[],
  receipts: Receipt[],
  today: string,
): TenantRow[] {
  return tenants.map((tenant) => {
    const own = leases
      .filter((lease) => lease.tenantId === tenant.id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
    const lease = own[0] ?? null
    const roomNumber = lease?.roomNumber ?? null

    /*
      SSK-127 ประเภทห้องมาจากห้องของสัญญา ค่าเช่ามาจากสัญญาที่ backend ล็อกตามประเภทห้อง
      เดิมเดาประเภทห้องจากเลขห้องคู่/คี่ และเขียนค่าเช่าตายตัว 35,000 / 45,000
      ผู้เช่าที่ยังไม่มีสัญญาจึงยังไม่มีทั้งประเภทห้องและค่าเช่า (SSK-136 เลิกเก็บสองอย่างนี้ที่ผู้เช่า)
    */
    const room = lease === null ? undefined : rooms.find((r) => r.id === lease.roomId)
    const roomType = room ? roomTypeLabel(room.roomType) : '-'
    const rent = lease?.monthlyRent ?? null

    // สัญญาที่ไม่มีวันจบคือสัญญาต่อเนื่อง เดิมแทนด้วยวันที่ปลอม 2027-12-31
    const leasePeriod = lease ? `${lease.startDate} – ${lease.endDate ?? 'Indefinite'}` : '-'

    const payment = tenantPaymentStatus(
      receipts,
      own.map((l) => l.id),
      today,
    )

    return {
      tenant,
      lease,
      displayStatus: lease === null ? null : (payment ?? leaseDisplayStatus(lease, today)),
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
  const [includeSimilar, setIncludeSimilar] = useState(true)
  // คำค้นที่หยุดพิมพ์แล้ว 250 ms ค่อยถาม server เรื่องชื่อที่คล้าย จะได้ไม่ยิงทุกตัวอักษร (SSK-174)
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  // ผลค้นติดคำค้นที่ใช้ไว้ด้วย useLoader คงผลเก่าไว้ระหว่างโหลดคำใหม่ จะได้ไม่ใช้ผลของคำก่อนหน้า
  const nameSearch = useLoader(
    async () => ({ q: debounced, hits: debounced === '' ? [] : await searchTenants(debounced) }),
    'Could not search tenants',
    [debounced],
  )

  function handleSearchChange(val: string) {
    setSearch(val)
    setCurrentPage(1)
  }

  function handleStatusFilterChange(filter: StatusFilter) {
    setStatusFilter(filter)
    setCurrentPage(1)
  }

  const directory = useLoader(async () => {
    const [tenants, leases, rooms, receipts] = await Promise.all([
      fetchTenants(),
      fetchLeases(),
      fetchRooms(),
      fetchReceipts(),
    ])
    return { tenants, leases, rooms, receipts }
  }, 'Could not load the tenant list')

  const rows = useMemo(() => {
    if (!directory.data) {
      return []
    }
    return buildRows(
      directory.data.tenants,
      directory.data.leases,
      directory.data.rooms,
      directory.data.receipts,
      todayInBangkok(),
    )
  }, [directory.data])

  /*
    SSK-174 ชื่อที่พิมพ์ตรง/บางส่วนกรองทันทีเหมือนเดิม ส่วนชื่อที่สะกดผิดเล็กน้อยมาจาก GET /tenants/search
    หลังหยุดพิมพ์ ติดป้าย Similar name ให้รู้ว่าเป็นผลใกล้เคียง เรียงผลตรงขึ้นก่อนผลคล้าย
  */
  const serverMatches = useMemo(() => {
    const map = new Map<number, TenantMatch>()
    if (nameSearch.data?.q === search.trim()) {
      for (const hit of nameSearch.data.hits) map.set(hit.id, hit.match)
    }
    return map
  }, [nameSearch.data, search])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matchOf = (row: TenantRow): TenantMatch | null => {
      // อีเมลไม่บังคับ ผู้เช่าที่ไม่มีอีเมล (เช่น Kenji Watanabe ใน dev seed) เดิมทำช่องค้นหาพัง (SSK-136)
      if (
        row.tenant.fullName.toLowerCase().includes(query) ||
        (row.roomNumber ?? '').toLowerCase().includes(query) ||
        (row.tenant.email ?? '').toLowerCase().includes(query) ||
        row.tenant.phone.toLowerCase().includes(query)
      ) {
        return serverMatches.get(row.tenant.id) ?? 'CONTAINS'
      }
      return serverMatches.get(row.tenant.id) === 'SIMILAR' && includeSimilar ? 'SIMILAR' : null
    }
    const hits = rows
      .filter((row) => matchesFilter(row.displayStatus, statusFilter))
      .map((row) => ({ ...row, match: query === '' ? null : matchOf(row) }))
      .filter((row) => query === '' || row.match !== null)
    return query === ''
      ? hits
      : [...hits].sort((a, b) => MATCH_RANK[a.match ?? 'CONTAINS'] - MATCH_RANK[b.match ?? 'CONTAINS'])
  }, [rows, search, statusFilter, serverMatches, includeSimilar])

  const pageOfRows = paginate(filtered, currentPage, PAGE_SIZE)

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
            <UserPlus aria-hidden="true" className="ui-icon size-icon-control" />
            + Add New Tenant
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full max-w-xs sm:max-w-sm rounded-xl border border-honey-140/60 bg-white px-3.5 py-2.5 shadow-sm">
          <Search className="ui-icon size-icon-inline absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Try kant, kart, krant, or a unit number"
            aria-label="Search tenants by name or unit"
            className="w-full bg-transparent pl-7 pr-1 text-sm text-ink outline-none placeholder:text-gray-300"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={includeSimilar} onChange={(e) => setIncludeSimilar(e.target.checked)} />
          Include similar names
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
              {option.id === 'ALL' && <ChevronDown className="ui-icon size-icon-inline text-gray-400" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>

      {search.trim() !== '' && !directory.loading && (
        <p className="text-sm text-body-muted" role="status">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'} for “{search.trim()}” ·{' '}
          {includeSimilar ? 'Exact and similar matches' : 'Exact text only'}
        </p>
      )}

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
              rows={pageOfRows.items}
              rowKey={(row) => row.tenant.id}
              minWidth={1032}
              headRowClass="border-b border-honey-140/30 bg-page-bg"
              headCellClass="px-5 py-3.5 text-xs font-semibold tracking-wider text-gray-500 uppercase"
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
                        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                          <Highlight text={row.tenant.fullName} query={search} />
                          {row.match === 'SIMILAR' && (
                            <span className="rounded bg-honey-20 px-2 py-0.5 text-[10px] font-medium text-honey-615">
                              Similar name
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs font-normal text-ink-muted">
                          {row.roomNumber && <span>Unit {row.roomNumber} |</span>}
                          <span>{row.tenant.email ?? 'No email'}</span>
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'phone',
                  header: 'PHONE',
                  cellClass: 'whitespace-nowrap text-sm text-ink-muted',
                  cell: (row) => row.tenant.phone || '-',
                },
                {
                  key: 'lease',
                  header: 'LEASE PERIOD',
                  cellClass: 'whitespace-nowrap text-sm text-ink-muted',
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
                  cellClass: 'whitespace-nowrap text-sm font-medium text-ink',
                  cell: (row) => (row.rent === null ? '-' : bahtAmount(row.rent)),
                },
                {
                  key: 'status',
                  header: 'STATUS',
                  cell: (row) =>
                    row.displayStatus === null ? (
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
                        className="icon-button rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-ink transition-colors cursor-pointer"
                      >
                        <SquarePen aria-hidden="true" className="ui-icon size-icon-control" />
                      </button>
                      <button
                        type="button"
                        title="Delete Tenant"
                        aria-label={`Delete ${row.tenant.fullName}`}
                        onClick={() => setDeletingTenant(row)}
                        className="icon-button rounded p-1 text-gray-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 aria-hidden="true" className="ui-icon size-icon-control" />
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
              {pageOfRows.total === 0
                ? 'Showing 0 tenants'
                : `Showing ${pageOfRows.from}–${pageOfRows.to} of ${pageOfRows.total} tenants`}
            </p>
            {/*
              SSK-136 ปุ่มหน้าคิดจากจำนวนผู้เช่าจริง เดิมตายตัว [1, 2, 3] มีหน้าเดียวก็กดไปหน้า 3 ได้
              ชื่อปุ่มตั้งแบบเดียวกับหน้า Contracts (SSK-115) คนใช้ screen reader จะได้เจอชื่อเดียวกัน
            */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => setCurrentPage(pageOfRows.page - 1)}
                disabled={pageOfRows.page === 1}
                className="flex items-center gap-1 rounded-md border border-avatar-ring/50 px-2.5 py-1 text-xs text-ink-muted hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft aria-hidden="true" className="ui-icon size-icon-control" />
                Previous
              </button>
              {Array.from({ length: pageOfRows.totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  aria-label={`Page ${page}`}
                  aria-current={pageOfRows.page === page ? 'page' : undefined}
                  onClick={() => setCurrentPage(page)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    pageOfRows.page === page
                      ? 'bg-wine-760 text-white'
                      : 'border border-avatar-ring/50 text-ink hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                aria-label="Next page"
                onClick={() => setCurrentPage(pageOfRows.page + 1)}
                disabled={pageOfRows.page === pageOfRows.totalPages}
                className="flex items-center gap-1 rounded-md border border-avatar-ring/50 px-2.5 py-1 text-xs text-ink-muted hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
                <ChevronRight aria-hidden="true" className="ui-icon size-icon-control" />
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
          tenant={editingTenant.tenant}
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

/** ไฮไลต์ส่วนของชื่อที่ตรงกับคำค้น (SSK-174) ผลแบบคล้ายไม่มีส่วนที่ตรงเป๊ะ จึงแสดงชื่อเฉย ๆ */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  const at = q === '' ? -1 : text.toLowerCase().indexOf(q)
  if (at < 0) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-honey-20 px-0.5 text-ink">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </span>
  )
}
