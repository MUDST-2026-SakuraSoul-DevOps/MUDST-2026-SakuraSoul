import { useState } from 'react'
import { Modal } from '../components/Modal'
import { yenAmount, displayDate } from '../format'
import type { CatalogItem, RentalRequest } from '../domain/appliance'

/**
 * ป็อปอัปยืนยันการลบ Appliance Rental Request (BUG-A2 / SSK-110)
 */
export function DeleteApplianceRequestDialog({
  request,
  catalog,
  onClose,
  onDeleted,
}: {
  request: RentalRequest
  catalog: CatalogItem[]
  onClose: () => void
  onDeleted: (id: number) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const applianceName = catalog.find((c) => c.sku === request.sku)?.name ?? request.sku

  function handleDelete() {
    setSubmitting(true)
    onDeleted(request.id)
    onClose()
  }

  return (
    <Modal
      title="Confirm Delete Rental Request"
      subtitle={`Unit ${request.room} · ${applianceName}`}
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
          Are you sure you want to delete the appliance rental request for{' '}
          <span className="font-semibold text-ink">Unit {request.room}</span> ({applianceName})?
        </p>

        <div className="flex flex-col gap-2 rounded-lg border border-[rgba(238,217,196,0.6)] bg-[#faf8f6] p-4 text-xs">
          <div className="flex justify-between">
            <span className="text-body-muted">Room:</span>
            <span className="font-medium text-ink">Unit {request.room}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-body-muted">Appliance:</span>
            <span className="font-medium text-ink">{applianceName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-body-muted">SKU:</span>
            <span className="font-mono text-ink">{request.sku}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-body-muted">Monthly Fee:</span>
            <span className="font-medium text-ink">{yenAmount(request.monthlyFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-body-muted">Start Date:</span>
            <span className="text-ink">{displayDate(request.startDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-body-muted">Status:</span>
            <span className="font-medium text-ink">{request.status}</span>
          </div>
        </div>

        <p className="rounded-lg border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-rose-700">
          ⚠️ Deleting this request will remove the rental record. This action cannot be undone.
        </p>
      </div>
    </Modal>
  )
}
