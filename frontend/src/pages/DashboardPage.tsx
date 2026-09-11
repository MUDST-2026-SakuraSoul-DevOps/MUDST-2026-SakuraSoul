import { useMemo, useState } from 'react'
import { Search, Wrench } from 'lucide-react'
import { fetchLeases, fetchRooms, fetchTenants } from '../api/client'
import type { Lease, RoomStatus, RoomSummary, Tenant } from '../api/types'
import { useLoader } from '../hooks/useLoader'
import { ErrorState, LoadingState } from '../components/PageState'
import { RoomDialog } from '../dialogs/RoomDialog'
import { CreateMaintenanceDialog } from '../dialogs/CreateMaintenanceDialog'
import { daysUntil } from '../format'

/**
 * ตรงกับเฟรม "Dashboard Page" ใน Figma (node 119:2394 "Room Availability")
 *
 * ครอบ US-08 แอดมินเห็นภาพรวมห้องทั้ง 24 ห้องในหน้าเดียว แยกสามสถานะ
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

const STATUS_COLOR: Record<RoomStatus, string> = {
  AVAILABLE: '#7c9473',
  OCCUPIED: '#c98a4b',
  MAINTENANCE: '#b5533c',
}

const FILTERS: { id: RoomStatus | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'AVAILABLE', label: 'Available' },
  { id: 'OCCUPIED', label: 'Occupied' },
  { id: 'MAINTENANCE', label: 'Maintenance' },
]

export default function DashboardPage() {
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
  }, [rooms, filter, search])

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading text-[34px] font-light text-[#2b2a26]">Room Availability</h1>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#7c9473]" />
            <p className="text-[13px] text-[#767065]">Live Overview</p>
          </div>
        </div>
        <div className="flex gap-3">
          <SummaryCard label="Available" value={counts.AVAILABLE} />
          <SummaryCard label="Occupied" value={counts.OCCUPIED} />
          <SummaryCard label="Maint." value={counts.MAINTENANCE} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={`rounded-[20px] border px-4 py-[7px] text-[13px] ${
                filter === option.id
                  ? 'border-[#5b3b3b] bg-[#5b3b3b] text-white'
                  : 'border-[#e7e0d3] bg-white text-[#767065] hover:border-[#d9a441]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="flex min-w-[200px] items-center gap-2 rounded-[20px] border border-[#e7e0d3] bg-white px-3.5 py-[7px]">
          <Search size={14} className="text-[#a9a49b]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search room or tenant..."
            aria-label="Search room or tenant"
            className="min-w-[160px] text-[13px] text-[#2b2a26] outline-none placeholder:text-[#a9a49b]"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-6 pt-1.5">
        <Legend color={STATUS_COLOR.AVAILABLE} label="Available" />
        <Legend color={STATUS_COLOR.OCCUPIED} label="Occupied" />
        <Legend color={STATUS_COLOR.MAINTENANCE} label="Maintenance (offline)" />
        <p className="border-l border-[#e7e0d3] pl-4 text-[12.5px] text-[#767065]">🔧 Maintenance ticket open</p>
        <p className="text-[12.5px] text-[#767065]">⚠ Lease ending soon</p>
      </div>

      {/*
        ปุ่ม Maintenance ตามเฟรม Dashboard Page ใน Figma สีพื้น #d4f3ff
        ตัวอักษร #294550 ดูดมาจากไฟล์ export ตรง ๆ

        กดแล้วเปิดป็อปอัป Create Maintenance ไม่ได้พาไปหน้า Maintenance
        ตามที่ทีมยืนยัน และตรงกับ Expected Result ใน SSK-82 ตั้งแต่ต้น
        จึงเป็น button ไม่ใช่ Link เพราะไม่ได้พาไปไหน
      */}
      <div className="pt-1.5">
        {/*
          ปุ่มกรองด้านบนมีปุ่มชื่อ Maintenance อยู่แล้ว ถ้าปุ่มนี้ชื่อเดียวกันเป๊ะ
          คนใช้ screen reader กับตัวเทสจะแยกไม่ออกว่าอันไหนกรอง อันไหนสร้างใบแจ้ง
          จึงตั้งชื่อให้ยาวขึ้นโดยยังมีคำที่เห็นบนปุ่มอยู่ข้างใน
        */}
        <button
          type="button"
          onClick={() => setMaintenanceOpen(true)}
          aria-label="Create Maintenance"
          className="inline-flex items-center gap-2 rounded-lg bg-[#d4f3ff] px-3.5 py-2 text-[13px] font-medium text-[#294550] transition hover:brightness-95 focus:ring-2 focus:ring-brand focus:outline-none"
        >
          <Wrench size={16} />
          Maintenance
        </button>
      </div>

      <div className="flex flex-col gap-4 pt-2">
        {dashboard.loading && <LoadingState label="Loading units..." />}
        {dashboard.error && <ErrorState message={dashboard.error} />}

        {!dashboard.loading && !dashboard.error && visibleFloors.length === 0 && (
          <p className="py-10 text-center text-sm text-[#767065]">No units match your search or filter</p>
        )}

        {visibleFloors.map((group) => (
          <section key={group.floor} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-semibold text-[#2b2a26]">Floor {group.floor}</h2>
              <div className="h-px flex-1 bg-[#e7e0d3]" />
            </div>
            {/*
              auto-rows-fr ทำให้ทุกแถวในชั้นเดียวกันสูงเท่าแถวที่สูงสุด ของเดิม
              แถวที่มีการ์ดติดป้ายเตือนจะสูง 114px ส่วนแถวที่ห้องว่างล้วนสูงแค่
              80px ซึ่งใน Figma การ์ดสูงเท่ากันหมด
            */}
            <ul className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {group.rooms.map((room) => (
                <li key={room.id}>
                  <RoomCard room={room} onSelect={() => setSelectedRoomId(room.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {maintenanceOpen && (
        <CreateMaintenanceDialog
          rooms={rooms}
          onClose={() => setMaintenanceOpen(false)}
          onSave={() => {
            /*
              ยังไม่มี POST /api/maintenance จึงยังส่งข้อมูลไปไหนไม่ได้
              โหลดห้องใหม่ไว้ก่อน เผื่อสถานะห้องเปลี่ยนจากทางอื่น พอมี
              endpoint ค่อยยิงสร้างใบแจ้งจริงตรงนี้
            */
            dashboard.reload()
          }}
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
  const color = STATUS_COLOR[status]
  return (
    <span
      className="inline-block size-[11px] shrink-0 rounded-[5.5px]"
      style={{ backgroundColor: color, boxShadow: `0 0 0 4px ${color}33` }}
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
      className="flex h-full min-h-[100px] w-full min-w-0 flex-col gap-2 overflow-hidden rounded-[10px] border border-[#e7e0d3] bg-white px-3 py-3 text-left transition hover:border-[#d9a441] hover:shadow-sm focus:ring-2 focus:ring-brand focus:outline-none"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-[15px] font-bold text-[#2b2a26]">{room.roomNumber}</p>
        <StatusDot status={room.status} />
      </div>

      {room.currentLease && (
        <p className="truncate text-center text-base text-[#4a463f]">{room.currentLease.tenantName}</p>
      )}
      {room.status === 'MAINTENANCE' && <p className="text-[11px] text-[#b5533c]">Maintenance</p>}

      {/*
        ป้ายต้องเป็นบรรทัดเดียวเสมอ ตามที่ดีไซน์วางไว้ ของเดิมปล่อยให้ตัดบรรทัดได้
        ป้ายที่ข้อความยาวอย่าง "Bathroom drain pipe leaking" เลยกินสามบรรทัด
        แล้วดันการ์ดทั้งชั้นให้สูงกว่าชั้นอื่น ซึ่งเป็นที่มาของการ์ดไม่เท่ากัน
      */}
      {endingSoon && (
        <span className="w-fit max-w-full truncate rounded-full border border-[#d9a441] bg-[#fbf3de] px-2 py-[3px] text-[9.5px] font-semibold text-[#8a5f16]">
          ⚠ {daysLeft} days left
        </span>
      )}
      {room.openMaintenanceCount > 0 && (
        <span className="w-fit max-w-full truncate rounded-full border border-[#b5533c] bg-[#fbeae5] px-2 py-[3px] text-[9.5px] font-semibold text-[#b5533c]">
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
function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      role="group"
      aria-label={`${label} units`}
      className="flex min-w-[86px] flex-col items-center gap-0.5 rounded-[10px] border border-[#e7e0d3] bg-white px-[18px] py-2.5"
    >
      <p className="font-heading text-[32px] tracking-[-0.32px] text-[#6b5c4b]">{value}</p>
      <p className="text-[10px] tracking-[0.6px] text-[#767065] uppercase">{label}</p>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-[9px] rounded-full" style={{ backgroundColor: color }} />
      <p className="text-[12.5px] text-[#767065]">{label}</p>
    </div>
  )
}
