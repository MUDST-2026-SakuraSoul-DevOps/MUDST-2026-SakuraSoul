import { useMemo, useState, useRef, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { createReceipt, errorMessage, fetchApartmentConfig, fetchLeases, fetchRooms } from '../api/client'
import type { Receipt } from '../api/types'
import { Modal } from '../components/Modal'
import { CustomSelect } from '../components/CustomSelect'
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
  const allRooms = useLoader(fetchRooms, 'Could not load the rooms')
  const activeLeases = useLoader(() => fetchLeases({ status: 'ACTIVE' }), 'Could not load the room contracts')
  const dataReady = apartmentConfig.data !== null && activeLeases.data !== null && allRooms.data !== null

  const isRoomValid = /^\d{3}$/.test(room)
  const lease = isRoomValid ? (activeLeases.data?.find((l) => l.roomNumber === room) ?? null) : null
  const electric = readMeter(electricRaw, 'electricity')
  const water = readMeter(waterRaw, 'water')

  const roomOptions = useMemo(() => {
    const leases = activeLeases.data ?? []
    const rooms = allRooms.data ?? []
    if (rooms.length > 0) {
      return rooms
        .map((r) => {
          const matchedLease = leases.find((l) => l.roomId === r.id || l.roomNumber === r.roomNumber)
          return {
            value: r.roomNumber,
            label: matchedLease
              ? `${r.roomNumber} · ${matchedLease.tenantName}`
              : `${r.roomNumber} · (Vacant)`,
          }
        })
        .sort((a, b) => a.value.localeCompare(b.value))
    }
    return leases
      .map((l) => ({
        value: l.roomNumber,
        label: `${l.roomNumber} · ${l.tenantName}`,
      }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }, [allRooms.data, activeLeases.data])

  const preview =
    lease && apartmentConfig.data
      ? previewBill(lease, apartmentConfig.data, electric.units ?? 0, water.units ?? 0)
      : null
  const metersValid = electric.error === null && water.error === null

  function handleRoomChange(val: string) {
    setRoom(val)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!dataReady) {
      setError(
        apartmentConfig.error ??
          activeLeases.error ??
          allRooms.error ??
          'The contracts and utility rates are still loading. Please try again in a moment.',
      )
      return
    }
    if (!room || !isRoomValid) {
      setError('Please select a room')
      return
    }
    if (!lease) {
      setError(`Room ${room} has no active contract`)
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
            className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand/90 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
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
            <CustomSelect
              id="payment-room"
              value={room}
              onChange={handleRoomChange}
              options={roomOptions}
              placeholder="Select a room..."
              disabled={!dataReady}
            />
            <p className="mt-1 text-[11px] text-body-muted">
              {!dataReady
                ? 'Loading rooms & contracts...'
                : room && !lease
                  ? `Room ${room} has no active contract`
                  : 'Select an occupied room with an active contract'}
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
              value={lease?.tenantName ?? (room && !lease ? 'No active contract' : '')}
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
            <MonthCalendarPicker
              id="billing-month"
              value={billingMonth}
              onChange={setBillingMonth}
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
              className="mt-1 w-full rounded-md border border-avatar-ring/60 bg-white p-2 text-sm text-ink outline-none focus:border-brand"
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
              <p className="text-body-muted">Select a room with an active contract to see the bill.</p>
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

const MONTH_NAMES = [
  { num: '01', name: 'Jan', full: 'January' },
  { num: '02', name: 'Feb', full: 'February' },
  { num: '03', name: 'Mar', full: 'March' },
  { num: '04', name: 'Apr', full: 'April' },
  { num: '05', name: 'May', full: 'May' },
  { num: '06', name: 'Jun', full: 'June' },
  { num: '07', name: 'Jul', full: 'July' },
  { num: '08', name: 'Aug', full: 'August' },
  { num: '09', name: 'Sep', full: 'September' },
  { num: '10', name: 'Oct', full: 'October' },
  { num: '11', name: 'Nov', full: 'November' },
  { num: '12', name: 'Dec', full: 'December' },
]

function MonthCalendarPicker({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (val: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const initialYear = value ? Number(value.slice(0, 4)) : new Date().getFullYear()
  const [viewYear, setViewYear] = useState(initialYear || new Date().getFullYear())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const selectedMonthIndex = value && value.length >= 7 ? Number(value.slice(5, 7)) - 1 : -1
  const selectedLabel =
    selectedMonthIndex >= 0 && selectedMonthIndex < 12
      ? `${MONTH_NAMES[selectedMonthIndex].full} ${value.slice(0, 4)}`
      : 'Select Month from Calendar'

  return (
    <div ref={ref} className="relative mt-1">
      {/* Hidden native input for forms, accessibility, and testing */}
      <input
        id={id}
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-md border border-avatar-ring/60 bg-white p-2 text-sm text-ink outline-none hover:border-brand focus:border-brand cursor-pointer"
      >
        <span className="truncate">{selectedLabel}</span>
        <Calendar size={18} className="text-sand-530 shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-40 mt-1.5 w-64 rounded-xl border border-avatar-ring/60 bg-white p-3 shadow-xl">
          {/* Calendar Header with Year selector */}
          <div className="flex items-center justify-between border-b border-sand-65 pb-2 mb-2">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="flex size-7 items-center justify-center rounded-lg text-sand-530 hover:bg-black/5 hover:text-ink cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-bold text-sm text-ink">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="flex size-7 items-center justify-center rounded-lg text-sand-530 hover:bg-black/5 hover:text-ink cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* 12 Months Grid */}
          <div className="grid grid-cols-3 gap-1.5 text-xs">
            {MONTH_NAMES.map((m) => {
              const monthKey = `${viewYear}-${m.num}`
              const isSelected = value === monthKey
              return (
                <button
                  key={m.num}
                  type="button"
                  onClick={() => {
                    onChange(monthKey)
                    setIsOpen(false)
                  }}
                  className={`rounded-lg py-2 px-1 text-center font-medium transition cursor-pointer ${
                    isSelected
                      ? 'bg-brand font-bold text-white shadow-xs'
                      : 'text-sand-830 hover:bg-page-bg hover:text-brand'
                  }`}
                >
                  {m.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
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
