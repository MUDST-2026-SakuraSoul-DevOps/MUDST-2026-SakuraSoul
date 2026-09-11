import { Modal } from '../components/Modal'
import { Trash2 } from 'lucide-react'
import type { Reminder } from '../domain/maintenanceBoard'

/**
 * ป็อปอัปยืนยันการลบ Recurring Reminder ตาม Ticket SSK-93
 */
export function DeleteReminderDialog({
  reminder,
  onClose,
  onConfirm,
}: {
  reminder: Reminder
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      title="Delete Recurring Reminder"
      subtitle="Confirm deletion of scheduled reminder"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-start gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            aria-label="Delete reminder"
            className="flex items-center gap-2 rounded-lg bg-[#ba1a1a] px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#961313] transition-colors cursor-pointer"
          >
            <Trash2 size={16} />
            Delete Reminder
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-left">
        <div className="flex items-start gap-4 rounded-xl border border-rose-100 bg-rose-50/60 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <Trash2 size={20} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-rose-900">Are you sure you want to delete this reminder?</h4>
            <p className="mt-1 text-xs text-rose-700">
              This action cannot be undone. This recurring schedule will be removed permanently from your maintenance list.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(233,212,191,0.5)] bg-[#faf8f6] p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink">{reminder.name}</span>
            <span className="rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-white border border-[rgba(212,194,195,0.5)] text-ink-muted">
              {reminder.frequency}
            </span>
          </div>
          {reminder.notes && (
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">{reminder.notes}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
