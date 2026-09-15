import { useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { NumberField, SelectField, TextField } from '../components/Field'
import type { ApplianceCategory, CatalogItem } from '../domain/appliance'
import { APPLIANCE_CATEGORIES, nextApplianceSku, validateCatalogItem } from '../domain/appliance'

/**
 * ป็อปอัป Add / Edit Appliance ตรงกับเฟรม "Add Appliance" กับ "Edit Appliance"
 * ใน Figma
 *
 * ใช้คอมโพเนนต์เดียวทำทั้งสองโหมดด้วยเหตุผลเดียวกับ MaintenanceTaskDialog คือ
 * ช่องกรอกชุดเดียวกันเป๊ะ ต่างกันแค่หัวเรื่องกับปุ่มยืนยัน
 *
 * SKU เป็นช่องอ่านอย่างเดียว ดีไซน์เขียนว่า "Generated automatically" ระบบจึง
 * ตั้งให้เอง คนใช้แก้ไม่ได้ ป้องกันรหัสซ้ำกันเองโดยไม่มีใครรู้
 */
export function ApplianceDialog({
  mode,
  item,
  existingSkus,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit'
  /** รายการที่กำลังแก้ ใช้เฉพาะโหมด edit */
  item?: CatalogItem
  /** SKU ที่ใช้ไปแล้ว เอาไว้ตั้งรหัสใหม่ไม่ให้ชน */
  existingSkus: string[]
  onClose: () => void
  onSave: (item: CatalogItem) => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<ApplianceCategory>(item?.category ?? 'Kitchen')
  const [monthlyFee, setMonthlyFee] = useState(item?.monthlyFee ?? 0)
  const [deposit, setDeposit] = useState(item?.deposit ?? 0)
  const [owned, setOwned] = useState(item?.owned ?? 1)
  const [lowStockAt, setLowStockAt] = useState(item?.lowStockAt ?? 0)
  const [error, setError] = useState<string | null>(null)

  // โหมดแก้ไขคง SKU เดิมไว้ เพราะใบเช่าที่ออกไปแล้วอ้างรหัสนี้อยู่
  const sku = item?.sku ?? nextApplianceSku(category, existingSkus)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const draft: CatalogItem = {
      id: item?.id ?? 0,
      name: name.trim(),
      sku,
      category,
      monthlyFee,
      deposit,
      owned,
      lowStockAt,
    }
    const message = validateCatalogItem(draft)
    if (message !== null) {
      setError(message)
      return
    }
    onSave(draft)
    onClose()
  }

  return (
    <Modal
      title={mode === 'create' ? 'Add Appliance' : 'Edit Appliance'}
      subtitle={
        mode === 'create'
          ? 'Add an item tenants can rent into their room'
          : 'Update the details of this appliance'
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Appliance name *"
          value={name}
          onChange={setName}
          placeholder="e.g., Refrigerator 5.9 cu.ft"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Category *"
            value={category}
            onChange={(value) => setCategory(value as ApplianceCategory)}
            options={APPLIANCE_CATEGORIES.map((c) => ({ value: c, label: c }))}
            hint={APPLIANCE_CATEGORIES.join(' · ')}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">SKU</span>
            <input
              type="text"
              value={sku}
              readOnly
              className="rounded-lg border border-card-border bg-chip-bg px-3 py-2 text-sm text-ink-muted outline-none"
            />
            <span className="text-xs text-body-muted">Generated automatically</span>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Monthly fee * (¥)"
            value={monthlyFee}
            onChange={setMonthlyFee}
            hint="Charged every billing cycle"
          />
          <NumberField
            label="Deposit * (¥)"
            value={deposit}
            onChange={setDeposit}
            hint="Refunded when returned"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Quantity owned *"
            value={owned}
            onChange={setOwned}
            min={0}
            hint="How many the building owns"
          />
          <NumberField
            label="Low stock alert at"
            value={lowStockAt}
            onChange={setLowStockAt}
            min={0}
            hint='Shows a "Low stock" badge below this'
          />
        </div>

        {/*
          ข้อความนี้มาจากดีไซน์ตรง ๆ และเป็นกฎจริงที่โค้ดทำตาม ใบเช่าเก็บค่าเช่า
          ของตัวเองไว้ตอนสร้าง จึงไม่ขยับตามราคาใหม่ในแคตตาล็อก
        */}
        <p className="rounded-lg border border-[#f0d9d9] bg-[#fdf4f4] px-4 py-3 text-sm text-[#6b4f4f]">
          Changing the monthly fee later only affects new rentals. Rooms already renting this item
          keep the fee agreed at the time.
        </p>

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
            {mode === 'create' && <Plus size={11} weight="bold" />}
            {mode === 'create' ? 'Add Appliance' : 'Save Changes'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
