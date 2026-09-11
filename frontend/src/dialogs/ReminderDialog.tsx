import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { DateField, SelectField, TextAreaField, TextField } from '../components/Field'
import { fetchRooms } from '../api/client'
import { useLoader } from '../hooks/useLoader'
import type { Reminder, ReminderFrequency, TaskPriority } from '../domain/maintenanceBoard'
import { FREQUENCIES, PRIORITIES, validateReminder } from '../domain/maintenanceBoard'

/**
 * ป็อปอัป Add Reminder ตามดีไซน์รอบล่าสุด เปิดจากปุ่ม Add Reminder ที่ท้าย
 * แถบ Recurring ในแท็บ Schedule & Reminder
 *
 * Priority Level ในดีไซน์เป็นปุ่มสี่ปุ่มเรียงกัน ไม่ใช่ dropdown จึงทำเป็น
 * radiogroup แทน select เพราะตัวเลือกทั้งสี่แสดงพร้อมกันอยู่แล้ว การยัดลง
 * dropdown จะทำให้คนใช้คีย์บอร์ดกับ screen reader ได้ประสบการณ์ไม่ตรงกับที่เห็น
 */
export function ReminderDialog({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (reminder: Reminder) => void
}) {
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<ReminderFrequency>('One-time')
  const [startDate, setStartDate] = useState('')
  const [unit, setUnit] = useState('')
  const [time, setTime] = useState('00:00')
  const [priority, setPriority] = useState<TaskPriority>('Low')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  // รายการห้องสำหรับ dropdown Assigned Unit เรียงตามเลขห้องให้หาง่าย
  const roomsLoader = useLoader(fetchRooms, 'Could not load units')
  const units = useMemo(
    () =>
      (roomsLoader.data ?? [])
        .map((room) => room.roomNumber)
        .sort((a, b) => a.localeCompare(b)),
    [roomsLoader.data],
  )

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const draft: Reminder = {
      id: 0,
      name: name.trim(),
      frequency,
      startDate,
      unit: unit.trim(),
      time,
      priority,
      notes: notes.trim(),
      active: true,
    }
    const message = validateReminder(draft)
    if (message !== null) {
      setError(message)
      return
    }
    onSave(draft)
    onClose()
  }

  return (
    <Modal title="Add Reminder" onClose={onClose}>
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
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">Select a unit...</option>
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
                    ? 'border-[#504444] bg-[#504444] text-white'
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
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit">Save Reminder</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
