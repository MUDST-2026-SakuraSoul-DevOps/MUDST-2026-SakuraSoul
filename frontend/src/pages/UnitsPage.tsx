import { useMemo, useState } from 'react'
import { Building, Plus } from '@phosphor-icons/react'
import { Pencil, Trash2, ChevronDown } from 'lucide-react'
import { fetchRooms } from '../api/client'
import type { RoomSummary } from '../api/types'
import { roomTypeLabel } from '../domain/room'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { SecondaryButton, PrimaryButton } from '../components/Button'
import { RoomStatusBadge } from '../components/RoomStatusBadge'
import { LoadingState, ErrorState } from '../components/PageState'
import { RoomStatusDialog } from '../dialogs/RoomStatusDialog'
import { DeleteUnitDialog } from '../dialogs/DeleteUnitDialog'
import { ApartmentConfigDialog } from '../dialogs/ApartmentConfigDialog'
import { AddUnitDialog } from '../dialogs/AddUnitDialog'

/**
 * ตรงกับเฟรม "Unit Page" ใน Figma (node 125:2229) — ตาราง unit ทั้งหมดพร้อม
 * filter ชั้น/ตึก
 *
 * คอลัมน์เป็น UNIT NUMBER / TYPE / STATUS / ACTION ตามดีไซน์เป๊ะ ๆ รอบก่อน
 * ตาราง room ยังไม่มีฟิลด์ประเภทห้อง เลยเอาชื่อผู้เช่ามาใส่แทนช่อง TYPE ไว้ก่อน
 * รอบนี้ roomType เข้าสัญญาแล้ว (ดู docs/api-contract-lease.md) จึงกลับไปตาม
 * ดีไซน์ ส่วนชื่อผู้เช่ายังดูได้ที่หน้า Dashboard กับ Tenants ซึ่งเป็นที่ของมัน
 *
 * ปุ่มดินสอท้ายแถวเปิดป็อปอัปล็อกห้องเป็นซ่อมบำรุงหรือปลดล็อกกลับ (US-15)
 * วางไว้ที่นี่เพราะเป็นที่เดียวที่เห็นห้องครบทั้ง 24 ห้องพร้อมสถานะในตารางเดียว
 * ไม่ว่าห้องจะอยู่สถานะไหนก็กดได้จากจุดเดียวกัน
 *
 * ปุ่ม Config เปิดหน้าตั้งอัตราค่าไฟ ค่าน้ำ ค่าส่วนกลาง ค่าอินเทอร์เน็ต (US-16)
 * เป็นการตั้งค่าระดับตึกไม่ใช่ของห้องใดห้องหนึ่ง จึงอยู่ที่หัวหน้านี้ไม่ใช่ในแถว
 *
 * ปุ่ม Add Unit เปิด AddUnitDialog ของเดิมเป็นปุ่มเปล่าไม่มี onClick กดแล้วเงียบ
 */
export default function UnitsPage() {
  const [floor, setFloor] = useState<number | 'all'>('all')
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null)
  const [deletingRoom, setDeletingRoom] = useState<RoomSummary | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

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
            <PrimaryButton onClick={() => setAddOpen(true)}>
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
            {/*
              ดีไซน์วาดช่องนี้เป็น dropdown แต่ทั้งระบบมีตึกเดียว (ห้อง 101-212
              อยู่ตึกเดียวกันหมด) ตัวเลือกจึงมีค่าเดียวและกดไปก็ไม่มีอะไรเปลี่ยน
              ตัดลูกศรออกให้เป็นป้ายบอกตึกเฉย ๆ ดีกว่าปล่อยลูกศรที่กดแล้วเงียบ
              ถ้าวันหลังมีหลายตึกต้องเพิ่มฟิลด์ building เข้าสัญญาก่อน
            */}
            <span className="flex items-center gap-2 rounded-lg border border-card-border bg-chip-bg px-3.5 py-1.5 text-sm text-table-label">
              Building A
            </span>
            <div className="relative inline-flex items-center">
              <select
                aria-label="Filter by floor"
                value={floor === 'all' ? '' : floor}
                onChange={(e) => setFloor(e.target.value === '' ? 'all' : Number(e.target.value))}
                className="cursor-pointer appearance-none rounded-lg border border-card-border bg-chip-bg py-1.5 pl-3.5 pr-8 text-sm text-table-label outline-none hover:bg-black/5 transition-colors"
              >
                <option value="">All floors</option>
                {floors.map((f) => (
                  <option key={f} value={f}>
                    Floor {f}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-table-label" />
            </div>
          </div>
        </div>


        <div className="overflow-x-auto px-6 pb-6">
          {error && <ErrorState message={error} />}
          {roomsLoader.loading && <LoadingState label="Loading units..." />}
          {!error && !roomsLoader.loading && (
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr>
                  {['UNIT NUMBER', 'TYPE', 'STATUS', 'ACTION'].map((col) => (
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
                      {roomTypeLabel(room.roomType)}
                    </td>
                    <td className="px-4 py-6">
                      <RoomStatusBadge status={room.status} />
                    </td>
                    <td className="px-4 py-6">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingRoomId(room.id)}
                          className="rounded p-1 text-table-label hover:bg-black/5 cursor-pointer"
                          aria-label={`Set status for unit ${room.roomNumber}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingRoom(room)}
                          className="rounded p-1 text-table-label hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          aria-label={`Delete unit ${room.roomNumber}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {configOpen && <ApartmentConfigDialog onClose={() => setConfigOpen(false)} />}

      {addOpen && (
        <AddUnitDialog onClose={() => setAddOpen(false)} onCreated={roomsLoader.reload} />
      )}

      {editingRoom && (
        <RoomStatusDialog
          room={editingRoom}
          onClose={() => setEditingRoomId(null)}
          onChanged={roomsLoader.reload}
        />
      )}

      {deletingRoom && (
        <DeleteUnitDialog
          room={deletingRoom}
          onClose={() => setDeletingRoom(null)}
          onDeleted={roomsLoader.reload}
        />
      )}
    </div>
  )
}

