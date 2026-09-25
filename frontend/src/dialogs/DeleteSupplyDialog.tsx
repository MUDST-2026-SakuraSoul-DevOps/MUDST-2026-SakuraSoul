import { useState } from 'react'
import { Modal } from '../components/Modal'
import { Trash2 } from 'lucide-react'
import { deleteSupply, errorMessage } from '../api/client'
import type { SupplyItem } from '../domain/maintenanceBoard'

/**
 * ป็อปอัปยืนยันการลบอะไหล่ในคลัง ตาม BUG-M6 ใน SSK-111 ที่ QA ทักว่าตาราง
 * Current Inventory ไม่มีปุ่มลบเลยสักแถว
 *
 * ตั้งแต่ SSK-23 ลบผ่าน DELETE /api/supplies/{id} จริง และเรียก API เองแบบเดียวกับ
 * DeleteMaintenanceTaskDialog ลบได้เฉพาะของที่ยังไม่เคยถูกเบิกในใบแจ้งซ่อม ของที่เคยถูกเบิกแล้ว
 * backend ตอบ 409 พร้อมทางออก (ตั้งจำนวนเป็นศูนย์แทน) ป็อปอัปจึงค้างไว้แล้วโชว์ข้อความนั้นตรง ๆ
 * ไม่ปิดเงียบ ๆ จนผู้ใช้เข้าใจว่าลบไปแล้ว
 */
export function DeleteSupplyDialog({
  item,
  onClose,
  onDeleted,
}: {
  item: SupplyItem
  onClose: () => void
  onDeleted: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setSubmitting(true)
    setError(null)
    try {
      await deleteSupply(item.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the item'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Delete Supply Item"
      subtitle="Confirm deletion of this inventory item"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-start gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cancel"
            className="cursor-pointer rounded-lg border border-avatar-ring/60 bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            aria-label="Delete item"
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-alert-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-wine-680 disabled:opacity-50"
          >
            <Trash2 size={16} />
            {submitting ? 'Deleting...' : 'Delete Item'}
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
            <h4 className="text-sm font-semibold text-rose-900">
              Are you sure you want to delete this item?
            </h4>
            <p className="mt-1 text-xs text-rose-700">
              This action cannot be undone. This item will be removed permanently from the
              inventory list.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-honey-140/50 bg-page-bg p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink">{item.name}</span>
            <span className="rounded border border-avatar-ring/50 bg-white px-2 py-0.5 text-xs font-bold tracking-wider text-ink-muted uppercase">
              {item.category}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-muted">SKU: {item.sku}</p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
