import { useId, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { addSupplyToTicket, errorMessage, fetchSupplies } from '../api/client'
import type { MaintenanceTicket, Supply } from '../api/types'
import { PrimaryButton, SecondaryButton } from './Button'
import { useLoader } from '../hooks/useLoader'
import { summarizeSuppliesUsed, supplyOptionLabel, usageError } from '../domain/supplyUsage'

const CONTROL_CLASS =
  'w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-chip-bg disabled:text-ink-muted'

/**
 * ส่วน Supplies Used ในรายละเอียดใบแจ้งซ่อม (SSK-154) ใช้ทั้งแท็บ Maintenance Tasks และ Maintenance Log
 *
 * แสดงของที่ใบนี้ใช้ไปทั้งหมด รวมจำนวนตามชิ้น (summarizeSuppliesUsed) ใบที่ยังไม่ Done มีปุ่ม
 * Add Supply เปิดฟอร์มเบิกเพิ่มทีละรายการ ยิง POST /api/maintenance/{id}/supplies ตรง ๆ
 * สต็อกถูกตัดทันทีที่กด ไม่ได้รอปิดป็อปอัป เพราะ endpoint นี้ไม่มีขั้นยืนยันแยก
 *
 * ใบที่ Done แล้วซ่อนปุ่มไว้ backend ยังรับอยู่ (addSupply ไม่เช็คสถานะ) รอเฉินตัดสินว่าจะกัน
 * ด้วย 409 ไหม ระหว่างนี้หน้าเว็บไม่เปิดทางให้เบิกเข้าใบที่ปิดงานไปแล้ว
 */
export function TicketSupplies({
  ticket,
  onAdded,
}: {
  ticket: MaintenanceTicket
  /** เบิกสำเร็จแล้ว ให้หน้าที่เรียกโหลดใบใหม่ */
  onAdded: () => void
}) {
  const [adding, setAdding] = useState(false)
  const used = summarizeSuppliesUsed(ticket.suppliesUsed)

  return (
    <section aria-label="Supplies Used" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-[0.6px] text-ink-muted uppercase">Supplies Used</p>
        {ticket.status !== 'DONE' && !adding && (
          <SecondaryButton onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5">
            <Plus weight="bold" aria-hidden="true" className="ui-icon size-icon-control" />
            Add Supply
          </SecondaryButton>
        )}
      </div>

      {used.length === 0 ? (
        <p className="text-sm text-ink">No supplies used</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-ink">
          {used.map((usage) => (
            <li key={usage.supplyId}>
              {usage.name} × {usage.quantity}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddSupplyForm
          ticketId={ticket.id}
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            onAdded()
          }}
        />
      )}
    </section>
  )
}

function AddSupplyForm({
  ticketId,
  onCancel,
  onAdded,
}: {
  ticketId: number
  onCancel: () => void
  onAdded: () => void
}) {
  // ฟอร์มนี้ mount ตอนกด Add Supply คลังจึงโหลดตอนเปิดฟอร์ม ไม่ใช่ตอนเปิดรายละเอียด
  // คนที่แค่เปิดดูใบไม่ต้องรอ และยอดคงเหลือที่เห็นสดที่สุด
  const loader = useLoader(fetchSupplies, 'Could not load the supplies')
  const supplies: Supply[] | null = loader.data
  const [supplyId, setSupplyId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const errorId = useId()
  const shownError = error ?? loader.error

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const message = usageError(supplyId, quantity, supplies ?? [])
    if (message !== null) {
      setError(message)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await addSupplyToTicket(ticketId, Number(supplyId), Number(quantity))
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'Could not add the supply'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Add supply to this ticket"
      className="flex flex-col gap-3 rounded-lg border border-card-border bg-page-bg p-3"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-ink-muted">Supply Item</span>
          <select
            value={supplyId}
            onChange={(e) => {
              setSupplyId(e.target.value)
              setError(null)
            }}
            disabled={supplies === null}
            className={CONTROL_CLASS}
          >
            <option value="">{supplies === null ? 'Loading supplies...' : 'Select a supply...'}</option>
            {(supplies ?? []).map((supply) => (
              <option key={supply.id} value={supply.id} disabled={supply.stock === 0}>
                {supplyOptionLabel(supply)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-32 flex-col gap-1 text-sm">
          <span className="font-medium text-ink-muted">Quantity Used</span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value)
              setError(null)
            }}
            aria-invalid={shownError !== null}
            aria-describedby={shownError !== null ? errorId : undefined}
            className={CONTROL_CLASS}
          />
        </label>
      </div>

      {shownError !== null && (
        <p id={errorId} role="alert" className="text-xs text-alert-600">
          {shownError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <SecondaryButton onClick={onCancel} disabled={submitting}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={submitting || supplies === null}>
          {submitting ? 'Saving...' : 'Withdraw'}
        </PrimaryButton>
      </div>
    </form>
  )
}
