import { useState, type FormEvent } from 'react'
import { createRoomRate, errorMessage } from '../api/client'
import type { RoomRateRequest, RoomSummary } from '../api/types'
import { nextMonth, validateRoomRate } from '../domain/roomRate'
import { Modal } from '../components/Modal'
import { NumberField, SelectField, TextField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { Note } from '../components/Callout'
import { todayInBangkok } from '../format'

/**
 * ตั้งอัตราใหม่ของห้องตั้งแต่เดือนที่เลือก (SSK-162) ตามป็อปอัป "Schedule room rate" ของ SSK-177
 *
 * ต่างจาก preview ตรงที่บันทึกครบทุกอัตรา ไม่ใช่แค่ค่าเช่า เพราะการ์ดต้องการให้แต่ละห้องมีอัตราน้ำไฟ
 * ค่าส่วนกลาง ค่าเน็ต ต่างกันได้ด้วย ค่าที่เติมไว้ให้คืออัตราที่ใช้อยู่ตอนนี้ แก้เฉพาะช่องที่จะเปลี่ยน
 *
 * เลือกเป็นเดือน ไม่ใช่วันที่ เพราะบิลออกทีละเดือน อัตราที่เริ่มกลางเดือนจะไม่รู้ว่าบิลเดือนนั้นควรใช้อันไหน
 */
export function ScheduleRateDialog({
  rooms,
  roomId,
  defaults,
  onClose,
  onSaved,
}: {
  rooms: RoomSummary[]
  roomId: number
  /** อัตราที่ใช้อยู่ตอนนี้ของห้องที่เลือก ไว้เติมฟอร์ม */
  defaults: Omit<RoomRateRequest, 'effectiveFrom' | 'note'>
  onClose: () => void
  onSaved: (roomId: number) => void
}) {
  const [selectedRoom, setSelectedRoom] = useState(roomId)
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonth(todayInBangkok().slice(0, 7)))
  const [monthlyRent, setMonthlyRent] = useState(defaults.monthlyRent)
  const [waterRatePerUnit, setWater] = useState(defaults.waterRatePerUnit)
  const [electricRatePerUnit, setElectric] = useState(defaults.electricRatePerUnit)
  const [commonAreaFee, setCommonArea] = useState(defaults.commonAreaFee)
  const [internetFee, setInternet] = useState(defaults.internetFee)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const draft: RoomRateRequest = {
      effectiveFrom,
      monthlyRent,
      electricRatePerUnit,
      waterRatePerUnit,
      commonAreaFee,
      internetFee,
      note: note.trim() || null,
    }
    const invalid = validateRoomRate(draft)
    if (invalid) {
      setFormError(invalid)
      return
    }
    setSubmitting(true)
    try {
      await createRoomRate(selectedRoom, draft)
      onSaved(selectedRoom)
      onClose()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not schedule the rate'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Schedule room rate" subtitle="Change rates for new contracts without editing past invoices" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Unit"
            value={selectedRoom}
            onChange={(value) => setSelectedRoom(Number(value))}
            options={rooms.map((room) => ({ value: room.id, label: room.roomNumber }))}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">Effective from</span>
            <input
              type="month"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="min-h-11 rounded-lg border border-card-border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <span className="text-xs text-body-muted">The first billing month that uses this rate</span>
          </label>
          <NumberField label="Monthly rent (฿)" value={monthlyRent} onChange={setMonthlyRent} />
          <TextField label="Reason / note" value={note} onChange={setNote} placeholder="e.g. Annual rate adjustment" />
          <NumberField label="Water rate (฿ / m³)" value={waterRatePerUnit} onChange={setWater} step={0.01} />
          <NumberField label="Electricity rate (฿ / kWh)" value={electricRatePerUnit} onChange={setElectric} step={0.01} />
          <NumberField label="Common area fee (฿/month)" value={commonAreaFee} onChange={setCommonArea} />
          <NumberField label="Internet fee (฿/month)" value={internetFee} onChange={setInternet} />
        </div>

        <Note>
          New rates apply to contracts signed from the effective month. Existing contracts keep the rates they were
          signed with, and issued invoices never change.
        </Note>

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
            {submitting ? 'Saving...' : 'Schedule rate'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
