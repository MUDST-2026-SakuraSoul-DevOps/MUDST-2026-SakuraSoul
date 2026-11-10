import { useEffect, useMemo, useRef, useState } from 'react'
import { Building, Buildings, CalendarBlank, Stack } from '@phosphor-icons/react'
import { Pencil, ChevronDown, Check, History, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchRooms } from '../api/client'
import { roomTypeLabel } from '../domain/room'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { SecondaryButton } from '../components/Button'
import { RoomStatusBadge } from '../components/RoomStatusBadge'
import { DataTable } from '../components/DataTable'
import { LoadingState, ErrorState } from '../components/PageState'
import { RoomStatusDialog } from '../dialogs/RoomStatusDialog'
import { ApartmentConfigDialog } from '../dialogs/ApartmentConfigDialog'
import { BuildingLayoutDialog } from '../dialogs/BuildingLayoutDialog'
import { StatCard } from '../components/StatCard'
import { SectionTabs } from '../components/SectionTabs'
import { useSectionView, type SectionView } from '../hooks/useSectionView'
import { RateHistoryView } from './units/RateHistoryView'
import { ExtraChargesView } from './units/ExtraChargesView'
import { UtilitiesView } from './units/UtilitiesView'
import { fetchRoomRatesFrom } from '../api/client'
import { displayMonth, nextMonth } from '../domain/roomRate'
import { bahtAmount, todayInBangkok } from '../format'

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
 * วางไว้ที่นี่เพราะเป็นที่เดียวที่เห็นห้องครบทุกห้องพร้อมสถานะในตารางเดียว
 * ไม่ว่าห้องจะอยู่สถานะไหนก็กดได้จากจุดเดียวกัน
 *
 * ปุ่ม Config เปิดหน้าตั้งอัตราค่าไฟ ค่าน้ำ ค่าส่วนกลาง ค่าอินเทอร์เน็ต (US-16)
 * เป็นการตั้งค่าระดับตึกไม่ใช่ของห้องใดห้องหนึ่ง จึงอยู่ที่หัวหน้านี้ไม่ใช่ในแถว
 * ปุ่ม Apartment settings เหนือการ์ดตั้งจำนวนชั้นกับห้องต่อชั้น (SSK-160) วางตามดีไซน์ Units ของ
 * SSK-177 การ์ดสองใบนับจากห้องจริง ไม่ได้ฝังเลข 24 ห้องหรือ 2 ชั้นไว้ที่ไหน
 *
 * แท็บย่อย (?view=) ตามดีไซน์เดียวกัน: All units, Rate history กับการ์ด Next rate change (SSK-162),
 * Extra charges (SSK-165), Water & Electricity (SSK-166 นำเข้า CSV)
 * ตาราง All units ซ่อนด้วย hidden แทนการถอด ตัวกรองชั้นที่เลือกไว้จะได้ไม่หายตอนสลับแท็บ
 */
/** แท็บย่อยตามดีไซน์ SSK-177 แต่ละการ์ดเพิ่มแท็บของตัวเอง (SSK-162 Rate history) */
const UNIT_VIEWS: SectionView<'rooms' | 'rates' | 'charges' | 'utilities'>[] = [
  { value: 'rooms', label: 'All units' },
  { value: 'rates', label: 'Rate history' },
  { value: 'charges', label: 'Extra charges' },
  { value: 'utilities', label: 'Water & Electricity' },
]

