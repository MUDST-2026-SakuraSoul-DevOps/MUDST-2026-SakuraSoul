import { useMemo, useState } from 'react'
import { Search, Pencil, Ban } from 'lucide-react'
import { fetchLeases, fetchRooms, fetchTenants } from '../api/client'
import type { Lease, LeaseStatus } from '../api/types'
import { leaseStatusOn } from '../domain/lease'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'
import { LeaseFormDialog } from '../dialogs/LeaseFormDialog'
import { ConfirmCheckOutDialog } from '../dialogs/ConfirmCheckOutDialog'
import { baht, thaiDate, todayInBangkok } from '../format'

/**
 * ตรงกับเฟรม "Contract Management" ใน Figma (node 11:1429) และเป็นหน้าหลักของ
 * US-06 แก้ไข/ยกเลิกสัญญาเช่า
 *
 * - S1 กดยกเลิกแล้วสัญญาเปลี่ยนเป็นสิ้นสุด ห้องกลับไปว่าง (ดู ConfirmCheckOutDialog)
 * - S2 แก้วันที่ให้ทับกับสัญญา active อื่นของห้องเดียวกันแล้วต้องโดนปฏิเสธ
 *   พร้อมข้อความ overlap แบบเดียวกับตอนสร้าง (ดู LeaseFormDialog)
 *
 * แถวในตารางมาจาก GET /api/leases จริงแล้ว ไม่ใช่ค่าคงที่ในโค้ดเหมือนเวอร์ชันแรก
 *
 * ปุ่ม "Create Contract" ในดีไซน์ไม่ได้ทำที่หน้านี้ เพราะการสร้างสัญญาต้องเลือก
 * ห้องก่อนเสมอ ซึ่ง flow ที่ user story วางไว้ (US-09-S1) คือกดห้องว่างจาก
 * แดชบอร์ด การมีปุ่มสร้างลอย ๆ ที่นี่จะกลายเป็นทางที่สองที่ต้องดูแลกฎซ้ำกัน
 */

const STATUS_STYLE: Record<LeaseStatus, string> = {
  ACTIVE: 'bg-[rgba(233,212,191,0.3)] border-[rgba(107,92,75,0.2)] text-[#6b5c4b]',
  ENDED: 'bg-[rgba(212,194,195,0.3)] border-[rgba(212,194,195,0.5)] text-[#504444]',
}

