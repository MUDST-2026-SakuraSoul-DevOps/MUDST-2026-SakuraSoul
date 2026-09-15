import { useState, type FormEvent } from 'react'
import { createTenant, errorMessage } from '../api/client'
import type { CreateTenantRequest } from '../api/types'
import { validateTenant } from '../domain/tenant'
import { Modal } from '../components/Modal'

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) {
    return digits
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}

function formatNationalId(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 1) return digits
  if (digits.length <= 5) return `${digits.slice(0, 1)} ${digits.slice(1)}`
  if (digits.length <= 10) return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10)}`
  return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 12)} ${digits.slice(12)}`
}

/**
 * ป็อปอัปเพิ่มผู้เช่าใหม่ ตรงกับเฟรม "Tenant Information" ใน Figma (SSK-107)
 */
export function AddTenantDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [lineId, setLineId] = useState('')
  
  // กล่องเลือกวันที่กว้างพอให้เห็น วัน เดือน ปี ครบถ้วน ไม่ถูกไอคอนบัง
  const [startDate, setStartDate] = useState('2026-07-21')
  const [endDate, setEndDate] = useState('2026-08-31')
  const [roomType, setRoomType] = useState('Single Bedroom')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const effectiveEmail = fullName.trim()
      ? `${fullName.trim().toLowerCase().replace(/\s+/g, '.')}@example.com`
      : 'tenant@example.com'

    const draft: CreateTenantRequest = {
      fullName: fullName.trim(),
      email: effectiveEmail,
      phone: phone.trim(),
      nationalId: nationalId.trim() || undefined,
    }

    const invalid = validateTenant(draft)
    if (invalid) {
      setFormError(invalid)
      return
    }

    if (!startDate || !endDate) {
      setFormError('Please specify complete lease period')
      return
    }

    setSubmitting(true)
    try {
      await createTenant(draft)
      onCreated()
      onClose()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not add the tenant'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Tenant Information"
      subtitle="Required for issuing the lease contract"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-start gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cancel"
            className="rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-tenant-form"
            disabled={submitting}
            aria-label="Confirm"
            className="rounded-lg bg-[#a3e635] px-6 py-2 text-sm font-semibold text-[#1a2e05] shadow-sm hover:bg-[#84cc16] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Adding...' : 'Confirm'}
          </button>
        </div>
      }
    >
      <form id="add-tenant-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 text-left">
        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {formError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="add-full-name" className="mb-1.5 block text-xs font-semibold text-ink">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="add-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tenant's Fullname"
              aria-label="Full name"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
            />
          </div>

          <div>
            <label htmlFor="add-phone" className="mb-1.5 block text-xs font-semibold text-ink">
              Phone number <span className="text-red-500">*</span>
            </label>
            <input
              id="add-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
              maxLength={12}
              placeholder="083-456-7890"
              aria-label="Phone number"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="add-national-id" className="mb-1.5 block text-xs font-semibold text-ink">
              National ID <span className="text-red-500">*</span>
            </label>
            <input
              id="add-national-id"
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(formatNationalId(e.target.value))}
              maxLength={17}
              placeholder="11004 00345 67 3"
              aria-label="National ID"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
            />
            <p className="mt-1 text-[11px] text-gray-400">13 digits — printed on the lease contract</p>
          </div>

          <div>
            <label htmlFor="add-line-id" className="mb-1.5 block text-xs font-semibold text-ink">
              Line ID
            </label>
            <input
              id="add-line-id"
              type="text"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              placeholder="@sakura.tenant"
              aria-label="Line ID"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
            />
            <p className="mt-1 text-[11px] text-gray-400">Primary contact channel</p>
          </div>
        </div>

        {/* Lease Period ขยายให้เต็มแถวเพื่อให้เห็น วัน เดือน ปี ครบทั้งสองกล่อง */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">
            Lease Period <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <input
                id="add-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start Date"
                className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3 py-2 text-sm text-ink outline-none focus:border-[#a3e635]"
              />
            </div>
            <div>
              <input
                id="add-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End Date"
                className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3 py-2 text-sm text-ink outline-none focus:border-[#a3e635]"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="add-room-type" className="mb-1.5 block text-xs font-semibold text-ink">
            Room Type <span className="text-red-500">*</span>
          </label>
          <select
            id="add-room-type"
            value={roomType}
            onChange={(e) => setRoomType(e.target.value)}
            aria-label="Room Type"
            className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-[#a3e635]"
          >
            <option value="Single Bedroom">Single Bedroom</option>
            <option value="Double Bedroom">Double Bedroom</option>
          </select>
        </div>
      </form>
    </Modal>
  )
}
