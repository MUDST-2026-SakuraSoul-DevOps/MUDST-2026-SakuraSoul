import { useState, type FormEvent } from 'react'
import { Wrench, X } from 'lucide-react'
import { createLease, errorMessage, fetchRoomMaintenance, terminateLease, updateRoomStatus } from '../api/client'
import type { Lease, LeaseRequest, MaintenanceTicket, RoomSummary, Tenant } from '../api/types'
import { useLoader } from '../hooks/useLoader'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'
import { englishDate, formatCurrency, todayInBangkok, thaiDate } from '../format'
import { findConflictingLease, isBackwardsRange, overlapMessage } from '../domain/lease'

/**
 * Dashboard Room Dialog — ตรงกับ Figma เฟรม "Dashboard Popup - Check Out" & "Dashboard Popup - Check In"
 * และ "Confirm checkout" & "Confirm checkin"
 */

const MAINTENANCE_LABEL: Record<MaintenanceTicket['status'], string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}

export function RoomDialog({
  room,
  tenants,
  leases,
  onClose,
  onChanged,
}: {
  room: RoomSummary
  tenants: Tenant[]
  leases: Lease[]
  onClose: () => void
  onChanged: () => void
}) {
  const currentLease =
    room.currentLease === null ? null : (leases.find((l) => l.id === room.currentLease?.id) ?? null)

  if (room.status === 'AVAILABLE') {
    return (
      <AvailableRoomDialog
        room={room}
        tenants={tenants}
        existingLeases={leases}
        onClose={onClose}
        onChanged={onChanged}
      />
    )
  }

  if (room.status === 'MAINTENANCE') {
    return <MaintenanceRoomDialog room={room} onClose={onClose} onChanged={onChanged} />
  }

  return (
    <OccupiedRoomDialog
      room={room}
      currentLease={currentLease}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 1. Occupied Room Flow (Check Out)
 * ══════════════════════════════════════════════════════════════════
 */
function OccupiedRoomDialog({
  room,
  currentLease,
  onClose,
  onChanged,
}: {
  room: RoomSummary
  currentLease: Lease | null
  onClose: () => void
  onChanged: () => void
}) {
  const [activeTab, setActiveTab] = useState<'tenant' | 'lease'>('tenant')
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!currentLease) {
    return (
      <BaseModal title={`Room ${room.roomNumber}`} onClose={onClose}>
        <ErrorState message="Room status is occupied but no active lease found." />
      </BaseModal>
    )
  }

  async function handleCheckOut() {
    if (!currentLease) return
    setSubmitting(true)
    setError(null)
    try {
      await terminateLease(currentLease.id, todayInBangkok())
      onChanged()
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Check out failed. Please try again.'))
      setSubmitting(false)
    }
  }

  // Popup ยืนยัน Check Out (Confirm checkout)
  if (showConfirm) {
    return (
      <ConfirmDialog
        title="Confirm Check Out"
        question={`Are you sure you want to check out ${currentLease.tenantName} from Room ${room.roomNumber}?`}
        confirmLabel={submitting ? 'Checking out...' : 'Confirm Check Out'}
        confirmColor="red"
        disabled={submitting}
        error={error}
        onConfirm={handleCheckOut}
        onCancel={() => setShowConfirm(false)}
        onClose={onClose}
      />
    )
  }

  return (
    <BaseModal
      title={`Room ${room.roomNumber}`}
      subtitle="Select tenant and enter lease details"
      badge={{ label: 'Occupied', color: 'red' }}
      onClose={onClose}
    >
      {/* Tabs */}
      <div className="flex border-b border-[#e7e0d3] mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('tenant')}
          className={`pb-2.5 text-sm transition font-medium mr-8 border-b-2 ${
            activeTab === 'tenant'
              ? 'border-[#2b2a26] text-[#2b2a26] font-semibold'
              : 'border-transparent text-[#767065] hover:text-[#2b2a26]'
          }`}
        >
          Tenant Information
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('lease')}
          className={`pb-2.5 text-sm transition font-medium border-b-2 ${
            activeTab === 'lease'
              ? 'border-[#2b2a26] text-[#2b2a26] font-semibold'
              : 'border-transparent text-[#767065] hover:text-[#2b2a26]'
          }`}
        >
          Lease Information
        </button>
      </div>

      {/* Tab 1: Tenant Information */}
      {activeTab === 'tenant' && (
        <div className="flex flex-col text-sm divide-y divide-[#f0ece6]">
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Tenant Name</span>
            <span className="font-medium text-[#2b2a26]">{currentLease.tenantName}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Tenant LineID</span>
            <span className="text-[#2b2a26]">
              {currentLease.tenantName.toLowerCase().replace(/\s+/g, '')}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Tenant Phone</span>
            <span className="text-[#2b2a26]">021-366-4587</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Tenant National ID</span>
            <span className="text-[#2b2a26]">1-1111-11111-11-1</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Emergency Contact</span>
            <span className="text-[#2b2a26]">911</span>
          </div>
        </div>
      )}

      {/* Tab 2: Lease Information */}
      {activeTab === 'lease' && (
        <div className="flex flex-col text-sm divide-y divide-[#f0ece6]">
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Check In Date</span>
            <span className="text-[#2b2a26]">{englishDate(currentLease.startDate)}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Check Out Date</span>
            <span className="text-[#2b2a26]">
              {currentLease.endDate ? englishDate(currentLease.endDate) : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Rent Amount</span>
            <span className="text-[#2b2a26]">{formatCurrency(currentLease.monthlyRent)}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-[#767065]">Security Deposit</span>
            <span className="text-[#2b2a26]">{formatCurrency(currentLease.monthlyRent * 2)}</span>
          </div>
        </div>
      )}

      {/* Footer Action Button */}
      <div className="flex justify-end pt-8 mt-2">
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="rounded-lg bg-[#eb5757] px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#e04848] focus:outline-none focus:ring-2 focus:ring-[#eb5757]"
        >
          Check Out
        </button>
      </div>
    </BaseModal>
  )
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 2. Available Room Flow (Check In)
 * ══════════════════════════════════════════════════════════════════
 */
function AvailableRoomDialog({
  room,
  tenants,
  existingLeases,
  onClose,
  onChanged,
}: {
  room: RoomSummary
  tenants: Tenant[]
  existingLeases: Lease[]
  onClose: () => void
  onChanged: () => void
}) {
  const [activeTab, setActiveTab] = useState<'tenant' | 'lease'>('tenant')
  const [selectedTenantId, setSelectedTenantId] = useState<number>(tenants[0]?.id ?? 0)
  const [lineId, setLineId] = useState('')
  const [phone, setPhone] = useState(tenants[0]?.phone ?? '055-555-5555')
  const [nationalId, setNationalId] = useState(tenants[0]?.nationalId ?? '1-1111-11111-11-1')
  const [emergencyContact, setEmergencyContact] = useState('911')

  const [startDate, setStartDate] = useState(todayInBangkok())
  const [endDate, setEndDate] = useState('')
  const [rentAmount, setRentAmount] = useState(room.baseRent || 450000)
  const [securityDeposit, setSecurityDeposit] = useState((room.baseRent || 450000) * 2)

  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function handleTenantChange(id: number) {
    setSelectedTenantId(id)
    const t = tenants.find((item) => item.id === id)
    if (t) {
      setPhone(t.phone || '055-555-5555')
      setNationalId(t.nationalId || '1-1111-11111-11-1')
      setLineId(t.fullName.toLowerCase().replace(/\s+/g, ''))
    }
  }

  function handleValidate(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const normalizedEnd = endDate === '' ? null : endDate
    if (tenants.length === 0 || selectedTenantId === 0) {
      setFormError('No tenants available in the system. Please add a tenant first.')
      return
    }
    if (isBackwardsRange(startDate, normalizedEnd)) {
      setFormError('Check Out Date must not be earlier than Check In Date.')
      return
    }

    const conflict = findConflictingLease(existingLeases, {
      roomId: room.id,
      startDate,
      endDate: normalizedEnd,
    })
    if (conflict) {
      setFormError(overlapMessage(conflict))
      return
    }

    setShowConfirm(true)
  }

  async function handleConfirmCheckIn() {
    setSubmitting(true)
    setFormError(null)

    const normalizedEnd = endDate === '' ? null : endDate
    const payload: LeaseRequest = {
      roomId: room.id,
      tenantId: selectedTenantId,
      startDate,
      endDate: normalizedEnd,
      monthlyRent: rentAmount,
      billingCycle: 'MONTHLY',
    }

    try {
      await createLease(payload)
      onChanged()
      onClose()
    } catch (error) {
      setFormError(errorMessage(error, 'Check in failed. Please try again.'))
      setSubmitting(false)
      setShowConfirm(false)
    }
  }

  // Popup ยืนยัน Check In (Confirm checkin)
  if (showConfirm) {
    return (
      <ConfirmDialog
        title="Confirm Check In"
        question={`Are you sure you want to check in to Room ${room.roomNumber}?`}
        confirmLabel={submitting ? 'Checking in...' : 'Confirm Check In'}
        confirmColor="green"
        disabled={submitting}
        error={formError}
        onConfirm={handleConfirmCheckIn}
        onCancel={() => setShowConfirm(false)}
        onClose={onClose}
      />
    )
  }

  return (
    <BaseModal
      title={`Room ${room.roomNumber}`}
      subtitle="Select tenant and enter lease details"
      badge={{ label: 'Available', color: 'green' }}
      onClose={onClose}
    >
      <form onSubmit={handleValidate} className="flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-[#e7e0d3] mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('tenant')}
            className={`pb-2.5 text-sm transition font-medium mr-8 border-b-2 ${
              activeTab === 'tenant'
                ? 'border-[#2b2a26] text-[#2b2a26] font-semibold'
                : 'border-transparent text-[#767065] hover:text-[#2b2a26]'
            }`}
          >
            Tenant Information
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lease')}
            className={`pb-2.5 text-sm transition font-medium border-b-2 ${
              activeTab === 'lease'
                ? 'border-[#2b2a26] text-[#2b2a26] font-semibold'
                : 'border-transparent text-[#767065] hover:text-[#2b2a26]'
            }`}
          >
            Lease Information
          </button>
        </div>

        {formError && (
          <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
            {formError}
          </p>
        )}

        {/* Tab 1: Tenant Information */}
        {activeTab === 'tenant' && (
          <div className="flex flex-col text-sm divide-y divide-[#f0ece6]">
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="tenant-select" className="text-[#767065]">Tenant Name</label>
              <select
                id="tenant-select"
                value={selectedTenantId}
                onChange={(e) => handleTenantChange(Number(e.target.value))}
                className="rounded-md border border-[#e7e0d3] bg-white px-3 py-1.5 text-right font-medium text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="line-id" className="text-[#767065]">Tenant LineID</label>
              <input
                id="line-id"
                type="text"
                value={lineId || (tenants.find((t) => t.id === selectedTenantId)?.fullName.toLowerCase().replace(/\s+/g, '') ?? 'tanaka')}
                onChange={(e) => setLineId(e.target.value)}
                className="border-b border-transparent py-1 text-right text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="phone" className="text-[#767065]">Tenant Phone</label>
              <input
                id="phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="border-b border-transparent py-1 text-right text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="national-id" className="text-[#767065]">Tenant National ID</label>
              <input
                id="national-id"
                type="text"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                className="border-b border-transparent py-1 text-right text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="emergency-contact" className="text-[#767065]">Emergency Contact</label>
              <input
                id="emergency-contact"
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="border-b border-transparent py-1 text-right text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Lease Information */}
        {activeTab === 'lease' && (
          <div className="flex flex-col text-sm divide-y divide-[#f0ece6]">
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="check-in-date" className="text-[#767065]">Check In Date</label>
              <div className="relative flex items-center">
                <input
                  id="check-in-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="rounded-md border border-[#e7e0d3] px-2.5 py-1 text-sm text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="check-out-date" className="text-[#767065]">Check Out Date</label>
              <div className="relative flex items-center">
                <input
                  id="check-out-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-md border border-[#e7e0d3] px-2.5 py-1 text-sm text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="rent-amount" className="text-[#767065]">Rent Amount</label>
              <input
                id="rent-amount"
                type="number"
                value={rentAmount}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setRentAmount(val)
                  setSecurityDeposit(val * 2)
                }}
                className="w-32 rounded-md border border-[#e7e0d3] px-2.5 py-1 text-right text-sm text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="security-deposit" className="text-[#767065]">Security Deposit</label>
              <input
                id="security-deposit"
                type="number"
                value={securityDeposit}
                onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                className="w-32 rounded-md border border-[#e7e0d3] px-2.5 py-1 text-right text-sm text-[#2b2a26] focus:border-[#2b2a26] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Footer Action Button */}
        <div className="flex justify-end pt-8 mt-2">
          <button
            type="submit"
            className="rounded-lg bg-[#a3e635] px-6 py-2 text-sm font-medium text-[#1a471a] shadow-sm transition hover:bg-[#92d326] focus:outline-none focus:ring-2 focus:ring-[#a3e635]"
          >
            Check In
          </button>
        </div>
      </form>
    </BaseModal>
  )
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 3. Maintenance Room Flow
 * ══════════════════════════════════════════════════════════════════
 */
function MaintenanceRoomDialog({
  room,
  onClose,
  onChanged,
}: {
  room: RoomSummary
  onClose: () => void
  onChanged: () => void
}) {
  const tickets = useLoader(
    () => fetchRoomMaintenance(room.id),
    'Failed to load maintenance records',
    [room.id],
  )
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)

  async function releaseRoom() {
    setReleasing(true)
    setReleaseError(null)
    try {
      await updateRoomStatus(room.id, 'AVAILABLE')
      onChanged()
      onClose()
    } catch (error) {
      setReleaseError(errorMessage(error, 'Failed to release room'))
    } finally {
      setReleasing(false)
    }
  }

  return (
    <BaseModal
      title={`Room ${room.roomNumber}`}
      subtitle={`Floor ${room.floor} · Under Maintenance`}
      badge={{ label: 'Maintenance', color: 'red' }}
      onClose={onClose}
    >
      {releaseError && (
        <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {releaseError}
        </p>
      )}
      {tickets.loading && <LoadingState label="Loading maintenance records..." />}
      {tickets.error && <ErrorState message={tickets.error} />}
      {tickets.data?.length === 0 && (
        <EmptyState
          title="No maintenance tickets"
          hint="This room is under maintenance but no tickets have been logged."
        />
      )}
      {tickets.data && tickets.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tickets.data.map((ticket) => (
            <li
              key={ticket.id}
              className="flex gap-3 rounded-xl border border-[rgba(238,217,196,0.6)] bg-[#faf9f6] px-4 py-3"
            >
              <Wrench size={16} className="mt-0.5 shrink-0 text-body-muted" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{ticket.title}</p>
                {ticket.detail && <p className="mt-0.5 text-sm text-body-muted">{ticket.detail}</p>}
                <p className="mt-1 text-xs text-ink-muted">
                  {MAINTENANCE_LABEL[ticket.status]} · Reported {thaiDate(ticket.reportedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-[#f0ece6]">
        <button
          type="button"
          onClick={onClose}
          disabled={releasing}
          className="rounded-lg border border-[#e7e0d3] bg-white px-4 py-2 text-sm font-medium text-[#767065] hover:bg-black/5"
        >
          Close
        </button>
        <button
          type="button"
          onClick={releaseRoom}
          disabled={releasing}
          className="rounded-lg bg-[#f4c2c2] px-4 py-2 text-sm font-medium text-[#795356] shadow-sm hover:brightness-95"
        >
          {releasing ? 'Saving...' : 'Release Room'}
        </button>
      </div>
    </BaseModal>
  )
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 4. Shared Base Modal & Confirm Dialog
 * ══════════════════════════════════════════════════════════════════
 */
function BaseModal({
  title,
  subtitle,
  badge,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  badge?: { label: string; color: 'green' | 'red' }
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-white p-7 shadow-[0px_20px_60px_-15px_rgba(122,84,87,0.35)] outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4">
          <div>
            <h2 className="font-heading text-2xl font-bold text-[#2b2a26]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#767065]">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-3">
            {badge && (
              <span
                className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold text-white ${
                  badge.color === 'green' ? 'bg-[#21c45d]' : 'bg-[#eb5757]'
                }`}
              >
                {badge.label}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-[#767065] hover:bg-black/5 hover:text-[#2b2a26]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function ConfirmDialog({
  title,
  question,
  confirmLabel,
  confirmColor,
  disabled,
  error,
  onConfirm,
  onCancel,
  onClose,
}: {
  title: string
  question: string
  confirmLabel: string
  confirmColor: 'green' | 'red'
  disabled?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-white p-6 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#f0ece6]">
          <h2 className="font-heading text-lg font-bold text-[#2b2a26]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[#767065] hover:bg-black/5 hover:text-[#2b2a26]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="py-6">
          <p className="text-sm text-[#2b2a26]">{question}</p>
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className={`rounded-lg px-5 py-2 text-sm font-medium shadow-sm transition hover:opacity-90 ${
              confirmColor === 'green'
                ? 'bg-[#a3e635] text-[#1a471a]'
                : 'bg-[#eb5757] text-white'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="rounded-lg border border-[#e7e0d3] bg-white px-5 py-2 text-sm font-medium text-[#767065] hover:bg-black/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
