import { useEffect, useMemo, useRef, useState } from 'react'
import { Building } from '@phosphor-icons/react'
import { Pencil, ChevronDown, Check, SlidersHorizontal, CheckCircle2 } from 'lucide-react'
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
import { ApartmentLayoutDialog } from '../dialogs/ApartmentLayoutDialog'
import { RateHistoryTab } from '../components/RateHistoryTab'
import { ExtraChargesTab } from '../components/ExtraChargesTab'
import { UtilitiesTab } from '../components/UtilitiesTab'
import { useApartmentLayout } from '../domain/unitsPhase2'

export type UnitsTab = 'all' | 'rates' | 'charges' | 'utilities'

function getInitialTab(): UnitsTab {
  if (typeof window === 'undefined') return 'all'
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab')
  if (tab === 'rates') return 'rates'
  if (tab === 'charges') return 'charges'
  if (tab === 'utilities') return 'utilities'
  return 'all'
}

/**
 * ตรงกับเฟรม "Unit Page" ใน Figma (node 125:2229) — ตาราง unit ทั้งหมดพร้อม
 * filter ชั้น/ตึก
 *
 * พร้อมฟังก์ชันการทำงาน Phase 2:
 * - SSK-160: Configurable room / floor count (ApartmentLayoutDialog)
 * - SSK-162: Room rate history (RateHistoryTab)
 * - SSK-165: Room extra charges (ExtraChargesTab)
 * - SSK-166 & SSK-167: CSV water & electricity import & usage graphs (UtilitiesTab)
 */
export default function UnitsPage() {
  const [activeTab, setActiveTab] = useState<UnitsTab>(getInitialTab)
  const [floor, setFloor] = useState<number | 'all'>('all')
  const [floorDropdownOpen, setFloorDropdownOpen] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const [layout] = useApartmentLayout()

  const dropdownRef = useRef<HTMLDivElement>(null)

  function showToast(message: string) {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  function handleTabChange(tab: UnitsTab) {
    setActiveTab(tab)
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href)
      if (tab === 'all') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', tab)
      }
      window.history.replaceState({}, '', url.toString())
    }
  }

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
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-xs font-medium text-white shadow-xl animate-in fade-in slide-in-from-top-2"
        >
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between text-xs text-body-muted gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Sakura Soul</span>
          <span>›</span>
          <span>Units</span>
          <span>›</span>
          <span className="text-ink font-semibold">
            {activeTab === 'all'
              ? 'All units'
              : activeTab === 'rates'
              ? 'Rate history'
              : activeTab === 'charges'
              ? 'Extra charges'
              : 'Water & Electricity'}
          </span>
        </div>
        <span className="text-[11px] font-medium text-body-muted bg-sand-60/60 px-2.5 py-1 rounded-full border border-sand-80/60">
          Building layout: {layout.floors} floors · {layout.roomsPerFloor} rooms/floor ({layout.totalRooms} units)
        </span>
      </div>

      <PageHeader
        title="Unit Management"
        description="Overseeing a specific sub-division or module to ensure efficient operations."
        actions={
          <div className="flex items-center gap-2">
            <SecondaryButton onClick={() => setLayoutOpen(true)}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              Apartment settings
            </SecondaryButton>
            <SecondaryButton onClick={() => setConfigOpen(true)}>Config</SecondaryButton>
          </div>
        }
      />

      {/* Subnavigation Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-white/70 rounded-xl border border-avatar-ring/40 w-fit">
        <button
          type="button"
          onClick={() => handleTabChange('all')}
          aria-label="All units tab"
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'bg-accent-soft text-brand shadow-xs'
              : 'text-body-muted hover:text-ink'
          }`}
        >
          All units
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('rates')}
          aria-label="Rate history tab"
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'rates'
              ? 'bg-accent-soft text-brand shadow-xs'
              : 'text-body-muted hover:text-ink'
          }`}
        >
          Rate history
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('charges')}
          aria-label="Extra charges tab"
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'charges'
              ? 'bg-accent-soft text-brand shadow-xs'
              : 'text-body-muted hover:text-ink'
          }`}
        >
          Extra charges
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('utilities')}
          aria-label="Water & Electricity tab"
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'utilities'
              ? 'bg-accent-soft text-brand shadow-xs'
              : 'text-body-muted hover:text-ink'
          }`}
        >
          Water & Electricity
        </button>
      </div>

      {/* Content based on Active Tab */}
      {activeTab === 'rates' && <RateHistoryTab onNotify={showToast} />}
      {activeTab === 'charges' && <ExtraChargesTab onNotify={showToast} />}
      {activeTab === 'utilities' && <UtilitiesTab onNotify={showToast} />}

      {activeTab === 'all' && (
        <div className="w-full rounded-2xl border border-card-border bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-card-border px-6 pt-6 pb-6">
            <div className="flex items-center gap-2">
              <Building className="ui-icon size-icon-inline text-heading" aria-hidden="true" />
              <h2 className="font-heading text-xl text-heading">All Units</h2>
            </div>
            <div className="flex gap-3">
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
                    className={`ui-icon size-icon-inline text-table-label transition-transform duration-200 ${floorDropdownOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
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
                    key: 'type',
                    header: 'TYPE',
                    cellClass: 'text-sm text-table-label',
                    cell: (room) => roomTypeLabel(room.roomType),
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
                      <button
                        type="button"
                        onClick={() => setEditingRoomId(room.id)}
                        className="icon-button rounded p-1 text-table-label hover:bg-black/5 cursor-pointer"
                        aria-label={`Set status for unit ${room.roomNumber}`}
                      >
                        <Pencil aria-hidden="true" className="ui-icon size-icon-control" />
                      </button>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </div>
      )}

      {configOpen && <ApartmentConfigDialog onClose={() => setConfigOpen(false)} />}

      <ApartmentLayoutDialog
        isOpen={layoutOpen}
        onClose={() => setLayoutOpen(false)}
        onSaved={(f, r) => {
          showToast(`Apartment layout updated: ${f} floors, ${r} rooms/floor (${f * r} units)`)
        }}
      />

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
