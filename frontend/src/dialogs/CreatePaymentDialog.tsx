import { useState } from 'react'
import { Modal } from '../components/Modal'
import { yenAmount } from '../format'

export interface CreatePaymentFormData {
  room: string
  tenant: string
  billingMonth: string
  dueDate: string
  electricUsage: number
  electricRate: number
  waterUsage: number
  waterRate: number
  roomRent: number
  applianceFee: number
  applianceDetail: string
  repairCharge: number
  repairDetail: string
  status: 'Paid' | 'Pending' | 'Unpaid'
  paidDate?: string
}

const ROOM_OPTIONS = [
  { room: '101', tenant: 'Somchai P. · CT-0042', rent: 45000, appliance: 3000, applianceDetail: 'Refrigerator 5.9 cu.ft', repair: 3500, repairDetail: 'MT-2026-0088 · Toilet replacement' },
  { room: '4A', tenant: 'Yuki Tanaka · CT-0012', rent: 35000, appliance: 0, applianceDetail: '', repair: 0, repairDetail: '' },
  { room: '2B', tenant: 'Kenji Sato · CT-0023', rent: 50000, appliance: 2000, applianceDetail: 'Microwave 20L', repair: 0, repairDetail: '' },
  { room: '8C', tenant: 'Hiroshi Nakamura · CT-0034', rent: 45000, appliance: 4000, applianceDetail: 'Washing Machine 8kg', repair: 1200, repairDetail: 'MT-2026-0091 · Light fixture replacement' },
]

