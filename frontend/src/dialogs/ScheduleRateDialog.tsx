import { useState, type FormEvent } from 'react'
import { Calendar, Info, AlertCircle } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { CustomSelect } from '../components/CustomSelect'
import { ALL_ROOM_NUMBERS } from '../domain/documents'
import { addRoomRate, type RoomRateRecord } from '../domain/unitsPhase2'

interface ScheduleRateDialogProps {
  isOpen: boolean
  onClose: () => void
  initialRoom?: string
  onScheduled?: (rate: RoomRateRecord) => void
}

const ROOM_OPTIONS = ALL_ROOM_NUMBERS.map((r) => ({ value: r, label: `Unit ${r}` }))

export function ScheduleRateDialog({
  isOpen,
  onClose,
  initialRoom = '101',
  onScheduled,
}: ScheduleRateDialogProps) {
  const [room, setRoom] = useState(initialRoom)
  const [effectiveDate, setEffectiveDate] = useState('2026-12-01')
  const [rent, setRent] = useState('4800')
  const [waterRate, setWaterRate] = useState('18')
  const [electricityRate, setElectricityRate] = useState('5')
  const [note, setNote] = useState('Annual rate adjustment')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsedRent = parseFloat(rent)
    const parsedWater = parseFloat(waterRate)
    const parsedElec = parseFloat(electricityRate)

    if (isNaN(parsedRent) || parsedRent < 0) {
      setError('Please enter a valid monthly rent.')
      return
    }

    const created = addRoomRate({
      roomNumber: room,
      effectiveDate,
      monthlyRent: parsedRent,
      waterRate: isNaN(parsedWater) ? 18 : parsedWater,
      electricityRate: isNaN(parsedElec) ? 5 : parsedElec,
      note: note.trim() || 'Scheduled rate',
    })

    onScheduled?.(created)
    onClose()
  }

  return (
    <Modal
      title="Schedule room rate"
      subtitle="Change future rates without rewriting historical invoices"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-ink mb-1">Unit</label>
            <CustomSelect
              aria-label="Unit"
              value={room}
              onChange={setRoom}
              options={ROOM_OPTIONS}
            />
          </div>

          <div>
            <label className="block font-medium text-ink mb-1">Effective from</label>
            <div className="relative">
              <input
                type="date"
                required
                aria-label="Effective from"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
              />
              <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-body-muted pointer-events-none" />
            </div>
          </div>
        </div>

        <div>
          <label className="block font-medium text-ink mb-1">Monthly rent (THB)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            aria-label="Monthly rent"
            value={rent}
            onChange={(e) => {
              setError(null)
              setRent(e.target.value)
            }}
            placeholder="e.g. 4800"
            className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div>
          <label className="block font-medium text-ink mb-1">Reason / note</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Annual rate adjustment"
            className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-ink mb-1">Water rate (THB / m³)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={waterRate}
              onChange={(e) => setWaterRate(e.target.value)}
              className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-ink mb-1">Electricity rate (THB / kWh)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={electricityRate}
              onChange={(e) => setElectricityRate(e.target.value)}
              className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-ink mb-1">Reason / Notes</label>
          <input
            type="text"
            aria-label="Reason / Notes"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Annual inflation adjustment"
            className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
          />
        </div>

        {error && (
          <p className="text-rose-600 text-xs flex items-center gap-1" role="alert">
            <AlertCircle size={14} />
            {error}
          </p>
        )}

        <div className="rounded-xl border border-avatar-ring/60 bg-sand-60/50 p-3 text-body-muted flex items-start gap-2">
          <Info size={15} className="text-brand shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            New rates apply automatically to invoices generated on or after the effective date. Issued and historical invoices remain safely unchanged.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-sand-80">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit">
            Schedule rate
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
