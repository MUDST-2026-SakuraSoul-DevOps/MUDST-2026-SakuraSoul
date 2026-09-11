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

/**
 * ป็อปอัปเพิ่มผู้เช่าใหม่ ตรงกับเฟรม "Tenant Information" ใน Figma
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
  const [leasePeriod, setLeasePeriod] = useState('')
  const [rent, setRent] = useState('')
  const [roomType, setRoomType] = useState('Single Bedroom')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const effectiveEmail = fullName.trim()
      ? `${fullName.trim().toLowerCase().replace(/\s+/g, '.')}@example.com`
      : ''

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

    setSubmitting(true)
    try {
      await createTenant(draft)
      onCreated()
      onClose()
    } catch (error) {
      setFormError(errorMessage(error, 'เพิ่มผู้เช่าไม่สำเร็จ'))
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
            aria-label="Cancel ยกเลิก"
            className="rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-tenant-form"
            disabled={submitting}
            aria-label="Add Unit บันทึกผู้เช่า"
            className="rounded-lg bg-[#5c2a32] px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#4a2027] disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Unit'}
          </button>
        </div>
      }
    >
      <form id="add-tenant-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 text-left">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tenant's Fullname"
              aria-label="Full name ชื่อ-นามสกุล"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              Phone number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
              maxLength={12}
              placeholder="012-345-6789"
              aria-label="Phone number เบอร์โทร"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              National ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="1 2345 67890 12 3"
              aria-label="National ID เลขบัตรประชาชน"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
            />
            <p className="mt-1 text-[11px] text-gray-400">13 digits — printed on the lease contract</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              Line ID
            </label>
            <input
              type="text"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              placeholder="@sakura.tenant"
              aria-label="Line ID"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
            />
            <p className="mt-1 text-[11px] text-gray-400">Primary contact channel</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              Lease Period <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={leasePeriod}
              onChange={(e) => setLeasePeriod(e.target.value)}
              placeholder="Jul 21 – Aug 31, 2026"
              aria-label="Lease Period"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              Rent <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              placeholder="5,000"
              aria-label="Rent"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              Room Type <span className="text-red-500">*</span>
            </label>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
              aria-label="Room Type"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-[#5c2a32]"
            >
              <option value="Single Bedroom">Single Bedroom</option>
              <option value="Double Bedroom">Double Bedroom</option>
            </select>
          </div>
        </div>

        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {formError}
          </p>
        )}
      </form>
    </Modal>
  )
}
