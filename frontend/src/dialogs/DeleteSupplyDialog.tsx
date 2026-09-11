import { Modal } from '../components/Modal'
import { Trash2 } from 'lucide-react'
import type { SupplyItem } from '../domain/maintenanceBoard'

/**
 * ป็อปอัปยืนยันการลบอะไหล่ในคลัง ตาม BUG-M6 ใน SSK-111 ที่ QA ทักว่าตาราง
 * Current Inventory ไม่มีปุ่มลบเลยสักแถว
 *
 * ตามรูปแบบเดียวกับ DeleteReminderDialog (SSK-93) เพราะเป็นการลบรายการเดียว
 * ที่ไม่มี endpoint จริงรองรับ ข้อมูลอยู่ใน state ของหน้าเท่านั้น
 */
export function DeleteSupplyDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: SupplyItem
  onClose: () => void
  onConfirm: () => void
}) {
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
            aria-label="Cancel"
            className="cursor-pointer rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            aria-label="Delete item"
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#ba1a1a] px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#961313]"
          >
            <Trash2 size={16} />
            Delete Item
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

        <div className="rounded-xl border border-[rgba(233,212,191,0.5)] bg-[#faf8f6] p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink">{item.name}</span>
            <span className="rounded border border-[rgba(212,194,195,0.5)] bg-white px-2 py-0.5 text-xs font-bold tracking-wider text-ink-muted uppercase">
              {item.category}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-muted">SKU: {item.sku}</p>
        </div>
      </div>
    </Modal>
  )
}
