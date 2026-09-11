import { useEffect, useMemo, useRef, useState } from 'react'
import { Building, Plus } from '@phosphor-icons/react'
import { Pencil, ChevronDown, Check } from 'lucide-react'
import { fetchRooms } from '../api/client'
import { roomTypeLabel } from '../domain/room'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { SecondaryButton, PrimaryButton } from '../components/Button'
import { RoomStatusBadge } from '../components/RoomStatusBadge'
import { LoadingState, ErrorState } from '../components/PageState'
import { RoomStatusDialog } from '../dialogs/RoomStatusDialog'
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
  const [floorDropdownOpen, setFloorDropdownOpen] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!floorDropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFloorDropdownOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setFloorDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [floorDropdownOpen])

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
            <div ref={dropdownRef} className="relative inline-block text-left">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={floorDropdownOpen}
                aria-label="Filter by floor"
                onClick={() => setFloorDropdownOpen((prev) => !prev)}
                className="flex items-center justify-between gap-2.5 rounded-lg border border-card-border bg-chip-bg px-3.5 py-1.5 text-sm text-table-label hover:bg-black/5 transition-colors cursor-pointer"
              >
                <span>{floor === 'all' ? 'All floors' : `Floor ${floor}`}</span>
                <ChevronDown
                  size={14}
                  className={`text-table-label transition-transform duration-200 ${floorDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {floorDropdownOpen && (
                <div
                  role="listbox"
                  className="absolute top-full left-0 z-30 mt-1.5 min-w-[130px] rounded-xl border border-card-border bg-white p-1.5 shadow-[0px_10px_25px_-5px_rgba(0,0,0,0.1)]"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={floor === 'all'}
                    onClick={() => {
                      setFloor('all')
                      setFloorDropdownOpen(false)
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors cursor-pointer ${
                      floor === 'all' ? 'bg-[#faf3f0] font-semibold text-brand' : 'text-heading hover:bg-black/5'
                    }`}
                  >
                    <span>All floors</span>
                    {floor === 'all' && <Check size={14} className="text-brand" />}
                  </button>
                  {floors.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="option"
                      aria-selected={floor === f}
                      onClick={() => {
                        setFloor(f)
                        setFloorDropdownOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors cursor-pointer ${
                        floor === f ? 'bg-[#faf3f0] font-semibold text-brand' : 'text-heading hover:bg-black/5'
                      }`}
                    >
                      <span>Floor {f}</span>
                      {floor === f && <Check size={14} className="text-brand" />}
                    </button>
                  ))}
                </div>
              )}
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
                      <button
                        type="button"
                        onClick={() => setEditingRoomId(room.id)}
                        className="rounded p-1 text-table-label hover:bg-black/5 cursor-pointer"
                        aria-label={`Set status for unit ${room.roomNumber}`}
                      >
                        <Pencil size={14} />
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
    </div>
  )
}


