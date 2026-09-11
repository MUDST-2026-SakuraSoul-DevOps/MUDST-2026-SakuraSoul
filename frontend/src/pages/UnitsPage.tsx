import { useMemo, useState } from 'react'
import { Building, Plus } from '@phosphor-icons/react'
import { Wrench, ChevronDown } from 'lucide-react'
import { fetchRooms } from '../api/client'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { SecondaryButton, PrimaryButton } from '../components/Button'
import { RoomStatusBadge } from '../components/RoomStatusBadge'
import { LoadingState, ErrorState } from '../components/PageState'
import { RoomStatusDialog } from '../dialogs/RoomStatusDialog'
import { ApartmentConfigDialog } from '../dialogs/ApartmentConfigDialog'

/**
 * ตรงกับเฟรม "Unit Page" ใน Figma (node 125:2229) — ตาราง unit ทั้งหมดพร้อม
 * filter ชั้น/ตึก
 *
 * คอลัมน์สถานะกับผู้เช่ามาจาก GET /api/rooms ที่คืนสถานะห้องมาให้แล้ว
 * (ดูสัญญาที่ตกลงไว้ใน docs/api-contract-lease.md) ดีไซน์เดิมมีคอลัมน์
 * "ประเภทห้อง" ด้วย แต่ตาราง room ยังไม่มีฟิลด์นั้นเลยเปลี่ยนเป็นชื่อผู้เช่าแทน
 * ซึ่งเป็นข้อมูลที่แอดมินอยากรู้จากตารางนี้มากกว่าอยู่แล้ว
 *
 * ปุ่มรูปประแจท้ายแถวเปิดป็อปอัปล็อกห้องเป็นซ่อมบำรุงหรือปลดล็อกกลับ (US-15)
 * วางไว้ที่นี่เพราะเป็นที่เดียวที่เห็นห้องครบทั้ง 24 ห้องพร้อมสถานะในตารางเดียว
 * ไม่ว่าห้องจะอยู่สถานะไหนก็กดได้จากจุดเดียวกัน
 *
 * ปุ่ม Config เปิดหน้าตั้งอัตราค่าไฟ ค่าน้ำ ค่าส่วนกลาง ค่าอินเทอร์เน็ต (US-16)
 * เป็นการตั้งค่าระดับตึกไม่ใช่ของห้องใดห้องหนึ่ง จึงอยู่ที่หัวหน้านี้ไม่ใช่ในแถว
 *
 * ปุ่ม Add Unit ยังเป็น placeholder เพราะยังไม่มี endpoint POST ของห้องให้เรียก
 */
export default function UnitsPage() {
  const [floor, setFloor] = useState<number | 'all'>('all')
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const roomsLoader = useLoader(fetchRooms, 'Could not load units')
  const rooms = useMemo(() => roomsLoader.data ?? [], [roomsLoader.data])
  const error = roomsLoader.error

  const floors = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b),
    [rooms],
  )
  const filteredRooms = useMemo(
    () => rooms.filter((r) => floor === 'all' || r.floor === floor),
    [rooms, floor],
  )
  const editingRoom = rooms.find((room) => room.id === editingRoomId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Unit Management"
        description="Overseeing a specific sub-division or module to ensure efficient operations."
        actions={
          <>
            <SecondaryButton onClick={() => setConfigOpen(true)}>Config</SecondaryButton>
            <PrimaryButton>
              <Plus size={11} weight="bold" />
              Add Unit
            </PrimaryButton>
          </>
        }
      />

      <div className="w-full rounded-2xl border border-card-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-card-border px-6 pt-6 pb-6">
          <div className="flex items-center gap-2">
            <Building size={18} className="text-heading" />
            <h2 className="font-heading text-xl text-heading">All Units</h2>
          </div>
          <div className="flex gap-3">
            <span className="flex items-center gap-2 rounded-lg border border-card-border bg-chip-bg px-3.5 py-1.5 text-sm text-table-label">
              Building A
              <ChevronDown size={14} />
            </span>
            <label className="flex items-center gap-2 rounded-lg border border-card-border bg-chip-bg px-3.5 py-1.5 text-sm text-table-label">
              <select
                value={floor === 'all' ? '' : floor}
                onChange={(e) => setFloor(e.target.value === '' ? 'all' : Number(e.target.value))}
                className="appearance-none bg-transparent outline-none"
              >
                <option value="">All floors</option>
                {floors.map((f) => (
                  <option key={f} value={f}>
                    Floor {f}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto px-6 pb-6">
          {error && <ErrorState message={error} />}
          {roomsLoader.loading && <LoadingState label="Loading units..." />}
          {!error && !roomsLoader.loading && (
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr>
                  {['UNIT NUMBER', 'TENANT', 'STATUS', 'ACTION'].map((col) => (
                    <th
                      key={col}
                      className="border-b border-card-border px-4 py-4 text-xs font-semibold tracking-[0.6px] text-table-label uppercase"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((room) => (
                  <tr key={room.id} className="border-t border-row-border">
                    <td className="px-4 py-6 text-sm font-medium text-heading">{room.roomNumber}</td>
                    <td className="px-4 py-6 text-sm text-table-label">
                      {room.currentLease?.tenantName ?? '-'}
                    </td>
                    <td className="px-4 py-6">
                      <RoomStatusBadge status={room.status} />
                    </td>
                    <td className="px-4 py-6">
                      <button
                        type="button"
                        onClick={() => setEditingRoomId(room.id)}
                        className="rounded p-1 text-table-label hover:bg-black/5"
                        aria-label={`Set status for unit ${room.roomNumber}`}
                      >
                        <Wrench size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {configOpen && <ApartmentConfigDialog onClose={() => setConfigOpen(false)} />}

      {editingRoom && (
        <RoomStatusDialog
          room={editingRoom}
          onClose={() => setEditingRoomId(null)}
          onChanged={roomsLoader.reload}
        />
      )}
    </div>
  )
}
