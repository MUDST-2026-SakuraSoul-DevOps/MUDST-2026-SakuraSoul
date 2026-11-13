import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Search, Wrench, Building2, Users, Wallet, CalendarClock } from 'lucide-react'
import {
  ApiError,
  createMaintenanceTicket,
  createReminder,
  fetchLeases,
  fetchRooms,
  fetchTenants,
  updateRoomStatus,
} from '../api/client'
import type { Lease, RoomStatus, RoomSummary, Tenant } from '../api/types'
import { dashboardCreateRequest, dashboardReminderRequest } from '../api/maintenanceMappers'
import type { CreateMaintenanceDraft } from '../domain/maintenanceTicket'
import { useLoader } from '../hooks/useLoader'
import { ErrorState, LoadingState } from '../components/PageState'
import { RoomDialog } from '../dialogs/RoomDialog'
import { CreateMaintenanceDialog } from '../dialogs/CreateMaintenanceDialog'
import { daysUntil } from '../format'

/**
 * ตรงกับเฟรม "Dashboard Page" ใน Figma (node 119:2394 "Room Availability")
 *
 * ครอบ US-08 แอดมินเห็นภาพรวมห้องทุกห้องในหน้าเดียว แยกสามสถานะ (จำนวนห้องกับชั้นตั้งได้ตั้งแต่ SSK-160)
 * ว่าง / มีผู้เช่า / ซ่อมบำรุง โดยข้อมูลมาจาก GET /api/rooms จริง ไม่ใช่ค่าคงที่
 * ในโค้ด กดโหลดใหม่แล้วต้องเห็นสถานะตรงกับฐานข้อมูลเสมอ
 *
 * และครอบ US-09 คลิกการ์ดห้องแล้วเปิดป็อปอัปที่ต่างกันตามสถานะห้อง ดู RoomDialog
 *
 * โหลดสามอย่างพร้อมกันตั้งแต่เปิดหน้า เพราะป็อปอัปต้องใช้ครบทั้งสาม ห้องเอาไว้วาง
 * กริด ผู้เช่าเอาไว้ให้เลือกตอนเช็คอิน และสัญญาเอาไว้เตือนวันที่ทับกันก่อนกดส่ง
 * ตาม US-05 ถ้าไปโหลดตอนคลิกผู้ใช้จะเห็นป็อปอัปว่างแวบหนึ่งก่อนทุกครั้ง
 */

/** จำนวนวันที่ถือว่า "สัญญาใกล้หมด" แล้วควรติดป้ายเตือนบนการ์ด */
const LEASE_ENDING_SOON_DAYS = 30

/**
 * คลาสสีของจุดสถานะห้อง ส่งเป็นคลาสไม่ใช่ค่าสี จะได้อยู่ในระบบ token เดียวกัน
 *
 * เขียนชื่อคลาสเต็มทุกตัว ห้ามประกอบชื่อตอนรันเช่น `ring-${name}` เพราะ Tailwind
 * สแกนหาคลาสจากตัวอักษรในไฟล์ ชื่อที่เพิ่งประกอบขึ้นตอนรันจะไม่ถูก build ออกมา
 * แล้วสีจะหายไปเงียบ ๆ โดยที่เทสไม่จับ
 */
const STATUS_DOT_CLASS: Record<RoomStatus, string> = {
  AVAILABLE: 'bg-moss-415',
  OCCUPIED: 'bg-honey-374',
  MAINTENANCE: 'bg-alert-530',
}

/** วงรอบจุดสถานะ ความโปร่ง 20% ให้ผลเท่ากับ box-shadow เดิมที่ต่อท้ายด้วย 33 */
const STATUS_RING_CLASS: Record<RoomStatus, string> = {
  AVAILABLE: 'ring-moss-415/20',
  OCCUPIED: 'ring-honey-374/20',
  MAINTENANCE: 'ring-alert-530/20',
}

const FILTERS: { id: RoomStatus | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'AVAILABLE', label: 'Available' },
  { id: 'OCCUPIED', label: 'Occupied' },
  { id: 'MAINTENANCE', label: 'Maintenance' },
]

