import { useState, type FormEvent } from 'react'
import { Wrench, X } from 'lucide-react'
import { createLease, errorMessage, fetchRoomMaintenance, terminateLease, updateRoomStatus } from '../api/client'
import type { Lease, LeaseRequest, MaintenanceTicket, RoomSummary, Tenant } from '../api/types'
import { useLoader } from '../hooks/useLoader'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'
import { bahtAmount, displayDate, todayInBangkok } from '../format'
import { findConflictingLease, isBackwardsRange, leaseDepositText, overlapMessage } from '../domain/lease'

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
      tenant={currentLease === null ? undefined : tenants.find((t) => t.id === currentLease.tenantId)}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}

/**
 * แถวข้อมูลติดต่อของผู้เช่าในแท็บ Tenant Information อ่านจากข้อมูลผู้เช่าจริงอย่างเดียว (SSK-136)
 *
 * เดิมทั้งแท็บ Occupied และ check-in ใส่ค่าปลอมเหมือนกันทุกคน (เบอร์ 021-366-4587 บัตร 1-1111-11111-11-1
 * ผู้ติดต่อฉุกเฉิน 911) และช่องในแท็บ check-in แก้ได้แต่ไม่เคยถูกส่งไปไหน ข้อมูลติดต่อเป็นของผู้เช่า
 * แก้ได้ที่หน้า Tenants ที่เดียว ส่วนผู้ติดต่อฉุกเฉินไม่มีที่เก็บในระบบเลย จึงตัดแถวนั้นออก
 */
