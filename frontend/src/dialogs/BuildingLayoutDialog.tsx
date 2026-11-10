import { useState, type FormEvent } from 'react'
import { errorMessage, fetchBuildingConfig, updateBuildingConfig } from '../api/client'
import type { BuildingConfig, RoomSummary, RoomType } from '../api/types'
import {
  MAX_FLOORS,
  MAX_ROOMS_PER_FLOOR,
  planLayoutChange,
  summarizeRoomNumbers,
  validateBuildingLayout,
} from '../domain/buildingLayout'
import { ROOM_TYPE_LABEL } from '../domain/room'
import { useLoader } from '../hooks/useLoader'
import { Modal } from '../components/Modal'
import { NumberField, SelectField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { LoadingState, ErrorState } from '../components/PageState'
import { displayDate } from '../format'

/**
 * ตั้งจำนวนชั้นกับจำนวนห้องต่อชั้น (SSK-160) ตามดีไซน์ Apartment settings ใน SSK-177
 *
 * เปิดจากปุ่ม Apartment settings หน้า Unit Management เป็นการตั้งค่าระดับตึกเหมือนปุ่ม Config แต่แยกป็อปอัป
 * จากอัตราค่าน้ำไฟ เพราะผลต่างกันมาก อัตราใหม่มีผลกับใบเสร็จถัดไป ส่วนอันนี้เพิ่มหรือลบห้องทันที
 *
 * ก่อนกดบันทึกโชว์ให้เห็นว่าจะเพิ่มห้องไหนและลบห้องไหน คิดจากห้องที่มีอยู่จริง แอดมินจะได้ไม่ลดผัง
 * โดยไม่รู้ตัว ห้องที่มีประวัติสัญญาหรืองานซ่อม server ไม่ยอมลบ (409) และไม่เปลี่ยนอะไรเลย
 */
export function BuildingLayoutDialog({
  rooms,
  onClose,
  onSaved,
}: {
  rooms: RoomSummary[]
  onClose: () => void
  onSaved?: () => void
}) {
  const config = useLoader(fetchBuildingConfig, 'Could not load the building layout')

  return (
    <Modal
      title="Apartment Settings"
      subtitle="Configure the number of floors and rooms per floor"
      onClose={onClose}
      footer={config.data ? undefined : <SecondaryButton onClick={onClose}>Close</SecondaryButton>}
    >
      {config.loading && <LoadingState label="Loading building layout..." />}
      {config.error && <ErrorState message={config.error} />}
      {config.data && (
        <LayoutForm
          initial={config.data}
          rooms={rooms}
          onClose={onClose}
          onSaved={() => {
            onSaved?.()
            onClose()
          }}
        />
      )}
    </Modal>
  )
}

const ROOM_TYPE_OPTIONS = (Object.keys(ROOM_TYPE_LABEL) as RoomType[]).map((type) => ({
  value: type,
  label: ROOM_TYPE_LABEL[type],
}))

function LayoutForm({
  initial,
  rooms,
  onClose,
  onSaved,
}: {
  initial: BuildingConfig
  rooms: RoomSummary[]
  onClose: () => void
  onSaved: () => void
}) {
  const [floors, setFloors] = useState(initial.floors)
  const [roomsPerFloor, setRoomsPerFloor] = useState(initial.roomsPerFloor)
  const [newRoomType, setNewRoomType] = useState<RoomType>('SINGLE')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const invalid = validateBuildingLayout({ floors, roomsPerFloor, newRoomType })
  const plan = invalid ? null : planLayoutChange(rooms, floors, roomsPerFloor)
  // ห้องที่มีสัญญาอยู่ตอนนี้ลบไม่ได้แน่ ๆ เตือนก่อนกด ส่วนประวัติอื่น (สัญญาที่ปิดแล้ว งานซ่อม) server ตัดสิน
  const occupied = plan?.remove.filter((room) => room.currentLease !== null) ?? []

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (invalid) {
      setFormError(invalid)
      return
    }
    setSubmitting(true)
    try {
      await updateBuildingConfig({ floors, roomsPerFloor, newRoomType })
      onSaved()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not save the building layout'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // noValidate เหตุผลเดียวกับ ApartmentConfigDialog ข้อความเตือนมาจาก validateBuildingLayout ที่เดียว
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Number of floors"
          value={floors}
          onChange={setFloors}
          min={1}
          hint={`1 to ${MAX_FLOORS}`}
        />
        <NumberField
          label="Rooms per floor"
          value={roomsPerFloor}
          onChange={setRoomsPerFloor}
          min={1}
          hint={`1 to ${MAX_ROOMS_PER_FLOOR}`}
        />
        <SelectField
          label="Room type for new units"
          value={newRoomType}
          onChange={(value) => setNewRoomType(value as RoomType)}
          options={ROOM_TYPE_OPTIONS}
          hint="Existing units keep their type"
        />
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-card-border bg-chip-bg px-4 py-3 text-sm">
        <p className="font-semibold text-heading" data-testid="layout-total">
          {invalid ? '-' : `${floors * roomsPerFloor} units`}
        </p>
        <p className="text-body-muted">Room numbers: floor + two-digit room number (e.g. 101, 312)</p>
        {plan && plan.add.length === 0 && plan.remove.length === 0 && (
          <p className="text-body-muted">No units will change.</p>
        )}
        {plan && plan.add.length > 0 && (
          <p className="text-moss-545">
            Adds {plan.add.length} {plan.add.length === 1 ? 'unit' : 'units'}:{' '}
            {summarizeRoomNumbers(plan.add.map((room) => room.roomNumber))}
          </p>
        )}
        {plan && plan.remove.length > 0 && (
          <p className="text-rose-700">
            Removes {plan.remove.length} {plan.remove.length === 1 ? 'unit' : 'units'}:{' '}
            {summarizeRoomNumbers(plan.remove.map((room) => room.roomNumber))}
          </p>
        )}
      </div>

      {occupied.length > 0 && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {summarizeRoomNumbers(occupied.map((room) => room.roomNumber))}{' '}
          {occupied.length === 1 ? 'has' : 'have'} an active lease, so this layout will be rejected.
        </p>
      )}

      <p className="rounded-lg border border-honey-140/60 bg-page-bg px-4 py-3 text-sm text-body-muted">
        Units with a lease or maintenance history are never removed. Existing contracts keep the unit
        number, floor and type they were signed with.
      </p>

      <p className="text-xs text-body-muted">Last updated {displayDate(initial.updatedAt)}</p>

      {formError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <SecondaryButton onClick={onClose} disabled={submitting}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save Layout'}
        </PrimaryButton>
      </div>
    </form>
  )
}