export default function DashboardPage() {
  const [floor, setFloor] = useState('all')
  const [filter, setFilter] = useState<RoomStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)

  const dashboard = useLoader<{ rooms: RoomSummary[]; tenants: Tenant[]; leases: Lease[] }>(
    async () => {
      const [rooms, tenants, leases] = await Promise.all([
        fetchRooms(),
        fetchTenants(),
        fetchLeases(),
      ])
      return { rooms, tenants, leases }
    },
    'Could not load the dashboard',
  )

  const rooms = useMemo(() => dashboard.data?.rooms ?? [], [dashboard.data])

  /**
   * บันทึกจากป็อปอัป Create Maintenance (SSK-131) เดิมกดแล้วไม่มีอะไรถูกบันทึกเลย
   *
   * สร้างใบแจ้งซ่อมก่อน แล้วค่อยล็อกห้องถ้าเลือก Out of Service ถ้าสลับลำดับ แล้วสร้างใบ
   * ไม่สำเร็จ ห้องจะถูกปิดไว้โดยไม่มีใบแจ้งซ่อมบอกว่าปิดทำไม ห้องที่ปิดซ่อมอยู่แล้วไม่ต้องล็อกซ้ำ
   *
   * ติ๊ก Recurring แล้วสร้างรอบแจ้งเตือนเป็นขั้นสุดท้าย (SSK-20) ขั้นหลังใบแจ้งซ่อมพังเมื่อไหร่ บอกให้ชัดว่า
   * ใบถูกสร้างแล้วและเหลืออะไรให้ทำเอง ผู้ใช้จะได้ไม่กดบันทึกซ้ำจนได้ใบซ้ำ
   */
  async function createMaintenance(draft: CreateMaintenanceDraft) {
    const room = rooms.find((r) => r.roomNumber === draft.roomNumber)
    if (!room) {
      throw new ApiError(404, `Unit ${draft.roomNumber} was not found. Reload the page and try again.`)
    }
    await createMaintenanceTicket(dashboardCreateRequest(draft, room.id))
    const reminderNote = draft.recurring
      ? ' The recurring reminder was not created either; add it in Maintenance → Schedule & Reminder.'
      : ''
    try {
      try {
        if (draft.availability === 'OUT_OF_SERVICE' && room.status !== 'MAINTENANCE') {
          await updateRoomStatus(room.id, 'MAINTENANCE')
        }
      } catch (err) {
        throw new ApiError(
          err instanceof ApiError ? err.status : 0,
          `The ticket was created, but unit ${room.roomNumber} could not be set to Out of Service. Lock it from the Units page.${reminderNote}`,
        )
      }
      if (draft.recurring) {
        try {
          await createReminder(dashboardReminderRequest(draft, room.id))
        } catch (err) {
          throw new ApiError(
            err instanceof ApiError ? err.status : 0,
            'The ticket was created, but the recurring reminder could not be saved. Add it in Maintenance → Schedule & Reminder.',
          )
        }
      }
    } finally {
      // การ์ดห้องต้องขึ้นชื่องานซ่อมใหม่ (และสถานะซ่อมบำรุงถ้าล็อก) ทันทีตาม US-08
      dashboard.reload()
    }
  }

  const counts = useMemo(
    () => ({
      AVAILABLE: rooms.filter((r) => r.status === 'AVAILABLE').length,
      OCCUPIED: rooms.filter((r) => r.status === 'OCCUPIED').length,
      MAINTENANCE: rooms.filter((r) => r.status === 'MAINTENANCE').length,
    }),
    [rooms],
  )

  /** จัดกลุ่มตามชั้นจากข้อมูลจริง ไม่ฮาร์ดโค้ดว่ามีสองชั้น เผื่อตึกเพิ่มชั้นทีหลัง */
  const visibleFloors = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matched = rooms.filter((room) => {
      if (floor !== 'all' && room.floor !== Number(floor)) return false
      if (filter !== 'ALL' && room.status !== filter) {
        return false
      }
      if (query === '') {
        return true
      }
      const tenantName = room.currentLease?.tenantName.toLowerCase() ?? ''
      return room.roomNumber.includes(query) || tenantName.includes(query)
    })

    const floors = [...new Set(matched.map((room) => room.floor))].sort((a, b) => a - b)
    return floors.map((floor) => ({
      floor,
      rooms: matched
        .filter((room) => room.floor === floor)
        .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber)),
    }))
  }, [rooms, filter, search, floor])

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Room Availability" description="An overview of your apartment, residents, and work that needs attention." />
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total rooms" value={rooms.length} detail={`${new Set(rooms.map((room) => room.floor)).size} floors`} icon="building" />
        <SummaryCard label="Occupied" value={counts.OCCUPIED} detail="Rooms with a current lease" icon="people" />
        <SummaryCard label="Available" value={counts.AVAILABLE} detail={`${counts.MAINTENANCE} rooms currently under maintenance`} icon="building" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/payments?status=Overdue" className="dashboard-shortcut"><Wallet size={18} aria-hidden="true" />Review outstanding payments</Link>
        <Link to="/maintenance" className="dashboard-shortcut"><Wrench size={18} aria-hidden="true" />View maintenance &amp; low stock</Link>
        <Link to="/contracts?status=Ending+Soon" className="dashboard-shortcut"><CalendarClock size={18} aria-hidden="true" />Review leases ending soon</Link>
      </div>
      <section className="rounded-xl border border-card-border bg-white p-4 sm:p-6" aria-label="Room overview">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-xl text-ink">Room overview</h2>
            <p className="mt-1 text-sm text-ink-muted">Live availability across all floors. Select a room to manage it.</p>
          </div>
        <button
          type="button"
          onClick={() => setMaintenanceOpen(true)}
          aria-label="Create Maintenance"
          className="inline-flex items-center gap-2 rounded-lg bg-ocean-60 px-3.5 py-2 text-sm font-medium text-ocean-720 transition hover:brightness-95 focus:ring-2 focus:ring-brand focus:outline-none"
        >
          <Wrench aria-hidden="true" className="ui-icon size-icon-control" />
          Maintenance
        </button>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <label className="relative block w-full sm:max-w-sm">
            <span className="sr-only">Search room or tenant</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search room or tenant..." className="min-h-11 w-full rounded-lg border border-card-border bg-page-bg py-2 pl-10 pr-3 text-sm outline-none focus:border-brand" />
          </label>
          <label className="flex w-full flex-col gap-1 text-sm text-ink-muted sm:w-44">
            Floor
            <select aria-label="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} className="min-h-11 rounded-lg border border-card-border bg-white px-3 py-2 text-ink">
              <option value="all">All floors</option>
              {[...new Set(rooms.map((room) => room.floor))].sort((a,b) => a-b).map((number) => <option key={number} value={number}>Floor {number}</option>)}
            </select>
          </label>
        </div>
        <div className="section-tabs mt-5" role="group" aria-label="Room status">
          {FILTERS.map((option) => <button key={option.id} type="button" onClick={() => setFilter(option.id)} aria-pressed={filter === option.id} className="section-tab">{option.label}</button>)}
        </div>
        <div className="mt-5 flex flex-col gap-6">
          {dashboard.loading && <LoadingState label="Loading units..." />}
          {dashboard.error && <ErrorState message={dashboard.error} />}
          {!dashboard.loading && !dashboard.error && visibleFloors.length === 0 && <p className="py-10 text-center text-sm text-sand-530">No units match your search or filter</p>}
          {visibleFloors.map((group) => (
            <section key={group.floor} className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-ink-muted">Floor {group.floor}</h2>
              <ul className="grid auto-rows-fr grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {group.rooms.map((room) => <li key={room.id}><RoomCard room={room} onSelect={() => setSelectedRoomId(room.id)} /></li>)}
              </ul>
            </section>
          ))}
        </div>
        <p role="group" aria-label="Maint. units" className="mt-5 border-t border-card-border pt-4 text-xs text-ink-muted"><span>{counts.MAINTENANCE}</span> rooms under maintenance</p>
      </section>

      {maintenanceOpen && (
        <CreateMaintenanceDialog
          rooms={rooms}
          onClose={() => setMaintenanceOpen(false)}
          onSave={createMaintenance}
        />
      )}

      {selectedRoom && dashboard.data && (
        <RoomDialog
          room={selectedRoom}
          tenants={dashboard.data.tenants}
          leases={dashboard.data.leases}
          onClose={() => setSelectedRoomId(null)}
          onChanged={dashboard.reload}
        />
      )}
    </div>
  )
}

