import { useState } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { NumberField, TextField } from '../components/Field'
import type { SupplyItem } from '../domain/maintenanceBoard'
import { validateSupplyItem } from '../domain/maintenanceBoard'

/**
 * ป็อปอัป Add / Edit Supply Item ตามดีไซน์รอบล่าสุด
 *
 * ดีไซน์ของสองใบนี้มีช่องกรอกชุดเดียวกัน ต่างกันแค่หัวเรื่องกับข้อความบนปุ่ม
 * จึงใช้คอมโพเนนต์เดียวกันแบบเดียวกับป็อปอัปงานซ่อม
 *
 * ในภาพปุ่มซ้ายสะกดว่า "Cancle" ซึ่งเป็นคำที่พิมพ์ตก โค้ดใช้ "Cancel" ที่ถูกต้อง
 * เพราะปุ่มนี้เป็นข้อความที่ผู้ใช้อ่าน ไม่ใช่ชื่อ layer
 *
 * ดีไซน์ไม่มีช่อง SKU แต่ตาราง Current Inventory โชว์ SKU ใต้ชื่อของทุกแถว
 * ของที่เพิ่มใหม่จึงออกรหัสให้เองจากหมวดหมู่ เพื่อไม่ให้มีแถวที่ SKU ว่าง
 */
export function SupplyItemDialog({
  mode,
  item,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit'
  item?: SupplyItem
  onClose: () => void
  onSave: (item: SupplyItem) => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [stock, setStock] = useState(item?.stock ?? 0)
  const [minStock, setMinStock] = useState(item?.minStock ?? 0)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const draft: SupplyItem = {
      id: item?.id ?? 0,
      name: name.trim(),
      sku: item?.sku ?? '',
      category: category.trim(),
      stock,
      minStock,
    }
    const message = validateSupplyItem(draft)
    if (message !== null) {
      setError(message)
      return
    }
    onSave(draft)
    onClose()
  }

  return (
    <Modal title={mode === 'create' ? 'Add Supply Item' : 'Edit Supply Item'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField label="Item Name" value={name} onChange={setName} />
        <TextField label="Category" value={category} onChange={setCategory} />

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Quantity" value={stock} onChange={setStock} />
          <NumberField label="Min Stock" value={minStock} onChange={setMinStock} />
        </div>

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
          <PrimaryButton type="submit">
            {mode === 'create' ? 'Add Supply' : 'Edit Supply'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
