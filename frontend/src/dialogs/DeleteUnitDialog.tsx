import { useState } from 'react'
import { deleteRoom, errorMessage } from '../api/client'
import type { RoomSummary } from '../api/types'
import { Modal } from '../components/Modal'
import { roomTypeLabel } from '../domain/room'
import { RoomStatusBadge } from '../components/RoomStatusBadge'

/**
 * ป็อปอัปยืนยันการลบ Unit ตามธีม Sakura Soul (SSK-108)
 */
export function DeleteUnitDialog({
  room,
  onClose,
  onDeleted,
}: {
  room: RoomSummary
  onClose: () => void
  onDeleted: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setSubmitting(true)
    setError(null)
    try {
      await deleteRoom(room.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the unit'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Confirm Delete Unit"
      subtitle={`Floor ${room.floor} · ${roomTypeLabel(room.roomType)}`}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-start gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            aria-label="Confirm Delete"
            className="rounded-lg bg-[#eb5757] px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#dc2626] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Deleting...' : 'Confirm Delete'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cancel"
            className="rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-left">
        <p className="text-sm text-ink">
          Are you sure you want to delete <span className="font-semibold text-ink">Unit {room.roomNumber}</span>?
        </p>

        <div className="flex flex-col gap-2.5 rounded-lg border border-[rgba(238,217,196,0.6)] bg-[#faf8f6] p-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-body-muted">Status:</span>
            <RoomStatusBadge status={room.status} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-body-muted">Current Tenant:</span>
            <span className="font-medium text-ink">{room.currentLease?.tenantName ?? 'None'}</span>
          </div>
        </div>

        <p className="rounded-lg border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-rose-700">
          ⚠️ Deleting this unit will remove it from the apartment directory. This action cannot be undone.
        </p>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
