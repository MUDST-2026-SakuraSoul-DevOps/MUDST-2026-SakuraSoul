import { useId, useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import type { Supply } from '../api/types'
import { SecondaryButton } from './Button'
import type { SupplyUsageDraft } from '../domain/supplyUsage'
import { addUsageLine, removeUsageLine, supplyOptionLabel } from '../domain/supplyUsage'

const CONTROL_CLASS =
  'w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-chip-bg disabled:text-ink-muted'

/**
 * ช่องเบิกของจากคลังเข้าใบแจ้งซ่อม (SSK-154) ใช้ในป็อปอัปสร้างใบทั้งสองที่
 *
 * เลือกของ กรอกจำนวน แล้วกด Add ของจะเข้ารายการข้างล่าง ยังไม่ตัดสต็อกจนกว่าจะบันทึกใบ
 * ลบแถวออกได้ก่อนบันทึก เลือกของชิ้นเดิมซ้ำจะรวมเป็นแถวเดียว กฎทั้งหมดอยู่ที่ domain/supplyUsage.ts
 *
 * เป็น controlled component ฟอร์มที่ใช้ถือ draft ไว้เอง เพราะตอนกดบันทึกฟอร์มต้องรู้ทั้งรายการ
 * และรู้ว่ามีของที่เลือกค้างไว้แต่ยังไม่กด Add หรือเปล่า (pendingUsageError)
 */
export function SupplyUsageField({
  supplies,
  loadError,
  draft,
  onChange,
}: {
  /** null ระหว่างโหลดคลัง */
  supplies: Supply[] | null
  loadError?: string | null
  draft: SupplyUsageDraft
  onChange: (draft: SupplyUsageDraft) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  function update(next: SupplyUsageDraft) {
    setError(null)
    onChange(next)
  }

  function add() {
    const result = addUsageLine(draft, supplies ?? [])
    setError(result.error)
    onChange(result.draft)
  }

  if (loadError) {
    return <p className="text-sm text-alert-600">{loadError}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-ink-muted">Supply Item</span>
          <select
            value={draft.supplyId}
            onChange={(e) => update({ ...draft, supplyId: e.target.value })}
            disabled={supplies === null}
            className={CONTROL_CLASS}
          >
            <option value="">{supplies === null ? 'Loading supplies...' : 'Select a supply...'}</option>
            {(supplies ?? []).map((supply) => (
              // ของที่หมดคลังเลือกไม่ได้ ให้เห็นในรายการว่าหมด แทนที่จะหายไปเฉย ๆ
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
            value={draft.quantity}
            onChange={(e) => update({ ...draft, quantity: e.target.value })}
            // กด Enter ในช่องจำนวนแปลว่า Add ไม่ใช่บันทึกทั้งใบ ซึ่งเป็นสิ่งที่ฟอร์มจะทำถ้าปล่อยไว้
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            aria-invalid={error !== null}
            aria-describedby={error !== null ? errorId : undefined}
            className={CONTROL_CLASS}
          />
        </label>
        <SecondaryButton onClick={add} disabled={supplies === null} className="flex items-center gap-1.5">
          <Plus weight="bold" aria-hidden="true" className="ui-icon size-icon-control" />
          Add
        </SecondaryButton>
      </div>

      {error !== null && (
        <p id={errorId} role="alert" className="text-xs text-alert-600">
          {error}
        </p>
      )}

      {draft.lines.length === 0 ? (
        <p className="text-xs text-body-muted">
          No supplies added. Stock is deducted from the inventory when the ticket is saved.
        </p>
      ) : (
        <ul aria-label="Supplies to withdraw" className="flex flex-col gap-2">
          {draft.lines.map((line) => (
            <li
              key={line.supplyId}
              className="flex items-center justify-between gap-2 rounded-lg border border-card-border bg-page-bg px-3 py-2 text-sm text-ink"
            >
              <span>
                {line.name} × {line.quantity}
              </span>
              <button
                type="button"
                onClick={() => update(removeUsageLine(draft, line.supplyId))}
                aria-label={`Remove ${line.name}`}
                className="icon-button rounded p-1 text-ink-muted hover:bg-black/5 hover:text-ink"
              >
                <X aria-hidden="true" className="ui-icon size-icon-control" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