export default function ContractsPage() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Lease | null>(null)
  const [cancelling, setCancelling] = useState<Lease | null>(null)

  const contracts = useLoader(async () => {
    const [leases, rooms, tenants] = await Promise.all([fetchLeases(), fetchRooms(), fetchTenants()])
    return { leases, rooms, tenants }
  }, 'เรียกข้อมูลสัญญาเช่าไม่สำเร็จ')

  // ต้องเป็นวันตามเวลาไทย ไม่ใช่ UTC ไม่งั้นแอดมินที่เปิดระบบตอนตีหนึ่งจะเห็น
  // สัญญาที่หมดอายุไปแล้วเมื่อวานขึ้นว่ายังใช้งานอยู่ และกดปุ่มยกเลิกได้
  const today = todayInBangkok()
  const leases = useMemo(() => contracts.data?.leases ?? [], [contracts.data])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = query === ''
      ? leases
      : leases.filter(
          (lease) =>
            lease.tenantName.toLowerCase().includes(query) || lease.roomNumber.includes(query),
        )
    return [...rows].sort((a, b) => b.startDate.localeCompare(a.startDate))
  }, [leases, search])

  /** ฟอร์มแก้ไขต้องรู้ค่าเช่าตั้งต้นของห้อง เอาไว้โชว์เป็นคำใบ้ใต้ช่องค่าเช่า */
  const roomOf = (lease: Lease) =>
    contracts.data?.rooms.find((room) => room.id === lease.roomId) ?? {
      id: lease.roomId,
      roomNumber: lease.roomNumber,
      baseRent: lease.monthlyRent,
    }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contract Management"
        description="Manage active leases, renewals, and resident agreements."
      />

      <label className="relative w-full max-w-sm">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-body-muted/70" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อผู้เช่าหรือเลขห้อง"
          aria-label="ค้นหาชื่อผู้เช่าหรือเลขห้อง"
          className="w-full rounded-md border border-[rgba(212,194,195,0.5)] bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-body-muted/70"
        />
      </label>

      <div className="w-full overflow-hidden rounded-lg border border-[rgba(238,217,196,0.5)] bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
        {contracts.loading && (
          <div className="p-6">
            <LoadingState label="กำลังโหลดสัญญาเช่า..." />
          </div>
        )}
        {contracts.error && (
          <div className="p-6">
            <ErrorState message={contracts.error} />
          </div>
        )}
        {!contracts.loading && !contracts.error && filtered.length === 0 && (
          <div className="p-6">
            <EmptyState
              title={leases.length === 0 ? 'ยังไม่มีสัญญาเช่าในระบบ' : 'ไม่พบสัญญาที่ตรงกับคำค้นหา'}
              hint={leases.length === 0 ? 'ไปที่หน้า Dashboard แล้วกดห้องว่างเพื่อเช็คอินผู้เช่า' : undefined}
            />
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-[rgba(212,194,195,0.3)] bg-[#f6f3f2]">
                  {['TENANT & UNIT', 'BILLING', 'AMOUNT', 'DURATION', 'STATUS', 'ACTIONS'].map(
                    (column, index) => (
                      <th
                        key={column}
                        className={`px-6 py-4 text-xs font-medium tracking-[0.6px] text-body-muted uppercase ${
                          index === 5 ? 'text-right' : ''
                        }`}
                      >
                        {column}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="bg-white/40">
                {filtered.map((lease) => {
                  const status = leaseStatusOn(lease, today)
                  return (
                    <tr key={lease.id} className="border-t border-[rgba(212,194,195,0.2)]">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar name={lease.tenantName} size={40} />
                          <div>
                            <p className="text-sm font-semibold tracking-[0.7px] text-ink">
                              {lease.tenantName}
                            </p>
                            <p className="text-[13px] text-body-muted">ห้อง {lease.roomNumber}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-base text-ink">
                        {lease.billingCycle === 'MONTHLY' ? 'รายเดือน' : 'รายปี'}
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-base text-ink">{baht(lease.monthlyRent)}</p>
                        <p className="text-xs text-body-muted">บาท</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-base text-ink">{thaiDate(lease.startDate)}</p>
                        <p className="text-xs text-body-muted">
                          ถึง {lease.endDate === null ? 'ไม่กำหนด' : thaiDate(lease.endDate)}
                        </p>
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex items-center rounded-sm border px-3 py-1.5 text-xs font-medium ${STATUS_STYLE[status]}`}
                        >
                          {status === 'ACTIVE' ? 'Active' : 'Ended'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            aria-label={`แก้ไขสัญญาห้อง ${lease.roomNumber} ของ ${lease.tenantName}`}
                            onClick={() => setEditing(lease)}
                            className="rounded p-1 text-ink-muted hover:bg-black/5 hover:text-ink"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`ยกเลิกสัญญาห้อง ${lease.roomNumber} ของ ${lease.tenantName}`}
                            disabled={status === 'ENDED'}
                            onClick={() => setCancelling(lease)}
                            className="rounded p-1 text-ink-muted hover:bg-black/5 hover:text-[#93000a] disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Ban size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {leases.length > 0 && (
          <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] bg-white/50 px-4 py-4">
            <p className="text-xs font-medium text-body-muted">
              Showing {filtered.length} of {leases.length} contracts
            </p>
          </div>
        )}
      </div>

      {editing && contracts.data && (
        <LeaseFormDialog
          room={roomOf(editing)}
          tenants={contracts.data.tenants}
          lease={editing}
          existingLeases={leases}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            contracts.reload()
          }}
        />
      )}

      {cancelling && (
        <ConfirmCheckOutDialog
          lease={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null)
            contracts.reload()
          }}
        />
      )}
    </div>
  )
}
