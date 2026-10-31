import { useState, type FormEvent } from 'react'
import { createExtraCharge, errorMessage } from '../api/client'
import type { ChargeRecurrence, RoomExtraChargeRequest, RoomSummary } from '../api/types'
import { RECURRENCE_LABEL, validateExtraCharge } from '../domain/extraCharge'
import { nextMonth } from '../domain/roomRate'
import { Modal } from '../components/Modal'
import { NumberField, SelectField, TextField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { Note } from '../components/Callout'
import { todayInBangkok } from '../format'

const MONTH_INPUT =
  'min-h-11 rounded-lg border border-card-border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand'

/**
 * เพิ่มค่าใช้จ่ายพิเศษของห้อง (SSK-165) ตามป็อปอัป "Add extra charge" ของ SSK-177
 * เพิ่มช่องเดือนแรกและเดือนสุดท้ายเพราะการ์ดต้องการช่วงเดือน ซึ่ง preview ไม่ได้วาดไว้
 */
export function ExtraChargeDialog({
  rooms,
  roomId,
  onClose,
  onSaved,
}: {
  rooms: RoomSummary[]
  roomId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [selectedRoom, setSelectedRoom] = useState(roomId)
  const [recurrence, setRecurrence] = useState<ChargeRecurrence>('MONTHLY')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState(500)
  const [startMonth, setStartMonth] = useState(nextMonth(todayInBangkok().slice(0, 7)))
  const [endMonth, setEndMonth] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const draft: RoomExtraChargeRequest = {
      label: label.trim(),
      amount,
      recurrence,
      startMonth,
      endMonth: recurrence === 'MONTHLY' && endMonth ? endMonth : null,
      active: true,
    }
    const invalid = validateExtraCharge(draft)
    if (invalid) {
      setFormError(invalid)
      return
    }
    setSubmitting(true)
    try {
      await createExtraCharge(selectedRoom, draft)
      onSaved()
      onClose()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not add the charge'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Add extra charge" subtitle="Add an optional line item to a room's bills" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Unit"
            value={selectedRoom}
            onChange={(value) => setSelectedRoom(Number(value))}
            options={rooms.map((room) => ({ value: room.id, label: room.roomNumber }))}
          />
          <SelectField
            label="Frequency"
            value={recurrence}
            onChange={(value) => setRecurrence(value as ChargeRecurrence)}
            options={(Object.keys(RECURRENCE_LABEL) as ChargeRecurrence[]).map((value) => ({
              value,
              label: RECURRENCE_LABEL[value],
            }))}
          />
          <TextField label="Charge description" value={label} onChange={setLabel} placeholder="e.g. Parking space" />
          <NumberField label="Amount (฿)" value={amount} onChange={setAmount} step={0.01} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">First month</span>
            <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={MONTH_INPUT} />
          </label>
          {recurrence === 'MONTHLY' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink-muted">Last month (optional)</span>
              <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} className={MONTH_INPUT} />
            </label>
          )}
        </div>

        <Note>
          Charges appear as separate invoice lines on contracts signed from now on. A contract that is already running
          is not charged until it is renewed. A one-time charge is billed once, on the first bill from its month.
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
            {submitting ? 'Saving...' : 'Add charge'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