function StatusDot({ status }: { status: RoomStatus }) {
  return (
    <span
      className={`inline-block size-[11px] shrink-0 rounded-[5.5px] ring-4 ${STATUS_DOT_CLASS[status]} ${STATUS_RING_CLASS[status]}`}
      aria-hidden="true"
    />
  )
}

function RoomCard({ room, onSelect }: { room: RoomSummary; onSelect: () => void }) {
  const endDate = room.currentLease?.endDate ?? null
  const daysLeft = endDate === null ? null : daysUntil(endDate)
  const endingSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= LEASE_ENDING_SOON_DAYS

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Unit ${room.roomNumber}`}
      className="flex h-full min-h-[150px] w-full min-w-0 flex-col gap-2 overflow-hidden rounded-[10px] border border-sand-110 bg-page-bg/50 px-4 py-4 text-left transition hover:border-honey-290 hover:shadow-sm focus:ring-2 focus:ring-brand focus:outline-none"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="break-words text-base font-bold text-sand-830">{room.roomNumber}</p>
        <StatusDot status={room.status} />
      </div>

      {room.currentLease && (
        <p className="break-words text-left text-sm text-sand-700">{room.currentLease.tenantName}</p>
      )}
      <span className={`w-fit rounded px-2 py-1 text-xs font-medium ${room.status === 'AVAILABLE' ? 'bg-moss-50 text-moss-545' : room.status === 'OCCUPIED' ? 'bg-blush-50 text-brand' : 'bg-honey-20 text-honey-615'}`}>
        {room.status === 'AVAILABLE' ? 'Available' : room.status === 'OCCUPIED' ? 'Occupied' : 'Maintenance'}
      </span>
      {room.status === 'AVAILABLE' && <p className="text-xs text-ink-muted">Ready for check-in</p>}


      {/*
        ป้ายต้องเป็นบรรทัดเดียวเสมอ ตามที่ดีไซน์วางไว้ ของเดิมปล่อยให้ตัดบรรทัดได้
        ป้ายที่ข้อความยาวอย่าง "Bathroom drain pipe leaking" เลยกินสามบรรทัด
        แล้วดันการ์ดทั้งชั้นให้สูงกว่าชั้นอื่น ซึ่งเป็นที่มาของการ์ดไม่เท่ากัน
      */}
      {endingSoon && (
        <span className="w-fit max-w-full break-words rounded-full border border-honey-290 bg-honey-20 px-2 py-[3px] text-xs font-semibold text-honey-565">
          ⚠ {daysLeft} days left
        </span>
      )}
      {room.openMaintenanceCount > 0 && (
        <span className="w-fit max-w-full break-words rounded-full border border-alert-530 bg-blush-60 px-2 py-[3px] text-xs font-semibold text-alert-530">
          {/*
            Figma โชว์ชื่อเรื่องของใบแจ้งซ่อมบนการ์ด ไม่ใช่จำนวนใบ ถอยไปใช้จำนวน
            เมื่อ backend ยังไม่ส่ง title มา จะได้ไม่มีป้ายเปล่าโผล่บนการ์ด
          */}
          🔧 {room.openMaintenanceTitle ?? `${room.openMaintenanceCount} maintenance ticket(s)`}
        </span>
      )}
    </button>
  )
}

/**
 * คำว่า Available/Occupied ปรากฏหลายที่ในหน้านี้ (ปุ่มกรอง คำอธิบายสี) จึงติด
 * role กับ label ให้การ์ดสรุป เพื่อให้ทั้งคนใช้ screen reader และเทสชี้มาที่
 * ตัวเลขสรุปได้ตรงตัว ไม่ไปโดนคำเดียวกันที่อื่น
 */
function SummaryCard({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: 'building' | 'people' }) {
  const Icon = icon === 'people' ? Users : Building2
  return (
    <div role="group" aria-label={`${label} units`} className="relative flex min-w-0 flex-col gap-3 rounded-xl border border-card-border bg-white p-5">
      <Icon className="absolute right-5 top-5 size-5 text-brand/40" aria-hidden="true" />
      <p className="pr-6 text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="font-heading text-3xl text-ink">{value}</p>
      <p className="text-xs text-ink-muted">{detail}</p>
    </div>
  )
}