export default function UnitsPage() {
  const [floor, setFloor] = useState<number | 'all'>('all')
  const [floorDropdownOpen, setFloorDropdownOpen] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)

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

  const view = useSectionView(UNIT_VIEWS)
  const roomsLoader = useLoader(fetchRooms, 'Could not load units')
  // การเปลี่ยนอัตราครั้งถัดไปของทุกห้อง นับจากเดือนหน้า (SSK-162)
  const upcomingRates = useLoader(
    () => fetchRoomRatesFrom(nextMonth(todayInBangkok().slice(0, 7))),
    'Could not load scheduled rates',
  )
  const nextRate = upcomingRates.data?.[0] ?? null
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

  // นับจากห้องจริง ถ้าเคยลบห้องทีละห้องจนแต่ละชั้นไม่เท่ากัน บอกเป็นจำนวนสูงสุดแทน
  const roomsPerFloorHint = useMemo(() => {
    const counts = floors.map((f) => rooms.filter((r) => r.floor === f).length)
    const most = Math.max(0, ...counts)
    return counts.every((c) => c === most) ? `${most} rooms per floor` : `Up to ${most} rooms per floor`
  }, [rooms, floors])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Unit Management"
        description="Manage room availability, effective rates, and room-specific charges."
        actions={<SecondaryButton onClick={() => setConfigOpen(true)}>Config</SecondaryButton>}
      />

      <SectionTabs label="Units sections" views={UNIT_VIEWS} active={view} />

      {/* ปุ่มกับการ์ดสองใบตามดีไซน์ Units ของ SSK-177 ปุ่มอยู่ขวาเหนือการ์ดเหมือนในภาพ */}
      <div className="flex justify-end">
        <SecondaryButton onClick={() => setLayoutOpen(true)} disabled={!roomsLoader.data}>
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="ui-icon size-icon-inline" aria-hidden="true" />
            Apartment settings
          </span>
        </SecondaryButton>
      </div>

      {roomsLoader.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total Units"
            value={String(rooms.length)}
            icon={Buildings}
            footer={<p className="text-xs text-body-muted">{roomsPerFloorHint}</p>}
          />
          <StatCard
            label="Floors"
            value={String(floors.length)}
            icon={Stack}
            footer={<p className="text-xs text-body-muted">Configurable apartment layout</p>}
          />
          <StatCard
            label="Next Rate Change"
            value={nextRate ? displayMonth(nextRate.effectiveFrom) : 'None'}
            icon={CalendarBlank}
            footer={
              <p className="text-xs text-body-muted">
                {nextRate
                  ? `Unit ${rooms.find((r) => r.id === nextRate.roomId)?.roomNumber ?? '-'} · old invoices stay intact`
                  : 'Scheduled rates keep old invoices intact'}
              </p>
            }
          />
        </div>
      )}

      {view === 'rates' && rooms.length > 0 && (
        <RateHistoryView
          rooms={rooms}
          onChanged={() => {
            roomsLoader.reload()
            upcomingRates.reload()
          }}
        />
      )}

      {view === 'charges' && rooms.length > 0 && <ExtraChargesView rooms={rooms} />}

      {view === 'utilities' && <UtilitiesView />}

      <div hidden={view !== 'rooms'} className="w-full rounded-2xl border border-card-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-card-border px-6 pt-6 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Building className="ui-icon size-icon-inline text-heading" aria-hidden="true" />
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

                  className={`ui-icon size-icon-inline text-table-label transition-transform duration-200 ${floorDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true"
                />
              </button>

              {floorDropdownOpen && (
                <div
                  role="listbox"
                  className="absolute top-full right-0 z-30 mt-1.5 min-w-[130px] rounded-xl border border-card-border bg-white p-1.5 shadow-[0px_10px_25px_-5px_rgba(0,0,0,0.1)]"
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
                      floor === 'all' ? 'bg-sand-45 font-semibold text-brand' : 'text-heading hover:bg-black/5'
                    }`}
                  >
                    <span>All floors</span>
                    {floor === 'all' && <Check className="ui-icon size-icon-inline text-brand" aria-hidden="true" />}
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
                        floor === f ? 'bg-sand-45 font-semibold text-brand' : 'text-heading hover:bg-black/5'
                      }`}
                    >
                      <span>Floor {f}</span>
                      {floor === f && <Check className="ui-icon size-icon-inline text-brand" aria-hidden="true" />}
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
            <DataTable
              rows={filteredRooms}
              rowKey={(room) => room.id}
              minWidth={768}
              headCellClass="border-b border-card-border px-4 py-4 text-xs font-semibold tracking-[0.6px] text-table-label uppercase"
              rowClass="border-t border-row-border"
              cellClass="px-4 py-6"
              columns={[
                {
                  key: 'unit',
                  header: 'UNIT NUMBER',
                  cellClass: 'text-sm font-medium text-heading',
                  cell: (room) => room.roomNumber,
                },
                {
                  // ดีไซน์ SSK-177 เอาชื่อผู้เช่ากลับมาใต้ประเภทห้อง เห็นในตารางเดียวว่าห้องไหนใครอยู่
                  key: 'type',
                  header: 'TYPE / TENANT',
                  cellClass: 'text-sm text-table-label',
                  cell: (room) => (
                    <span className="flex flex-col">
                      {roomTypeLabel(room.roomType)}
                      <small className="text-xs text-body-muted">{room.currentLease?.tenantName ?? '—'}</small>
                    </span>
                  ),
                },
                {
                  // ผังมีกี่ชั้นก็ได้แล้ว (SSK-160) ดูชั้นจากเลขห้องเองไม่ได้เสมอไป จึงแยกคอลัมน์ตามดีไซน์ SSK-177
                  key: 'floor',
                  header: 'FLOOR',
                  cellClass: 'text-sm text-table-label',
                  cell: (room) => room.floor,
                },
                {
                  // ค่าเช่าที่สัญญาใหม่เดือนนี้จะได้ (อัตราเฉพาะห้องของ SSK-162 หรือค่าตามประเภทห้อง)
                  // สัญญาที่ใช้อยู่ล็อกค่าเช่าของตัวเองไว้ ดูได้ในแท็บ Rate history
                  key: 'rent',
                  header: 'MONTHLY RENT',
                  cellClass: 'text-sm text-table-label',
                  cell: (room) => bahtAmount(room.baseRent),
                },
                {
                  key: 'status',
                  header: 'STATUS',
                  cell: (room) => <RoomStatusBadge status={room.status} />,
                },
                {
                  key: 'action',
                  header: 'ACTION',
                  cell: (room) => (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingRoomId(room.id)}
                        className="icon-button rounded p-1 text-table-label hover:bg-black/5 cursor-pointer"
                        aria-label={`Set status for unit ${room.roomNumber}`}
                      >
                        <Pencil aria-hidden="true" className="ui-icon size-icon-control" />
                      </button>
                      <Link
                        to={`?view=rates&room=${room.id}`}
                        className="icon-button rounded p-1 text-table-label hover:bg-black/5"
                        aria-label={`View rates for unit ${room.roomNumber}`}
                      >
                        <History aria-hidden="true" className="ui-icon size-icon-control" />
                      </Link>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </div>
      </div>

      {configOpen && <ApartmentConfigDialog onClose={() => setConfigOpen(false)} />}

      {layoutOpen && (
        <BuildingLayoutDialog
          rooms={rooms}
          onClose={() => setLayoutOpen(false)}
          onSaved={() => {
            // ชั้นที่กรองอยู่อาจหายไปจากผังใหม่ กลับไปดูทุกชั้นจะได้ไม่เจอตารางว่างเปล่า
            setFloor('all')
            roomsLoader.reload()
          }}
        />
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


