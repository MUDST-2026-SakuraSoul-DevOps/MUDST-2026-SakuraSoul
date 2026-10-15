import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { DateField, SelectField, TextAreaField, TextField } from '../components/Field'
import { errorMessage, fetchRooms } from '../api/client'
import { useLoader } from '../hooks/useLoader'
import type { Reminder, ReminderFrequency, ReminderView, TaskPriority } from '../domain/maintenanceBoard'
import { DEFAULT_REMIND_TIME, FREQUENCIES, PRIORITIES, validateReminder } from '../domain/maintenanceBoard'

/** ค่าของตัวเลือก All units ใน dropdown แยกจาก '' ที่แปลว่ายังไม่ได้เลือกห้อง */
const ALL_UNITS = 'all-units'

/**
 * ป็อปอัป Add Reminder ตามดีไซน์รอบล่าสุด เปิดจากปุ่ม Add Reminder ที่ท้าย
 * แถบ Recurring ในแท็บ Schedule & Reminder
 *
 * Priority Level ในดีไซน์เป็นปุ่มสี่ปุ่มเรียงกัน ไม่ใช่ dropdown จึงทำเป็น
 * radiogroup แทน select เพราะตัวเลือกทั้งสี่แสดงพร้อมกันอยู่แล้ว การยัดลง
 * dropdown จะทำให้คนใช้คีย์บอร์ดกับ screen reader ได้ประสบการณ์ไม่ตรงกับที่เห็น
 *
 * SSK-20 ใช้ทั้งตอนเพิ่มและตอนแก้ (Edit จากเมนู ⋮ บนการ์ด) บันทึกผ่าน API จริง onSave จึงเป็น async
 * ถ้า backend ตอบ error ป็อปอัปไม่ปิดและข้อมูลที่กรอกไว้ไม่หาย ช่อง Assigned Unit มีตัวเลือก All units
 * สำหรับงานของทั้งตึก ซึ่งขึ้นในรายการกับปฏิทินแต่ไม่สร้างใบแจ้งซ่อม ฟอร์มบอกเรื่องนี้ใต้ช่องเลย
 * แอดมินจะได้ไม่รอใบแจ้งซ่อมที่ไม่มีวันมา
 */
export function ReminderDialog({
  mode = 'create',
  reminder,
  onClose,
  onSave,
}: {
  mode?: 'create' | 'edit'
  reminder?: ReminderView
  onClose: () => void
  onSave: (draft: Reminder, roomId: number | null) => Promise<void>
}) {
  const [name, setName] = useState(reminder?.name ?? '')
  const [frequency, setFrequency] = useState<ReminderFrequency>(reminder?.frequency ?? 'One-time')
  const [startDate, setStartDate] = useState(reminder?.startDate ?? '')
  // null คือ All units ส่วน '' คือยังไม่ได้เลือก
  const [unit, setUnit] = useState<string | null>(reminder ? reminder.unit : '')
  const [time, setTime] = useState(reminder?.time ?? DEFAULT_REMIND_TIME)
  const [priority, setPriority] = useState<TaskPriority>(reminder?.priority ?? 'Low')
  const [notes, setNotes] = useState(reminder?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // รายการห้องสำหรับ dropdown Assigned Unit เรียงตามเลขห้องให้หาง่าย
  const roomsLoader = useLoader(fetchRooms, 'Could not load units')
  const units = useMemo(() => {
    const numbers = (roomsLoader.data ?? []).map((room) => room.roomNumber)
    // ตอนแก้ ห้องเดิมต้องค้างอยู่ในช่องได้แม้รายการห้องยังโหลดไม่เสร็จ
    if (reminder?.unit && !numbers.includes(reminder.unit)) {
      numbers.push(reminder.unit)
    }
    return numbers.sort((a, b) => a.localeCompare(b))
  }, [roomsLoader.data, reminder])

  /** ห้องเดิมตอนแก้ใช้ roomId เดิมได้เลย ห้องที่เลือกใหม่หาจากรายการห้องจริง (แบบเดียวกับฟอร์มงานซ่อม) */
  function roomIdOf(roomNumber: string): number | null {
    if (reminder && roomNumber === reminder.unit) {
      return reminder.roomId
    }
    return roomsLoader.data?.find((room) => room.roomNumber === roomNumber)?.id ?? null
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const draft: Reminder = {
      id: reminder?.id ?? 0,
      name: name.trim(),
      frequency,
      startDate,
      unit: unit === null ? null : unit.trim(),
      time,
      priority,
      notes: notes.trim(),
      active: reminder?.active ?? true,
    }
    const message = validateReminder(draft)
    if (message !== null) {
      setError(message)
      return
    }
    const roomId = draft.unit === null ? null : roomIdOf(draft.unit)
    if (draft.unit !== null && roomId === null) {
      setError('The unit list is still loading. Please try again in a moment.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSave(draft, roomId)
      onClose()
    } catch (err) {
      setError(errorMessage(err, mode === 'create' ? 'Could not save the reminder' : 'Could not save the changes'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={mode === 'create' ? 'Add Reminder' : 'Edit Reminder'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Reminder Name"
          value={name}
          onChange={setName}
          placeholder="e.g., AC Filter Cleaning"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Frequency"
            value={frequency}
            onChange={(value) => setFrequency(value as ReminderFrequency)}
            options={FREQUENCIES.map((f) => ({ value: f, label: f }))}
          />
          <DateField label="Start Date" value={startDate} onChange={setStartDate} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/*
            เดิมเป็นช่องพิมพ์อิสระ ทั้งที่ placeholder เขียนว่า "Select a unit..."
            พิมพ์อะไรลงไปก็บันทึกผ่าน ได้ reminder ผูกกับห้องที่ไม่มีจริง (SSK-92)
            เปลี่ยนเป็น dropdown ที่ดึงห้องจากระบบจริง คนใช้จึงเลือกได้เฉพาะห้อง
            ที่มีอยู่ ตรงกับที่ placeholder เดิมสัญญาไว้ตั้งแต่แรก
          */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">Assigned Unit</span>
            <select
              value={unit === null ? ALL_UNITS : unit}
              onChange={(e) => setUnit(e.target.value === ALL_UNITS ? null : e.target.value)}
              className="rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">Select a unit...</option>
              <option value={ALL_UNITS}>All units (building-wide)</option>
              {units.map((roomNumber) => (
                <option key={roomNumber} value={roomNumber}>
                  {roomNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>
        </div>

        {/* ไม่ได้ใส่ไว้ใน label ของช่อง ชื่อที่โปรแกรมอ่านหน้าจออ่านจะได้ไม่กลายเป็นประโยคยาวทั้งก้อน */}
        {unit === null && (
          <p className="-mt-2 text-xs text-body-muted">
            Building-wide reminders show in the list and calendar but do not create maintenance tickets.
          </p>
        )}

        <div role="radiogroup" aria-label="Priority Level" className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-muted">Priority Level</span>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={priority === level}
                onClick={() => setPriority(level)}
                className={`rounded-md border px-4 py-1.5 text-sm ${
                  priority === level
                    ? 'border-body-muted bg-body-muted text-white'
                    : 'border-card-border bg-white text-heading hover:bg-black/5'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <TextAreaField
          label="Notes/Details"
          value={notes}
          onChange={setNotes}
          rows={3}
          placeholder="Add any specific instructions..."
        />

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <SecondaryButton onClick={onClose} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : mode === 'create' ? 'Save Reminder' : 'Save Changes'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
