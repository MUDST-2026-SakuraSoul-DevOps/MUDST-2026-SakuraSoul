import { useState } from 'react'
import { createReceipt, errorMessage, fetchApartmentConfig, fetchLeases } from '../api/client'
import type { Receipt } from '../api/types'
import { Modal } from '../components/Modal'
import { bahtAmount, todayInBangkok } from '../format'
import { useLoader } from '../hooks/useLoader'
import { previewBill, readMeter } from '../domain/billing'

/**
 * ออกบิลหนึ่งห้องผ่าน POST /api/receipts
 *
 * ผู้เช่า ค่าเช่า และอัตราทั้งหมดมาจากสัญญา active ของห้องนั้น ไม่ได้ให้กรอกเอง เพราะ
 * backend คิดยอดจากสัญญาอย่างเดียว ถ้าให้กรอกได้ preview จะไม่ตรงกับใบที่ออกจริง
 * หน่วยน้ำไฟบังคับกรอกและไม่มีค่าตั้งต้น ตาม docs/api-contract-billing.md
 */
export function CreatePaymentDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (receipt: Receipt) => void
}) {
  const [room, setRoom] = useState('')
  const [billingMonth, setBillingMonth] = useState(todayInBangkok().slice(0, 7))
  const [dueDate, setDueDate] = useState('')
  const [electricRaw, setElectricRaw] = useState('')
  const [waterRaw, setWaterRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const apartmentConfig = useLoader(fetchApartmentConfig, 'Could not load the utility rates')
  const activeLeases = useLoader(() => fetchLeases({ status: 'ACTIVE' }), 'Could not load the room contracts')
  const dataReady = apartmentConfig.data !== null && activeLeases.data !== null

  const isRoomValid = /^\d{3}$/.test(room)
  const lease = isRoomValid ? (activeLeases.data?.find((l) => l.roomNumber === room) ?? null) : null
  const electric = readMeter(electricRaw, 'electricity')
  const water = readMeter(waterRaw, 'water')

  const preview =
    lease && apartmentConfig.data
      ? previewBill(lease, apartmentConfig.data, electric.units ?? 0, water.units ?? 0)
      : null
  const metersValid = electric.error === null && water.error === null

  function handleRoomChange(rawVal: string) {
    setRoom(rawVal.replace(/\D/g, '').slice(0, 3))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!dataReady) {
      setError(
        apartmentConfig.error ??
          activeLeases.error ??
          'The contracts and utility rates are still loading. Please try again in a moment.',
      )
      return
    }
    if (!isRoomValid) {
      setError('*กรอกเลขห้องเป็นตัวเลขสามตัวเลข')
      return
    }
    if (!lease) {
      setError(`Room ${room} has no active contract, so there is no one to bill`)
      return
    }
    if (!billingMonth.trim()) {
      setError('Please choose the billing month')
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
      const receipt = await createReceipt({
        leaseId: lease.id,
        billingMonth,
        electricUnits: electric.units,
        waterUnits: water.units,
        dueDate: dueDate || null,
      })
      onCreated(receipt)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not create the bill'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Create Payment"
      subtitle="Build this month's bill for one room"
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
            disabled={!dataReady || submitting}
            aria-label="Create Bill"
            className="rounded-lg bg-wine-720 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-wine-780 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Create Bill'}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="payment-room" className="block text-xs font-semibold text-ink">
              Room <span className="text-rose-500">*</span>
            </label>
            <input
              id="payment-room"
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={room}
              onChange={(e) => handleRoomChange(e.target.value)}
              placeholder="101"
              className={`mt-1 w-full rounded-md border p-2 text-sm text-ink outline-none ${
                room && !isRoomValid
                  ? 'border-rose-500 bg-rose-50/40 focus:border-rose-600'
                  : 'border-avatar-ring/60 bg-white focus:border-brand'
              }`}
            />
            <p className={`mt-1 text-[11px] ${room && !isRoomValid ? 'text-rose-600 font-medium' : 'text-body-muted'}`}>
              {isRoomValid && dataReady && !lease
                ? `Room ${room} has no active contract`
                : '*กรอกเลขห้องเป็นตัวเลขสามตัวเลข (เช่น 101, 201)'}
            </p>
          </div>

          <div>
            <label htmlFor="payment-tenant" className="block text-xs font-semibold text-ink">
              Tenant
            </label>
            <input
              id="payment-tenant"
              type="text"
              readOnly
              value={lease?.tenantName ?? ''}
              placeholder="From the room's contract"
              className="mt-1 w-full rounded-md border border-avatar-ring/40 bg-page-bg p-2 text-sm text-ink outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="billing-month" className="block text-xs font-semibold text-ink">
              Billing Month <span className="text-rose-500">*</span>
            </label>
            <input
              id="billing-month"
              type="month"
              value={billingMonth}
              onChange={(e) => setBillingMonth(e.target.value)}
              className="mt-1 w-full rounded-md border border-avatar-ring/60 bg-white p-2 text-sm text-ink outline-none focus:border-brand cursor-pointer"
            />
          </div>

          <div>
            <label htmlFor="due-date" className="block text-xs font-semibold text-ink">
              Due Date
            </label>
            <input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-avatar-ring/60 bg-white p-2 text-sm text-ink outline-none focus:border-brand cursor-pointer"
            />
            <p className="mt-1 text-[11px] text-body-muted">Leave blank for the 5th of the next month</p>
          </div>
        </div>

        {/* UTILITIES */}
        <div>
          <h4 className="text-[11px] font-bold tracking-wider text-body-muted uppercase">UTILITIES</h4>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MeterField
              id="electric-usage"
              label="Electric usage"
              value={electricRaw}
              onChange={setElectricRaw}
              reading={electric}
              line={preview?.lines[3] ?? null}
            />
            <MeterField
              id="water-usage"
              label="Water usage"
              value={waterRaw}
              onChange={setWaterRaw}
              reading={water}
              line={preview?.lines[4] ?? null}
            />
          </div>
        </div>

        {/* EXTRA CHARGES */}
        <div>
          <h4 className="text-[11px] font-bold tracking-wider text-body-muted uppercase">EXTRA CHARGES</h4>
          <p className="mt-2 rounded-md border border-avatar-ring/40 bg-page-bg p-2.5 text-xs text-body-muted">
            Appliance fees and repair charges can&apos;t be added to a bill yet. The receipt API does not store
            them, so they are left out of this bill.
          </p>
        </div>

        {/* BILL PREVIEW */}
        <div className="rounded-xl border border-honey-140/60 bg-page-bg p-4">
          <h4 className="text-[11px] font-bold tracking-wider text-body-muted uppercase">BILL PREVIEW</h4>
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            {preview ? (
              preview.lines.map((line) => (
                <div key={line.item} className="flex justify-between text-body-muted">
                  <span>{line.item}</span>
                  <span className="text-ink">
                    {line.usageValue !== null && !metersValid ? '—' : bahtAmount(line.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-body-muted">Enter a room with an active contract to see the bill.</p>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-avatar-ring/40 pt-3 text-sm">
              <span className="font-semibold text-ink">Total</span>
              <span data-testid="bill-total" className="font-heading text-xl font-bold text-brand">
                {preview && metersValid ? bahtAmount(preview.total) : '—'}
              </span>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function MeterField({
  id,
  label,
  value,
  onChange,
  reading,
  line,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  reading: ReturnType<typeof readMeter>
  line: { rate: number | null; amount: number } | null
}) {
  const showError = value !== '' && reading.error !== null
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-ink">
        {label} <span className="text-rose-500">*</span>
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={showError}
          className={`w-full rounded-md border p-2 pr-12 text-sm text-ink outline-none ${
            showError ? 'border-rose-500 bg-rose-50/40' : 'border-avatar-ring/60 bg-white focus:border-brand'
          }`}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-body-muted">
          units
        </span>
      </div>
      <p className={`mt-1 text-[11px] ${showError ? 'text-rose-600 font-medium' : 'text-body-muted'}`}>
        {showError
          ? reading.error
          : line && line.rate !== null
            ? `× ${line.rate.toFixed(2)} / unit${reading.error === null ? ` = ${bahtAmount(line.amount)}` : ''}`
            : 'Rate comes from the room contract'}
      </p>
    </div>
  )
}
