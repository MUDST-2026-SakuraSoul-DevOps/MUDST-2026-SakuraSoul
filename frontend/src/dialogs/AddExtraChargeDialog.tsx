import { useState, type FormEvent } from 'react'
import { AlertCircle } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { CustomSelect } from '../components/CustomSelect'
import { ALL_ROOM_NUMBERS } from '../domain/documents'
import { addExtraCharge, type ExtraChargeRecord } from '../domain/unitsPhase2'

interface AddExtraChargeDialogProps {
  isOpen: boolean
  onClose: () => void
  initialRoom?: string
  onAdded?: (charge: ExtraChargeRecord) => void
}

const ROOM_OPTIONS = ALL_ROOM_NUMBERS.map((r) => ({ value: r, label: `Unit ${r}` }))
const CYCLE_OPTIONS = [
  { value: 'Monthly', label: 'Monthly' },
  { value: 'One-time', label: 'One-time' },
]

export function AddExtraChargeDialog({
  isOpen,
  onClose,
  initialRoom = '101',
  onAdded,
}: AddExtraChargeDialogProps) {
  const [room, setRoom] = useState(initialRoom)
  const [cycle, setCycle] = useState<'One-time' | 'Monthly'>('Monthly')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('300')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (!name.trim()) {
      setError('Please enter a charge description.')
      return
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.')
      return
    }

    const created = addExtraCharge({
      roomNumber: room,
      name: name.trim(),
      amount: parsedAmount,
      cycle,
      status: 'Active',
    })

    onAdded?.(created)
    onClose()
  }

  return (
    <Modal
      title="Add extra charge"
      subtitle="Add an optional fee or recurring service line item to a room"
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
            <label className="block font-medium text-ink mb-1">Frequency</label>
            <CustomSelect
              aria-label="Frequency"
              value={cycle}
              onChange={(val) => setCycle(val as 'One-time' | 'Monthly')}
              options={CYCLE_OPTIONS}
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-ink mb-1">Charge description</label>
          <input
            type="text"
            required
            aria-label="Charge description"
            value={name}
            onChange={(e) => {
              setError(null)
              setName(e.target.value)
            }}
            placeholder="e.g. Parking space or Replacement key card"
            className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div>
          <label className="block font-medium text-ink mb-1">Amount (THB)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            aria-label="Amount (THB)"
            value={amount}
            onChange={(e) => {
              setError(null)
              setAmount(e.target.value)
            }}
            placeholder="e.g. 300"
            className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
          />
        </div>

        {error && (
          <p className="text-rose-600 text-xs flex items-center gap-1" role="alert">
            <AlertCircle size={14} />
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-sand-80">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit">
            Add charge
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
