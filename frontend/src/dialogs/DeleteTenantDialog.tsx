import { useState } from 'react'
import { deleteTenant, errorMessage } from '../api/client'
import type { Tenant } from '../api/types'
import { Modal } from '../components/Modal'

/**
 * ป็อปอัปยืนยันการลบข้อมูลผู้เช่า ตรงกับเฟรม "Confirm Delete Tenant Information" ใน Figma
 */
export function DeleteTenantDialog({
  tenant,
  onClose,
  onDeleted,
}: {
  tenant: Tenant
  onClose: () => void
  onDeleted: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setSubmitting(true)
    setError(null)
    try {
      await deleteTenant(tenant.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'ลบข้อมูลผู้เช่าไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Confirm Delete Tenant Information"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-start gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="rounded-lg bg-[#eb5757] px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#dc2626] disabled:opacity-50"
          >
            {submitting ? 'Deleting...' : 'Confirm Delete'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg bg-[#f3f4f6] px-5 py-2 text-sm font-medium text-ink hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-left">
        <p className="text-sm text-ink-muted">
          Are you sure you want to delete <span className="font-medium text-ink">{tenant.fullName}</span> Information?
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