function TenantContactRows({ tenant }: { tenant: Tenant | undefined }) {
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: 'Tenant LineID', value: tenant?.lineId },
    { label: 'Tenant Phone', value: tenant?.phone },
    { label: 'Tenant National ID', value: tenant?.nationalId },
    { label: 'Tenant Email', value: tenant?.email },
  ]
  return (
    <>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between py-3">
          <span className="text-sand-530">{row.label}</span>
          <span className="text-sand-830">{row.value || 'Not provided'}</span>
        </div>
      ))}
    </>
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
  tenant,
  onClose,
  onChanged,
}: {
  room: RoomSummary
  currentLease: Lease | null
  /** ผู้เช่าของสัญญาปัจจุบัน หาไม่เจอ (ข้อมูลยังโหลดไม่ครบ) แถวข้อมูลติดต่อขึ้น Not provided */
  tenant: Tenant | undefined
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
      <div className="flex border-b border-sand-110 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('tenant')}
          className={`pb-2.5 text-sm transition font-medium mr-8 border-b-2 ${
            activeTab === 'tenant'
              ? 'border-sand-830 text-sand-830 font-semibold'
              : 'border-transparent text-sand-530 hover:text-sand-830'
          }`}
        >
          Tenant Information
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('lease')}
          className={`pb-2.5 text-sm transition font-medium border-b-2 ${
            activeTab === 'lease'
              ? 'border-sand-830 text-sand-830 font-semibold'
              : 'border-transparent text-sand-530 hover:text-sand-830'
          }`}
        >
          Lease Information
        </button>
      </div>

      {/* Tab 1: Tenant Information */}
      {activeTab === 'tenant' && (
        <div className="flex flex-col text-sm divide-y divide-sand-65">
          <div className="flex items-center justify-between py-3">
            <span className="text-sand-530">Tenant Name</span>
            <span className="font-medium text-sand-830">{currentLease.tenantName}</span>
          </div>
          <TenantContactRows tenant={tenant} />
        </div>
      )}

      {/* Tab 2: Lease Information */}
      {activeTab === 'lease' && (
        <div className="flex flex-col text-sm divide-y divide-sand-65">
          <div className="flex items-center justify-between py-3">
            <span className="text-sand-530">Check In Date</span>
            <span className="text-sand-830">{displayDate(currentLease.startDate)}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sand-530">Check Out Date</span>
            <span className="text-sand-830">
              {currentLease.endDate ? displayDate(currentLease.endDate) : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sand-530">Rent Amount</span>
            <span className="text-sand-830">{bahtAmount(currentLease.monthlyRent)}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sand-530">Security Deposit</span>
            <span className="text-sand-830">{leaseDepositText(currentLease)}</span>
          </div>
        </div>
      )}

      {/* Footer Action Button */}
      <div className="flex justify-end pt-8 mt-2">
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="rounded-lg bg-alert-430 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-alert-470 focus:outline-none focus:ring-2 focus:ring-alert-430"
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
  const selectedTenant = tenants.find((t) => t.id === selectedTenantId)

  const [startDate, setStartDate] = useState(todayInBangkok())
  const [endDate, setEndDate] = useState('')
  // SSK-127 ค่าเช่าคือ baseRent ของห้องที่ backend คิดจากประเภทห้อง แก้ในฟอร์มนี้ไม่ได้
  const [securityDeposit, setSecurityDeposit] = useState(room.baseRent * 2)

  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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
      billingCycle: 'MONTHLY',
      securityDeposit,
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
        <div className="flex border-b border-sand-110 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('tenant')}
            className={`pb-2.5 text-sm transition font-medium mr-8 border-b-2 ${
              activeTab === 'tenant'
                ? 'border-sand-830 text-sand-830 font-semibold'
                : 'border-transparent text-sand-530 hover:text-sand-830'
            }`}
          >
            Tenant Information
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lease')}
            className={`pb-2.5 text-sm transition font-medium border-b-2 ${
              activeTab === 'lease'
                ? 'border-sand-830 text-sand-830 font-semibold'
                : 'border-transparent text-sand-530 hover:text-sand-830'
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
          <div className="flex flex-col text-sm divide-y divide-sand-65">
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="tenant-select" className="text-sand-530">Tenant Name</label>
              <select
                id="tenant-select"
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(Number(e.target.value))}
                className="rounded-md border border-sand-110 bg-white px-3 py-1.5 text-right font-medium text-sand-830 focus:border-sand-830 focus:outline-none"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
            <TenantContactRows tenant={selectedTenant} />
            <p className="pt-2.5 text-xs text-sand-530">Contact details come from the tenant record. Edit them on the Tenants page.</p>
          </div>
        )}

        {/* Tab 2: Lease Information */}
        {activeTab === 'lease' && (
          <div className="flex flex-col text-sm divide-y divide-sand-65">
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="check-in-date" className="text-sand-530">Check In Date</label>
              <div className="relative flex items-center">
                <input
                  id="check-in-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="rounded-md border border-sand-110 px-2.5 py-1 text-sm text-sand-830 focus:border-sand-830 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="check-out-date" className="text-sand-530">Check Out Date</label>
              <div className="relative flex items-center">
                <input
                  id="check-out-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-md border border-sand-110 px-2.5 py-1 text-sm text-sand-830 focus:border-sand-830 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="rent-amount" className="text-sand-530">Rent Amount</label>
              {/* SSK-127 ค่าเช่าฟิกตามประเภทห้อง แสดงอย่างเดียว (feedback อาจารย์ข้อ 5) */}
              <input
                id="rent-amount"
                type="text"
                readOnly
                value={bahtAmount(room.baseRent)}
                className="w-32 cursor-default rounded-md border border-sand-110 bg-page-bg px-2.5 py-1 text-right text-sm text-sand-830 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between py-2.5">
              <label htmlFor="security-deposit" className="text-sand-530">Security Deposit</label>
              <input
                id="security-deposit"
                type="number"
                value={securityDeposit}
                onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                className="w-32 rounded-md border border-sand-110 px-2.5 py-1 text-right text-sm text-sand-830 focus:border-sand-830 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Footer Action Button */}
        <div className="flex justify-end pt-8 mt-2">
          <button
            type="submit"
            className="rounded-lg bg-moss-160 px-6 py-2 text-sm font-medium text-moss-740 shadow-sm transition hover:bg-moss-220 focus:outline-none focus:ring-2 focus:ring-moss-160"
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
              className="flex gap-3 rounded-xl border border-honey-140/60 bg-page-bg px-4 py-3"
            >
              <Wrench size={16} className="mt-0.5 shrink-0 text-body-muted" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{ticket.title}</p>
                {ticket.detail && <p className="mt-0.5 text-sm text-body-muted">{ticket.detail}</p>}
                <p className="mt-1 text-xs text-ink-muted">
                  {MAINTENANCE_LABEL[ticket.status]} · Reported {displayDate(ticket.reportedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-sand-65">
        <button
          type="button"
          onClick={onClose}
          disabled={releasing}
          className="rounded-lg border border-sand-110 bg-white px-4 py-2 text-sm font-medium text-sand-530 hover:bg-black/5"
        >
          Close
        </button>
        <button
          type="button"
          onClick={releaseRoom}
          disabled={releasing}
          className="rounded-lg bg-cta-bg px-4 py-2 text-sm font-medium text-brand shadow-sm hover:brightness-95"
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
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-honey-140/50 bg-white p-7 shadow-[0px_20px_60px_-15px_rgba(122,84,87,0.35)] outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4">
          <div>
            <h2 className="font-heading text-2xl font-bold text-sand-830">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-sand-530">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-3">
            {badge && (
              <span
                className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold text-white ${
                  badge.color === 'green' ? 'bg-status-available' : 'bg-alert-430'
                }`}
              >
                {badge.label}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-sand-530 hover:bg-black/5 hover:text-sand-830"
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
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-honey-140/50 bg-white p-6 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between pb-4 border-b border-sand-65">
          <h2 className="font-heading text-lg font-bold text-sand-830">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-sand-530 hover:bg-black/5 hover:text-sand-830"
          >
            <X size={18} />
          </button>
        </div>

        <div className="py-6">
          <p className="text-sm text-sand-830">{question}</p>
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
                ? 'bg-moss-160 text-moss-740'
                : 'bg-alert-430 text-white'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="rounded-lg border border-sand-110 bg-white px-5 py-2 text-sm font-medium text-sand-530 hover:bg-black/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
