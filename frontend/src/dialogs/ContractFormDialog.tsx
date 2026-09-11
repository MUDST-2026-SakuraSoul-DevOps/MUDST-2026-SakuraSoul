import { useState, type FormEvent } from 'react'
import { FileText, X } from 'lucide-react'
import { createLease, errorMessage, updateLease } from '../api/client'
import type { BillingCycle, Lease, LeaseRequest, RoomSummary, Tenant } from '../api/types'
import { findConflictingLease, isBackwardsRange, overlapMessage } from '../domain/lease'
import { todayInBangkok } from '../format'

/**
 * Dialog สร้าง/แก้ไขสัญญาเช่า — ตรงกับ Figma "Create Contract" และ "Edit Contract"
 */
export function ContractFormDialog({
  lease,
  rooms,
  tenants,
  existingLeases,
  onClose,
  onSaved,
}: {
  lease?: Lease
  rooms: RoomSummary[]
  tenants: Tenant[]
  existingLeases: Lease[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = lease !== undefined

  // Units ที่พร้อมให้เลือก (ถ้าสร้างใหม่ เอาเฉพาะห้องว่าง หรือห้องที่กำลังแก้)
  const availableRooms = isEdit
    ? rooms
    : rooms.filter((r) => r.status === 'AVAILABLE' || (lease ? r.id === (lease as Lease).roomId : false))

  const [roomId, setRoomId] = useState<number>(
    lease?.roomId ?? (availableRooms[0]?.id ?? rooms[0]?.id ?? 1),
  )
  const [roomType, setRoomType] = useState<'Single Bedroom' | 'Double Bedroom'>('Single Bedroom')
  const [tenantId, setTenantId] = useState<number>(lease?.tenantId ?? tenants[0]?.id ?? 1)
  const [phone, setPhone] = useState(tenants.find((t) => t.id === (lease?.tenantId ?? 1))?.phone ?? '012-345-6789')
  const [nationalId, setNationalId] = useState(
    tenants.find((t) => t.id === (lease?.tenantId ?? 1))?.nationalId ?? '1-2345-67890-12-3',
  )
  const [lineId, setLineId] = useState(
    tenants.find((t) => t.id === (lease?.tenantId ?? 1))?.fullName.toLowerCase().replace(/\s+/g, '') ?? 'somchai.p',
  )

  const [startDate, setStartDate] = useState(lease?.startDate ?? todayInBangkok())
  const [endDate, setEndDate] = useState(lease?.endDate ?? '')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(lease?.billingCycle ?? 'MONTHLY')
  const [rentAmount, setRentAmount] = useState(lease?.monthlyRent ?? 35000)
  const [securityDeposit, setSecurityDeposit] = useState((lease?.monthlyRent ?? 35000) * 2)
  const [commonAreaFee, setCommonAreaFee] = useState(200)

  const [waterRate, setWaterRate] = useState('Per unit - ¥18.00')
  const [electricRate, setElectricRate] = useState('Per unit - ¥8.00')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleTenantChange(id: number) {
    setTenantId(id)
    const t = tenants.find((item) => item.id === id)
    if (t) {
      setPhone(t.phone || '012-345-6789')
      setNationalId(t.nationalId || '1-2345-67890-12-3')
      setLineId(`@${t.fullName.toLowerCase().replace(/\s+/g, '.')}`)
    }
  }

  function handleRoomChange(id: number) {
    setRoomId(id)
    const r = rooms.find((item) => item.id === id)
    if (r) {
      setRentAmount(r.baseRent || 35000)
      setSecurityDeposit((r.baseRent || 35000) * 2)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const normalizedEnd = endDate === '' ? null : endDate
    if (isBackwardsRange(startDate, normalizedEnd)) {
      setError('End Date must not be earlier than Start Date.')
      return
    }

    const conflict = findConflictingLease(
      existingLeases,
      { roomId, startDate, endDate: normalizedEnd },
      lease?.id,
    )
    if (conflict) {
      setError(overlapMessage(conflict))
      return
    }

    const payload: LeaseRequest = {
      roomId,
      tenantId,
      startDate,
      endDate: normalizedEnd,
      monthlyRent: rentAmount,
      billingCycle,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await updateLease(lease.id, payload)
      } else {
        await createLease(payload)
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, isEdit ? 'Failed to update contract.' : 'Failed to create contract.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit Contract' : 'Create Contract'}
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-white p-7 shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#f0ece6]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[#fce4e4] text-[#7a5457]">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-[#2b2a26]">
                {isEdit ? 'Edit Contract' : 'Create Contract'}
              </h2>
              <p className="text-xs text-[#767065]">Link a tenant to a unit and set the lease terms</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[#767065] hover:bg-black/5 hover:text-[#2b2a26]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form id="contract-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-5 pr-2">
          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Section 1: Unit & Tenant */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="unit-select" className="block text-xs font-semibold text-[#2b2a26]">
                Unit <span className="text-rose-500">*</span>
              </label>
              <select
                id="unit-select"
                value={roomId}
                onChange={(e) => handleRoomChange(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
              >
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber} · Floor {r.floor}
                  </option>
                ))}
              </select>
              <span className="mt-0.5 block text-[11px] text-[#a9a49b]">Only vacant units are listed</span>
            </div>

            <div>
              <label htmlFor="room-type" className="block text-xs font-semibold text-[#2b2a26]">
                Room Type <span className="text-rose-500">*</span>
              </label>
              <select
                id="room-type"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
              >
                <option value="Single Bedroom">Single Bedroom</option>
                <option value="Double Bedroom">Double Bedroom</option>
              </select>
            </div>

            <div>
              <label htmlFor="tenant-select" className="block text-xs font-semibold text-[#2b2a26]">
                Tenant <span className="text-rose-500">*</span>
              </label>
              <select
                id="tenant-select"
                value={tenantId}
                onChange={(e) => handleTenantChange(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
              <span className="mt-0.5 block text-[11px] text-[#a9a49b]">Search by name or phone</span>
            </div>

            <div>
              <label htmlFor="tenant-id" className="block text-xs font-semibold text-[#2b2a26]">
                ID <span className="text-rose-500">*</span>
              </label>
              <input
                id="tenant-id"
                type="text"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
              />
            </div>

            <div>
              <label htmlFor="tenant-phone" className="block text-xs font-semibold text-[#2b2a26]">
                Phone <span className="text-rose-500">*</span>
              </label>
              <input
                id="tenant-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
              />
            </div>

            <div>
              <label htmlFor="tenant-lineid" className="block text-xs font-semibold text-[#2b2a26]">
                Line ID <span className="text-rose-500">*</span>
              </label>
              <input
                id="tenant-lineid"
                type="text"
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
              />
            </div>
          </div>

          {/* Section 2: Lease Period */}
          <div className="mt-6 border-t border-[#f0ece6] pt-4">
            <h3 className="text-[11px] font-bold tracking-[0.8px] text-[#a9a49b] uppercase">Lease Period</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="start-date" className="block text-xs font-semibold text-[#2b2a26]">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block text-xs font-semibold text-[#2b2a26]">
                  End Date <span className="text-rose-500">*</span>
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Lease Terms */}
          <div className="mt-6 border-t border-[#f0ece6] pt-4">
            <h3 className="text-[11px] font-bold tracking-[0.8px] text-[#a9a49b] uppercase">Lease Terms</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="billing-cycle" className="block text-xs font-semibold text-[#2b2a26]">
                  Billing Cycle <span className="text-rose-500">*</span>
                </label>
                <select
                  id="billing-cycle"
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
                  className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              <div>
                <label htmlFor="rent-amount" className="block text-xs font-semibold text-[#2b2a26]">
                  Rent Amount (¥) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="rent-amount"
                  type="number"
                  value={rentAmount}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setRentAmount(val)
                    setSecurityDeposit(val * 2)
                  }}
                  required
                  className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
                />
              </div>

              <div>
                <label htmlFor="security-deposit" className="block text-xs font-semibold text-[#2b2a26]">
                  Security Deposit (¥) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="security-deposit"
                  type="number"
                  value={securityDeposit}
                  onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                  required
                  className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
                />
                <span className="mt-0.5 block text-[11px] text-[#a9a49b]">Printed on the contract as [SECURITY_DEPOSIT]</span>
              </div>

              <div>
                <label htmlFor="common-fee" className="block text-xs font-semibold text-[#2b2a26]">
                  Common Area Fee (¥)
                </label>
                <input
                  id="common-fee"
                  type="number"
                  value={commonAreaFee}
                  onChange={(e) => setCommonAreaFee(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
                />
                <span className="mt-0.5 block text-[11px] text-[#a9a49b]">From Apartment Config</span>
              </div>
            </div>
          </div>

          {/* Section 4: Utilities */}
          <div className="mt-6 border-t border-[#f0ece6] pt-4">
            <h3 className="text-[11px] font-bold tracking-[0.8px] text-[#a9a49b] uppercase">Utilities</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="water-billing" className="block text-xs font-semibold text-[#2b2a26]">
                  Water Billing Type <span className="text-rose-500">*</span>
                </label>
                <select
                  id="water-billing"
                  value={waterRate}
                  onChange={(e) => setWaterRate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
                >
                  <option value="Per unit - ¥18.00">Per unit - ¥18.00</option>
                  <option value="Flat rate - ¥300.00">Flat rate - ¥300.00</option>
                </select>
              </div>

              <div>
                <label htmlFor="electric-billing" className="block text-xs font-semibold text-[#2b2a26]">
                  Electric Billing Type <span className="text-rose-500">*</span>
                </label>
                <select
                  id="electric-billing"
                  value={electricRate}
                  onChange={(e) => setElectricRate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#e7e0d3] bg-white px-3 py-2 text-sm text-[#2b2a26] outline-none focus:border-[#5a3036]"
                >
                  <option value="Per unit - ¥8.00">Per unit - ¥8.00</option>
                  <option value="Flat rate - ¥500.00">Flat rate - ¥500.00</option>
                </select>
              </div>
            </div>
            <span className="mt-1.5 block text-[11px] text-[#a9a49b]">
              Rates default from Apartment Config and are locked into this contract once saved.
            </span>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-5 border-t border-[#f0ece6]">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-[#e7e0d3] bg-white px-5 py-2 text-sm font-medium text-[#767065] hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="contract-form"
            disabled={submitting}
            className="rounded-lg bg-[#5a3036] px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#47262b] focus:outline-none"
          >
            {submitting ? 'Saving...' : isEdit ? 'Confirm' : 'Create Contract'}
          </button>
        </div>
      </div>
    </div>
  )
}
