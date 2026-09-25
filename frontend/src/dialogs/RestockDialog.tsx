import { useState } from 'react'
import { errorMessage } from '../api/client'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { NumberField } from '../components/Field'
import type { SupplyItem } from '../domain/maintenanceBoard'
import { restockHeadroom, validateRestockQuantity } from '../domain/maintenanceBoard'

/**
 * US-17-S2 "กด restock ของอุปกรณ์นั้น แล้วกรอกจำนวนที่เติมเข้าไป"
 *
 * แยกจาก SupplyItemDialog เพราะเป็นคนละการกระทำ ฟอร์มแก้ไขตั้งจำนวนคงเหลือ
 * ใหม่ทั้งก้อน ส่วนฟอร์มนี้บวกเพิ่มจากของเดิม ถ้าใช้ฟอร์มเดียวกันแล้วให้ผู้ใช้
 * พิมพ์จำนวนใหม่เอง ผู้ใช้ต้องคำนวณเองว่าของเดิมบวกของที่เพิ่งรับมาได้เท่าไร
 * ซึ่งเป็นจุดที่พิมพ์ผิดง่าย
 *
 * SSK-23 เติมผ่าน POST /api/supplies/{id}/restock จริง backend ตรวจกฎชุดเดียวกันซ้ำ
 * (ยอดของคนอื่นที่เพิ่งเติมอาจทำให้ชนเพดานแล้ว) error จาก backend จึงขึ้นในป็อปอัปนี้ ไม่ปิดเงียบ ๆ
 */
export function RestockDialog({
  item,
  onClose,
  onRestocked,
}: {
  item: SupplyItem
  onClose: () => void
  onRestocked: (id: number, addedAmount: number) => Promise<void>
}) {
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const headroom = restockHeadroom(item)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const message = validateRestockQuantity(item, amount)
    if (message !== null) {
      setError(message)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onRestocked(item.id, amount)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not restock the item'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Restock ${item.name}`} subtitle={`${item.stock} in stock right now`} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <NumberField label="Amount to add" value={amount} onChange={setAmount} min={1} />

        {/*
          ไม่ได้ส่งเป็น hint ของ NumberField เพราะ Wrapper ห่อ hint ไว้ใน label
          เดียวกับช่อง ชื่อที่โปรแกรมอ่านหน้าจอประกาศจะกลายเป็นประโยคยาวทั้งก้อน
        */}
        <p className="-mt-2 text-xs text-body-muted">
          Maximum stock is {item.maxStock}, so you can add up to {headroom} more
        </p>

        {amount > 0 && (
          <p className="text-sm text-body-muted">
            Stock after restocking will be {item.stock + amount}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <SecondaryButton onClick={onClose} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Restock'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
