import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  createReceipt,
  errorMessage,
  fetchApartmentConfig,
  fetchLeases,
  fetchMeterReadings,
  fetchReceipts,
  fetchRooms,
} from '../api/client'
import { RECURRENCE_LABEL, billedChargeIds, dueExtraCharges } from '../domain/extraCharge'
import type { Receipt } from '../api/types'
import { SecondaryButton } from '../components/Button'
import { Modal } from '../components/Modal'
import { MonthCalendarPicker } from '../components/MonthCalendarPicker'
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
  // null = ยังไม่ได้พิมพ์เอง ใช้หน่วยที่นำเข้าจาก CSV ของห้อง/เดือนนั้นแทน (SSK-166) พิมพ์ทับได้
  const [electricRaw, setElectricRaw] = useState<string | null>(null)
  const [waterRaw, setWaterRaw] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const apartmentConfig = useLoader(fetchApartmentConfig, 'Could not load the utility rates')
  const allRooms = useLoader(fetchRooms, 'Could not load the rooms')
  const activeLeases = useLoader(() => fetchLeases({ status: 'ACTIVE' }), 'Could not load the room contracts')
  const dataReady = apartmentConfig.data !== null && activeLeases.data !== null && allRooms.data !== null

  // เลขห้องมีสี่หลักได้แล้วตั้งแต่ตั้งผังได้เกิน 9 ชั้น (SSK-160)
  const isRoomValid = /^\d{3,4}$/.test(room)
  const lease = isRoomValid ? (activeLeases.data?.find((l) => l.roomNumber === room) ?? null) : null
  // บิลเก่าของสัญญานี้ ใช้รู้ว่ารายการครั้งเดียวไหนคิดไปแล้ว (SSK-165) และยังค้างอยู่เท่าไหร่
  const leaseReceipts = useLoader(
    () => (lease ? fetchReceipts({ leaseId: lease.id }) : Promise.resolve([])),
    'Could not load earlier bills',
    [lease?.id],
  )
  // กรองด้วย leaseId เพราะตอนเปลี่ยนห้อง useLoader ยังถือบิลของห้องก่อนไว้จนกว่าบิลของห้องใหม่จะมา
  const leaseBills = lease ? (leaseReceipts.data ?? []).filter((r) => r.leaseId === lease.id) : []
  const extras = lease ? dueExtraCharges(lease.extraCharges, billingMonth, billedChargeIds(leaseBills)) : []
  /*
    ยอดค้างของบิลล่าสุดของสัญญา server ยกไปรวมในบิลใบใหม่พร้อมดอกเบี้ย (SSK-164) ตัวอย่างบิลยังเป็นค่าใช้จ่ายของเดือนนี้
    หน้าเว็บไม่คิดเลขยกยอดกับดอกเบี้ยเอง (กฎอยู่ที่ backend ที่เดียว) แค่เตือนว่ายอดที่ออกจริงจะสูงกว่าตัวอย่าง
  */
  const carriedBalance = leaseBills.find((r) => r.latest === true)?.balanceDue ?? 0
  // ยังไม่ได้เลือกเดือนก็ไม่ถามหน่วยที่นำเข้าเลย ถามโดยไม่ระบุเดือน API ตอบมาทุกเดือน ช่องจะถูกเติมด้วยหน่วยของเดือนอื่น
  const monthReadings = useLoader(
    () => (billingMonth ? fetchMeterReadings(billingMonth) : Promise.resolve([])),
    'Could not load the meter readings',
    [billingMonth],
  )
  // ใช้เฉพาะแถวของเดือนที่เลือกอยู่ ระหว่างเปลี่ยนเดือน useLoader ยังถือแถวของเดือนก่อนไว้จนกว่าเดือนใหม่จะมา
  const reading = lease
    ? monthReadings.data?.find((r) => r.roomId === lease.roomId && r.month === billingMonth)
    : undefined

  /*
    ตัวโหลดที่พังและไม่ได้กำลังลองใหม่ ข้อความของตัวแรกขึ้นในกล่อง alert พร้อมปุ่ม Retry ที่โหลดใหม่เฉพาะตัวที่พัง
    สามตัวหลัก (อัตรา สัญญา ห้อง) พังแล้วฟอร์มใช้ไม่ได้ คำใต้ช่องห้องจึงบอกว่าโหลดห้องไม่ได้
    บิลเก่าของสัญญากับหน่วยที่นำเข้ามีไว้ทำตัวอย่าง คำเตือนยอดยกมา และเติมช่องหน่วยให้ พังแล้วยังออกบิลได้เพราะ server
    คิดยอดเองทั้งหมด แต่ต้องบอก ไม่งั้นคำเตือนกับหน่วยที่ควรเติมให้หายไปเงียบ ๆ
  */
  const coreLoadFailed = [apartmentConfig, activeLeases, allRooms].some(failedToLoad)
  const failedLoaders = [apartmentConfig, activeLeases, allRooms, leaseReceipts, monthReadings].filter(failedToLoad)
  const loadError = failedLoaders[0]?.error ?? null
  const electricText = electricRaw ?? (reading ? String(reading.electricUnits) : '')
  const waterText = waterRaw ?? (reading ? String(reading.waterUnits) : '')
  const electric = readMeter(electricText, 'electricity')
  const water = readMeter(waterText, 'water')

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
      ? previewBill(lease, apartmentConfig.data, electric.units ?? 0, water.units ?? 0, extras)
      : null
  const metersValid = electric.error === null && water.error === null

  function handleRoomChange(val: string) {
    setRoom(val)
    setElectricRaw(null)
    setWaterRaw(null)
  }

  function retryLoading() {
    failedLoaders.forEach((loader) => loader.reload())
  }

  /*
    ไม่ต้องเช็คว่าข้อมูลโหลดครบหรือยัง ทางเดียวที่มาถึงตรงนี้คือปุ่ม Create Bill ซึ่งกดไม่ได้จนกว่าจะโหลดครบ
    ส่วนฟอร์มไม่มีปุ่ม submit และมีหลายช่องที่กัน Enter ไว้ เบราว์เซอร์จึงไม่ส่งฟอร์มเองตอนกด Enter
    (เดิมมีกิ่งที่ขึ้นข้อความ error ของการโหลดตรงนี้ ซึ่งไม่มีทางทำงาน ข้อความนั้นย้ายไปอยู่ในกล่อง alert แล้ว)
  */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

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
    if (billingMonth > todayInBangkok().slice(0, 7)) {
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
        {loadError !== null && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700"
          >
            <span>{loadError}</span>
            <SecondaryButton onClick={retryLoading}>Retry</SecondaryButton>
          </div>
        )}
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
            <RoomCombobox
              id="payment-room"
              value={room}
              onChange={handleRoomChange}
              options={roomOptions}
              placeholder="Select or enter a room..."
              disabled={!dataReady}
            />
            <p className="mt-1 text-xs text-body-muted">
              {coreLoadFailed
                ? 'Could not load rooms & contracts'
                : !dataReady
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
              maxMonth={todayInBangkok().slice(0, 7)}
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
            <p className="mt-1 text-xs text-body-muted">Leave blank for the 5th of the next month</p>
          </div>
        </div>

        {/* UTILITIES */}
        <div>
          <h4 className="text-xs font-bold tracking-wider text-body-muted uppercase">UTILITIES</h4>
          {reading && (
            <p className="mt-1 text-xs text-moss-545">
              Filled from the imported meter reading for this month. You can still change it.
            </p>
          )}
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MeterField
              id="electric-usage"
              label="Electric usage"
              value={electricText}
              onChange={setElectricRaw}
              reading={electric}
              line={preview?.lines[3] ?? null}
            />
            <MeterField
              id="water-usage"
              label="Water usage"
              value={waterText}
              onChange={setWaterRaw}
              reading={water}
              line={preview?.lines[4] ?? null}
            />
          </div>
        </div>

        {/* EXTRA CHARGES */}
        <div>
          <h4 className="text-xs font-bold tracking-wider text-body-muted uppercase">EXTRA CHARGES</h4>
          {/*
            รายการพิเศษของห้องที่ตกลงไว้ในสัญญาและถึงรอบคิดเดือนนี้ (SSK-165) แก้ที่แท็บ Extra charges หน้า Units
            ไม่ให้แก้ในบิลรอบนี้ ยอดในตัวอย่างจะได้ตรงกับใบที่ server ออกจริงเสมอ
          */}
          {extras.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 rounded-md border border-avatar-ring/40 bg-page-bg p-2.5 text-xs">
              {extras.map((extra) => (
                <li key={extra.chargeId} className="flex justify-between text-body-muted">
                  <span>
                    {extra.label} · {RECURRENCE_LABEL[extra.recurrence]}
                  </span>
                  <span className="text-ink">{bahtAmount(extra.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-md border border-avatar-ring/40 bg-page-bg p-2.5 text-xs text-body-muted">
              {lease
                ? 'No extra charges are due on this contract this month. Set them up under Units → Extra charges.'
                : 'Extra charges agreed in the contract appear here once a room is selected.'}
            </p>
          )}
        </div>

        {/* BILL PREVIEW */}
        <div className="rounded-xl border border-honey-140/60 bg-page-bg p-4">
          <h4 className="text-xs font-bold tracking-wider text-body-muted uppercase">BILL PREVIEW</h4>
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            {preview ? (
              // ชื่อบรรทัดซ้ำกันได้ (ค่าใช้จ่ายพิเศษตั้งชื่อเองได้ เช่น Water) และบรรทัดไม่สลับลำดับระหว่างที่ป็อปอัปเปิดอยู่
              // จึงใช้ลำดับเป็น key
              preview.lines.map((line, index) => (
                <div key={index} className="flex justify-between text-body-muted">
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
          {carriedBalance > 0 && (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-700">
              {`Unpaid ${bahtAmount(carriedBalance)} from earlier bills will be carried into this bill, plus any late interest, so the issued total will be higher.`}
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}

/** โหลดไม่ผ่านและไม่ได้กำลังลองใหม่อยู่ ระหว่างลองใหม่ useLoader ยังถือ error เดิมไว้ จึงต้องดู loading ด้วย */
function failedToLoad(loader: { error: string | null; loading: boolean }): boolean {
  return loader.error !== null && !loader.loading
}

export function MeterField({
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
      <p className={`mt-1 text-xs ${showError ? 'text-rose-600 font-medium' : 'text-body-muted'}`}>
        {showError
          ? reading.error
          : line && line.rate !== null
            ? `× ${line.rate.toFixed(2)} / unit${reading.error === null ? ` = ${bahtAmount(line.amount)}` : ''}`
            : 'Rate comes from the room contract'}
      </p>
    </div>
  )
}

function RoomCombobox({
  id,
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select or enter a room...',
}: {
  id?: string
  value: string
  onChange: (val: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
  placeholder?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
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

  return (
    <div ref={ref} className="relative mt-1">
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-md border border-avatar-ring/60 bg-white p-2 pr-14 text-sm text-ink outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Toggle unit options"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className="icon-button absolute right-1 top-1/2 -translate-y-1/2 text-sand-530 hover:text-ink cursor-pointer"
        >
          <ChevronDown className={`ui-icon size-icon-inline transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {isOpen && options.length > 0 && (
        <div
          role="listbox"
          className="absolute top-full left-0 z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-avatar-ring/60 bg-white p-1 shadow-xl text-xs"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-page-bg font-bold text-brand'
                    : 'text-sand-830 hover:bg-page-bg hover:text-brand'
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                {isSelected && <span className="size-2 rounded-full bg-brand" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
