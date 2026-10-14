import { useState } from 'react'
import { Lock } from 'lucide-react'
import { errorMessage, updateReceipt } from '../api/client'
import type { Receipt } from '../api/types'
import { Modal } from '../components/Modal'
import { MonthCalendarPicker } from '../components/MonthCalendarPicker'
import { MeterField } from './CreatePaymentDialog'
import { bahtAmount, todayInBangkok } from '../format'
import { readMeter, roundMoney } from '../domain/billing'

/**
 * แก้ไขใบแจ้งหนี้ผ่าน PUT /api/receipts/{id} (SSK-155)
 *
 * แก้ได้เฉพาะตอนสถานะ PENDING เท่านั้น
 * ฟิลด์ที่แก้ได้มีแค่ หน่วยไฟ, หน่วยน้ำ, และเดือนที่เรียกเก็บ (ห้ามเป็นเดือนในอนาคต)
 * เลขที่ใบเสร็จและอัตราที่ snapshot ไว้ในใบนี้ห้ามเปลี่ยน ยอดคำนวณใหม่ด้วยอัตราเดิมของใบนั้น
 */
export function EditPaymentDialog({
  receipt,
  onClose,
  onUpdated,
}: {
  receipt: Receipt
  onClose: () => void
  onUpdated: (receipt: Receipt) => void
}) {
  const [billingMonth, setBillingMonth] = useState(receipt.billingMonth)
  const currentMonth = todayInBangkok().slice(0, 7)

  const electricItem = receipt.items.find((i) => i.item === 'Electricity')
  const waterItem = receipt.items.find((i) => i.item === 'Water')
  const rentItem = receipt.items.find((i) => i.item === 'Room rent')
  const commonItem = receipt.items.find((i) => i.item === 'Common area fee')
  const internetItem = receipt.items.find((i) => i.item === 'Internet')

  const [electricRaw, setElectricRaw] = useState(String(electricItem?.usageValue ?? 0))
  const [waterRaw, setWaterRaw] = useState(String(waterItem?.usageValue ?? 0))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const electricRate = electricItem?.rate ?? 0
  const waterRate = waterItem?.rate ?? 0
  const rentAmount = rentItem?.amount ?? 0
  const commonAmount = commonItem?.amount ?? 0
  const internetAmount = internetItem?.amount ?? 0

  const electric = readMeter(electricRaw, 'electricity')
  const water = readMeter(waterRaw, 'water')
  const metersValid = electric.error === null && water.error === null

  const previewElectricAmount = metersValid && electric.units !== null ? roundMoney(electric.units * electricRate) : 0
  const previewWaterAmount = metersValid && water.units !== null ? roundMoney(water.units * waterRate) : 0
  const previewTotal = roundMoney(
    rentAmount + commonAmount + internetAmount + previewElectricAmount + previewWaterAmount,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (receipt.status !== 'PENDING') {
      setError('Paid receipts cannot be edited')
      return
    }

    if (!billingMonth.trim()) {
      setError('Please choose the billing month')
      return
    }

    if (billingMonth > currentMonth) {
      setError('The billing month cannot be in the future')
      return
    }

    if (electric.error !== null) {
      setError(electric.error)
      return
    }

    if (water.error !== null) {
      setError(water.error)
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const updated = await updateReceipt(receipt.id, {
        billingMonth,
        electricUnits: electric.units,
        waterUnits: water.units,
      })
      onUpdated(updated)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not update the bill'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Edit Payment"
      subtitle={`Update meter units or billing month for invoice ${receipt.receiptNo}`}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-start gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cancel"
            className="rounded-lg border border-avatar-ring/60 bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            aria-label="Save Changes"
            className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand/90 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 text-left text-sm">
        {error && (
          <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Read-only info: Receipt No, Room, Tenant */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="edit-receipt-no" className="block text-xs font-semibold text-ink">
              Receipt No.
            </label>
            <div className="relative mt-1">
              <input
                id="edit-receipt-no"
                type="text"
                readOnly
                value={receipt.receiptNo}
                className="w-full rounded-md border border-avatar-ring/40 bg-page-bg p-2 pr-8 text-sm font-medium text-ink outline-none"
              />
              <Lock size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sand-530" />
            </div>
            <p className="mt-1 text-[11px] text-body-muted">Locked from original invoice</p>
          </div>

          <div>
            <label htmlFor="edit-room" className="block text-xs font-semibold text-ink">
              Room
            </label>
            <input
              id="edit-room"
              type="text"
              readOnly
              value={`Unit ${receipt.roomNumber}`}
              className="mt-1 w-full rounded-md border border-avatar-ring/40 bg-page-bg p-2 text-sm text-ink outline-none"
            />
          </div>

          <div>
            <label htmlFor="edit-tenant" className="block text-xs font-semibold text-ink">
              Tenant
            </label>
            <input
              id="edit-tenant"
              type="text"
              readOnly
              value={receipt.tenantName}
              className="mt-1 w-full rounded-md border border-avatar-ring/40 bg-page-bg p-2 text-sm text-ink outline-none"
            />
          </div>
        </div>

        {/* Editable: Billing Month (Cannot be in future) */}
        <div>
          <label htmlFor="edit-billing-month" className="block text-xs font-semibold text-ink">
            Billing Month <span className="text-rose-500">*</span>
          </label>
          <MonthCalendarPicker
            id="edit-billing-month"
            value={billingMonth}
            onChange={setBillingMonth}
            maxMonth={currentMonth}
          />
          <p className="mt-1 text-[11px] text-body-muted">Cannot be set to a future month</p>
        </div>

        {/* UTILITIES (Editable meter units, locked rates from snapshot) */}
        <div>
          <h4 className="text-[11px] font-bold tracking-wider text-body-muted uppercase">UTILITIES</h4>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MeterField
              id="edit-electric-usage"
              label="Electric usage"
              value={electricRaw}
              onChange={setElectricRaw}
              reading={electric}
              line={{ rate: electricRate, amount: previewElectricAmount }}
            />
            <MeterField
              id="edit-water-usage"
              label="Water usage"
              value={waterRaw}
              onChange={setWaterRaw}
              reading={water}
              line={{ rate: waterRate, amount: previewWaterAmount }}
            />
          </div>
          <p className="mt-2 text-[11px] text-sand-600">
            Rates are locked from the original receipt snapshot ({electricRate.toFixed(2)}/unit electricity, {waterRate.toFixed(2)}/unit water).
          </p>
        </div>

        {/* BILL PREVIEW */}
        <div className="rounded-xl border border-honey-140/60 bg-page-bg p-4">
          <h4 className="text-[11px] font-bold tracking-wider text-body-muted uppercase">RECALCULATED BILL</h4>
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between text-body-muted">
              <span>Room rent</span>
              <span className="text-ink">{bahtAmount(rentAmount)}</span>
            </div>
            <div className="flex justify-between text-body-muted">
              <span>Common area fee</span>
              <span className="text-ink">{bahtAmount(commonAmount)}</span>
            </div>
            <div className="flex justify-between text-body-muted">
              <span>Internet</span>
              <span className="text-ink">{bahtAmount(internetAmount)}</span>
            </div>
            <div className="flex justify-between text-body-muted">
              <span>Electricity ({metersValid && electric.units !== null ? electric.units : '—'} units)</span>
              <span className="text-ink">{metersValid ? bahtAmount(previewElectricAmount) : '—'}</span>
            </div>
            <div className="flex justify-between text-body-muted">
              <span>Water ({metersValid && water.units !== null ? water.units : '—'} units)</span>
              <span className="text-ink">{metersValid ? bahtAmount(previewWaterAmount) : '—'}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-avatar-ring/40 pt-3 text-sm">
              <span className="font-semibold text-ink">Total</span>
              <span data-testid="edit-bill-total" className="font-heading text-xl font-bold text-brand">
                {metersValid ? bahtAmount(previewTotal) : '—'}
              </span>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}
