import { useMemo, useState } from 'react'
import { Wrench, Prohibit, CheckCircle } from '@phosphor-icons/react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import type { RoomStatus, RoomSummary } from '../api/types'
import type { CreateMaintenanceDraft, RoomAvailability } from '../domain/maintenanceTicket'
import {
  MAINTENANCE_TYPES,
  NOTES_MAX_LENGTH,
  REPEAT_INTERVALS,
  validateCreateMaintenance,
} from '../domain/maintenanceTicket'

/**
 * ป็อปอัป Create Maintenance ตรงกับดีไซน์ที่ทีมส่งมา เปิดจากปุ่ม Maintenance
 * บนแดชบอร์ด
 *
 * ดีไซน์แบ่งเป็นหกส่วนและใส่เลขกำกับไว้ จึงทำตามนั้นตรง ๆ เพราะลำดับสื่อว่า
 * ต้องเลือกห้องก่อนถึงจะกรอกอย่างอื่นได้ ส่วนที่ติดป้าย Optional ปล่อยว่างได้
 * แต่ถ้าติ๊กเปิดแล้วต้องกรอกให้ครบ กฎอยู่ที่ domain/maintenanceTicket.ts
 *
 * ตารางเลือกห้องใช้ข้อมูลห้องจริงที่แดชบอร์ดโหลดมาแล้ว ไม่ยิง API ซ้ำ และ
 * แสดงสีสถานะเดียวกับการ์ดบนแดชบอร์ด คนใช้จะได้ไม่ต้องจำว่าห้องไหนว่าง
 *
 * ยังไม่มี endpoint POST /api/maintenance ตัวป็อปอัปจึงส่งข้อมูลกลับให้หน้า
 * ที่เรียกผ่าน onSave พอมี API ค่อยเปลี่ยนที่หน้าให้ยิงจริง โดยไม่ต้องแตะกฎ
 */

const STATUS_DOT: Record<RoomStatus, string> = {
  AVAILABLE: '#7c9473',
  OCCUPIED: '#c98a4b',
  MAINTENANCE: '#b5533c',
}