export function CreatePaymentDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (data: CreatePaymentFormData) => void
}) {
  const [selectedRoom, setSelectedRoom] = useState(ROOM_OPTIONS[0].room)
  const roomData = ROOM_OPTIONS.find((r) => r.room === selectedRoom) ?? ROOM_OPTIONS[0]

  const [tenant, setTenant] = useState(roomData.tenant)
  const [billingMonth, setBillingMonth] = useState('October 2026')
  const [dueDate, setDueDate] = useState('5 Nov 2026')

  const [electricUsage, setElectricUsage] = useState<number>(120)
  const electricRate = 50
  const [waterUsage, setWaterUsage] = useState<number>(15)
  const waterRate = 100

  const [roomRent, setRoomRent] = useState<number>(roomData.rent)
  const [applianceFee, setApplianceFee] = useState<number>(roomData.appliance)
  const [repairCharge, setRepairCharge] = useState<number>(roomData.repair)
  const [status, setStatus] = useState<'Unpaid' | 'Paid'>('Unpaid')
  const [paidDate, setPaidDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleRoomChange(newRoom: string) {
    setSelectedRoom(newRoom)
    const match = ROOM_OPTIONS.find((r) => r.room === newRoom)
    if (match) {
      setTenant(match.tenant)
      setRoomRent(match.rent)
      setApplianceFee(match.appliance)
      setRepairCharge(match.repair)
    }
  }

  const electricTotal = Math.max(0, electricUsage || 0) * electricRate
  const waterTotal = Math.max(0, waterUsage || 0) * waterRate
  const billTotal = roomRent + electricTotal + waterTotal + applianceFee + repairCharge

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant.trim()) {
      setError('Please provide tenant information')
      return
    }
    if (!billingMonth.trim()) {
      setError('Please provide billing month')
      return
    }
    if (!dueDate.trim()) {
      setError('Please provide due date')
      return
    }

    setError(null)
    onSubmit({
      room: selectedRoom,
      tenant,
      billingMonth,
      dueDate,
      electricUsage,
      electricRate,
      waterUsage,
      waterRate,
      roomRent,
      applianceFee,
      applianceDetail: roomData.applianceDetail,
      repairCharge,
      repairDetail: roomData.repairDetail,
      status: status === 'Paid' ? 'Paid' : 'Pending',
      paidDate: status === 'Paid' ? (paidDate || 'Today') : undefined,
    })
    onClose()
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
            aria-label="Cancel"
            className="rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            aria-label="Create Bill"
            className="rounded-lg bg-[#5b3a3c] px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#4a2e30] transition-colors cursor-pointer"
          >
            Create Bill
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
            <select
              id="payment-room"
              value={selectedRoom}
              onChange={(e) => handleRoomChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-[rgba(212,194,195,0.6)] bg-white p-2 text-sm text-ink outline-none focus:border-brand"
            >
              {ROOM_OPTIONS.map((opt) => (
                <option key={opt.room} value={opt.room}>
                  {opt.room}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="payment-tenant" className="block text-xs font-semibold text-ink">
              Tenant
            </label>
            <input
              id="payment-tenant"
              type="text"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              className="mt-1 w-full rounded-md border border-[rgba(212,194,195,0.6)] bg-[#f6f3f2] p-2 text-sm text-ink outline-none"
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
              type="text"
              value={billingMonth}
              onChange={(e) => setBillingMonth(e.target.value)}
              placeholder="e.g. October 2026"
              className="mt-1 w-full rounded-md border border-[rgba(212,194,195,0.6)] bg-white p-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="due-date" className="block text-xs font-semibold text-ink">
              Due Date <span className="text-rose-500">*</span>
            </label>
            <input
              id="due-date"
              type="text"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              placeholder="e.g. 5 Nov 2026"
              className="mt-1 w-full rounded-md border border-[rgba(212,194,195,0.6)] bg-white p-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* UTILITIES */}
        <div>
          <h4 className="text-[11px] font-bold tracking-wider text-body-muted uppercase">UTILITIES</h4>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="electric-usage" className="block text-xs font-semibold text-ink">
                Electric usage <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1">
                <input
                  id="electric-usage"
                  type="number"
                  min="0"
                  value={electricUsage || ''}
                  onChange={(e) => setElectricUsage(Number(e.target.value))}
                  className="w-full rounded-md border border-[rgba(212,194,195,0.6)] bg-white p-2 pr-12 text-sm text-ink outline-none focus:border-brand"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-body-muted">
                  units
                </span>
              </div>
              <p className="mt-1 text-[11px] text-body-muted">
                × {electricRate.toFixed(2)} / unit = {yenAmount(electricTotal)}
              </p>
            </div>

            <div>
              <label htmlFor="water-usage" className="block text-xs font-semibold text-ink">
                Water usage <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1">
                <input
                  id="water-usage"
                  type="number"
                  min="0"
                  value={waterUsage || ''}
                  onChange={(e) => setWaterUsage(Number(e.target.value))}
                  className="w-full rounded-md border border-[rgba(212,194,195,0.6)] bg-white p-2 pr-12 text-sm text-ink outline-none focus:border-brand"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-body-muted">
                  units
                </span>
              </div>
              <p className="mt-1 text-[11px] text-body-muted">
                × {waterRate.toFixed(2)} / unit = {yenAmount(waterTotal)}
              </p>
            </div>
          </div>
        </div>

        {/* EXTRA CHARGES */}
        <div>
          <h4 className="text-[11px] font-bold tracking-wider text-body-muted uppercase">EXTRA CHARGES</h4>
          <div className="mt-2 flex flex-col gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink">Appliance fee</label>
              <div className="mt-1 rounded-md border border-[rgba(212,194,195,0.4)] bg-[#f6f3f2] p-2.5 text-xs text-ink">
                {roomData.applianceDetail ? `${roomData.applianceDetail} — ${yenAmount(applianceFee)}` : 'None — ¥0'}
              </div>
              <p className="mt-1 text-[11px] text-body-muted">Pulled from active rentals on this room</p>
            </div>

            <div>
              <label htmlFor="repair-charge" className="block text-xs font-semibold text-ink">
                Repair charge
              </label>
              <select
                id="repair-charge"
                value={repairCharge}
                onChange={(e) => setRepairCharge(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-[rgba(212,194,195,0.6)] bg-white p-2 text-xs text-ink outline-none focus:border-brand"
              >
                {roomData.repair > 0 && (
                  <option value={roomData.repair}>
                    {roomData.repairDetail} — {yenAmount(roomData.repair)}
                  </option>
                )}
                <option value={0}>None — ¥0</option>
              </select>
              <p className="mt-1 text-[11px] text-body-muted">
                Only shows repairs ticked &quot;bill to tenant&quot; and not yet billed
              </p>
            </div>
          </div>
        </div>

        {/* BILL PREVIEW */}
        <div className="rounded-xl border border-[rgba(238,217,196,0.6)] bg-[#faf8f6] p-4">
          <h4 className="text-[11px] font-bold tracking-wider text-body-muted uppercase">BILL PREVIEW</h4>
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between text-body-muted">
              <span>Room rent</span>
              <span className="text-ink">{yenAmount(roomRent)}</span>
            </div>
            <div className="flex justify-between text-body-muted">
              <span>Electricity</span>
              <span className="text-ink">{yenAmount(electricTotal)}</span>
            </div>
            <div className="flex justify-between text-body-muted">
              <span>Water</span>
              <span className="text-ink">{yenAmount(waterTotal)}</span>
            </div>
            {applianceFee > 0 && (
              <div className="flex justify-between text-body-muted">
                <span>Appliance fee</span>
                <span className="text-ink">{yenAmount(applianceFee)}</span>
              </div>
            )}
            {repairCharge > 0 && (
              <div className="flex justify-between text-body-muted">
                <span>Repair charge</span>
                <span className="text-ink">{yenAmount(repairCharge)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-[rgba(212,194,195,0.4)] pt-3 text-sm">
              <span className="font-semibold text-ink">Total</span>
              <span className="font-heading text-xl font-bold text-brand">{yenAmount(billTotal)}</span>
            </div>
          </div>
        </div>

        {/* STATUS & PAID DATE */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="payment-status" className="block text-xs font-semibold text-ink">
              Status
            </label>
            <select
              id="payment-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'Unpaid' | 'Paid')}
              className="mt-1 w-full rounded-md border border-[rgba(212,194,195,0.6)] bg-white p-2 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="Unpaid">Unpaid</option>
              <option value="Paid">Paid</option>
            </select>
          </div>

          <div>
            <label htmlFor="paid-date" className="block text-xs font-semibold text-ink">
              Paid Date
            </label>
            <input
              id="paid-date"
              type="text"
              disabled={status !== 'Paid'}
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              placeholder={status === 'Paid' ? 'e.g. 3 Nov 2026' : 'Available once marked Paid'}
              className={`mt-1 w-full rounded-md border border-[rgba(212,194,195,0.6)] p-2 text-sm text-ink outline-none ${
                status === 'Paid' ? 'bg-white focus:border-brand' : 'bg-[#f6f3f2] cursor-not-allowed text-body-muted'
              }`}
            />
          </div>
        </div>
      </form>
    </Modal>
  )
}
