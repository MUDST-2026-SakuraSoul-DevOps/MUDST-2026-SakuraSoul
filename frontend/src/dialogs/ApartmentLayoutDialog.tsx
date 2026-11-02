import { useState, type FormEvent } from 'react'
import { Building2, Layers, AlertCircle, Info } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { useApartmentLayout } from '../domain/unitsPhase2'

interface ApartmentLayoutDialogProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: (floors: number, roomsPerFloor: number) => void
}

export function ApartmentLayoutDialog({ isOpen, onClose, onSaved }: ApartmentLayoutDialogProps) {
  const [layout, saveLayout] = useApartmentLayout()
  const [floors, setFloors] = useState<string>(String(layout.floors))
  const [roomsPerFloor, setRoomsPerFloor] = useState<string>(String(layout.roomsPerFloor))
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const parsedFloors = parseInt(floors, 10) || 0
  const parsedRooms = parseInt(roomsPerFloor, 10) || 0
  const totalUnits = parsedFloors * parsedRooms

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (parsedFloors < 1 || parsedFloors > 50) {
      setError('Number of floors must be between 1 and 50.')
      return
    }
    if (parsedRooms < 1 || parsedRooms > 100) {
      setError('Rooms per floor must be between 1 and 100.')
      return
    }

    saveLayout(parsedFloors, parsedRooms)
    onSaved?.(parsedFloors, parsedRooms)
    onClose()
  }

  return (
    <Modal
      title="Apartment settings"
      subtitle="Configure building floors and room distribution"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-ink mb-1">
              Number of floors
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="50"
                required
                aria-label="Number of floors"
                value={floors}
                onChange={(e) => {
                  setError(null)
                  setFloors(e.target.value)
                }}
                className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
              />
              <Layers size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-body-muted pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block font-medium text-ink mb-1">
              Rooms per floor
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="100"
                required
                aria-label="Rooms per floor"
                value={roomsPerFloor}
                onChange={(e) => {
                  setError(null)
                  setRoomsPerFloor(e.target.value)
                }}
                className="w-full rounded-md border border-sand-80 bg-white px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
              />
              <Building2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-body-muted pointer-events-none" />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-rose-600 text-xs flex items-center gap-1" role="alert">
            <AlertCircle size={14} />
            {error}
          </p>
        )}

        {/* Calculation summary banner */}
        <div className="rounded-xl border border-avatar-ring/60 bg-sand-60/50 p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-body-muted font-medium">Calculated capacity:</span>
            <strong className="text-sm font-bold text-brand">
              {totalUnits} Units
            </strong>
          </div>
          <p className="text-[11px] text-body-muted">
            Room numbering scheme: <strong>floor + two-digit room number</strong> (e.g. 101–{parsedRooms > 0 ? `1${String(parsedRooms).padStart(2, '0')}` : '112'})
          </p>
        </div>

        {/* Non-destructive explanation note */}
        <div className="rounded-xl border border-honey-140/60 bg-amber-50/50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            Reducing the layout requires a separate review of occupied rooms and their active leases. Existing rooms and historical financial records are preserved safely.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-sand-80">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit">
            Save layout
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