export function CreateMaintenanceDialog({
  rooms,
  onClose,
  onSave,
}: {
  rooms: RoomSummary[]
  onClose: () => void
  onSave: (draft: CreateMaintenanceDraft) => void
}) {
  const floors = useMemo(
    () => [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b),
    [rooms],
  )
  const [floor, setFloor] = useState<number | null>(floors[0] ?? null)
  const [roomNumber, setRoomNumber] = useState('')
  const [maintenanceType, setMaintenanceType] = useState('')
  const [availability, setAvailability] = useState<RoomAvailability>('AVAILABLE')
  const [billToTenant, setBillToTenant] = useState(false)
  const [amount, setAmount] = useState(0)
  const [recurring, setRecurring] = useState(false)
  const [nextDate, setNextDate] = useState('')
  const [repeatEvery, setRepeatEvery] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const shownFloor = floor ?? floors[0] ?? null
  const roomsOnFloor = useMemo(
    () =>
      rooms
        .filter((r) => r.floor === shownFloor)
        .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber)),
    [rooms, shownFloor],
  )

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const draft: CreateMaintenanceDraft = {
      roomNumber,
      maintenanceType,
      availability,
      billToTenant,
      amount,
      recurring,
      nextDate,
      repeatEvery,
      notes: notes.trim(),
    }
    const message = validateCreateMaintenance(draft)
    if (message !== null) {
      setError(message)
      return
    }
    onSave(draft)
    onClose()
  }

  return (
    <Modal
      title="Create Maintenance"
      subtitle="Create a maintenance ticket for a unit"
      width="wide"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Section step={1} title="Select Room">
          <div className="flex flex-wrap gap-2">
            {floors.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFloor(f)}
                aria-pressed={shownFloor === f}
                className={`rounded-lg border px-4 py-1.5 text-sm ${
                  shownFloor === f
                    ? 'border-[#e9a8a8] bg-[#fdeeee] text-[#8a4a4a]'
                    : 'border-card-border bg-white text-heading hover:bg-black/5'
                }`}
              >
                Floor {f}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 sm:grid-cols-6">
            {roomsOnFloor.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setRoomNumber(room.roomNumber)}
                aria-pressed={roomNumber === room.roomNumber}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm ${
                  roomNumber === room.roomNumber
                    ? 'border-[#e9a8a8] bg-[#fdeeee] text-[#8a4a4a]'
                    : 'border-card-border bg-white text-heading hover:bg-black/5'
                }`}
              >
                {room.roomNumber}
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_DOT[room.status] }}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 pt-3 text-xs text-body-muted">
            <Legend color={STATUS_DOT.AVAILABLE} label="Available" />
            <Legend color={STATUS_DOT.OCCUPIED} label="Occupied" />
            <Legend color={STATUS_DOT.MAINTENANCE} label="Out of Service" />
            <Legend color="#4a6fd4" label="Maintenance ticket open" />
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section step={2} title="Maintenance Type">
            <label className="flex flex-col gap-1 text-sm">
              <span className="sr-only">Maintenance Type</span>
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#fdeeee]">
                  <Wrench size={16} className="text-[#8a4a4a]" />
                </span>
                <select
                  value={maintenanceType}
                  onChange={(e) => setMaintenanceType(e.target.value)}
                  aria-label="Maintenance Type"
                  className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                >
                  <option value="">Select maintenance type</option>
                  {MAINTENANCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-body-muted">Choose what needs to be fixed.</span>
            </label>
          </Section>

          <Section step={3} title="Room Availability During Maintenance">
            <div role="radiogroup" aria-label="Room Availability During Maintenance" className="grid gap-3 sm:grid-cols-2">
              <AvailabilityChoice
                selected={availability === 'AVAILABLE'}
                onSelect={() => setAvailability('AVAILABLE')}
                icon={<CheckCircle size={18} className="text-[#3e7a4e]" />}
                title="Still Available"
                hint="Room can still be used"
              />
              <AvailabilityChoice
                selected={availability === 'OUT_OF_SERVICE'}
                onSelect={() => setAvailability('OUT_OF_SERVICE')}
                icon={<Prohibit size={18} className="text-[#b5533c]" />}
                title="Out of Service"
                hint="Room cannot be used"
              />
            </div>
            <p className="pt-2 text-xs text-body-muted">
              This will update the room status on the dashboard.
            </p>
          </Section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section step={4} title="Maintenance Cost" optional>
            <p className="text-xs text-body-muted">Record the total cost of this maintenance.</p>
            <div className="flex flex-wrap items-center gap-3 pt-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={billToTenant}
                  onChange={(e) => setBillToTenant(e.target.checked)}
                  className="size-4 accent-[#8a4a4a]"
                />
                Bill this repair to the tenant
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted">Amount</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isNaN(amount) ? '' : amount}
                  onChange={(e) => setAmount(e.target.valueAsNumber)}
                  disabled={!billToTenant}
                  aria-label="Amount"
                  className="w-28 rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-chip-bg disabled:text-ink-muted"
                />
              </label>
            </div>
            <p className="pt-2 text-xs text-body-muted">
              Adds a Repair charge line to this room&apos;s next bill. Only tick for damage caused by
              the tenant — normal wear and tear is not billable.
            </p>
          </Section>

          <Section step={5} title="Schedule" optional>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="size-4 accent-[#8a4a4a]"
              />
              Recurring maintenance
            </label>
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink-muted">Next maintenance date</span>
                <input
                  type="date"
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                  disabled={!recurring}
                  className="rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-chip-bg disabled:text-ink-muted"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink-muted">Repeat every</span>
                <select
                  value={repeatEvery}
                  onChange={(e) => setRepeatEvery(e.target.value)}
                  disabled={!recurring}
                  className="rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-chip-bg disabled:text-ink-muted"
                >
                  <option value="">Select interval</option>
                  {REPEAT_INTERVALS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="pt-2 text-xs text-body-muted">
              Set recurring maintenance and we&apos;ll remind you.
            </p>
          </Section>
        </div>

        <Section step={6} title="Additional Notes" optional>
          <textarea
            rows={4}
            value={notes}
            maxLength={NOTES_MAX_LENGTH}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional details about this maintenance..."
            aria-label="Additional Notes"
            className="w-full resize-y rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <p className="pt-1 text-right text-xs text-body-muted">
            {notes.length} / {NOTES_MAX_LENGTH}
          </p>
        </Section>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit">
            <Wrench size={14} />
            Save Maintenance
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}

/** หัวข้อมีเลขกำกับตามดีไซน์ เลขสื่อลำดับที่ควรกรอก ไม่ใช่แค่ของตกแต่ง */
function Section({
  step,
  title,
  optional,
  children,
}: {
  step: number
  title: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-card-border bg-white p-4">
      <h3 className="flex items-center gap-2 pb-3 text-sm font-semibold text-heading">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-chip-bg text-[11px] font-semibold text-ink-muted">
          {step}
        </span>
        {title}
        {optional && <span className="text-xs font-normal text-body-muted">(Optional)</span>}
      </h3>
      {children}
    </section>
  )
}

function AvailabilityChoice({
  selected,
  onSelect,
  icon,
  title,
  hint,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left ${
        selected ? 'border-[#e9a8a8] bg-[#fdeeee]' : 'border-card-border bg-white hover:bg-black/5'
      }`}
    >
      <span className="pt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-body-muted">{hint}</span>
      </span>
      <span
        className={`mt-1 size-3.5 shrink-0 rounded-full border-2 ${
          selected ? 'border-[#b5533c] bg-[#b5533c]' : 'border-card-border'
        }`}
        aria-hidden="true"
      />
    </button>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  )
}
