import { useState, type FormEvent } from 'react'
import { errorMessage, updateTenant } from '../api/client'
import type { Tenant } from '../api/types'
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
 * ป็อปอัปแก้ไขข้อมูลผู้เช่า ตรงกับเฟรม "Edit Tenant Information" ใน Figma
 */
export function EditTenantDialog({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: Tenant & {
    lineId?: string
    leasePeriod?: string
    rent?: number | string
    roomType?: string
  }
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(tenant.fullName || '')
  const [phone, setPhone] = useState(formatPhoneNumber(tenant.phone || ''))
  const [nationalId, setNationalId] = useState(tenant.nationalId || '')
  const [lineId, setLineId] = useState(tenant.lineId || '')
  const [leasePeriod, setLeasePeriod] = useState(tenant.leasePeriod || '21 Jul – 31 Aug, 2026')
  const [rent, setRent] = useState(String(tenant.rent || '45,000'))
  const [roomType, setRoomType] = useState(tenant.roomType || 'Double Bedroom')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (!fullName.trim()) {
      setFormError('กรุณากรอกชื่อ-นามสกุล')
      return
    }

    setSubmitting(true)
    try {
      await updateTenant(tenant.id, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        nationalId: nationalId.trim() || null,
      })
      onSaved()
      onClose()
    } catch (error) {
      setFormError(errorMessage(error, 'แก้ไขข้อมูลผู้เช่าไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Edit Tenant Information"
      subtitle="Required for issuing the lease contract"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-start gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-tenant-form"
            disabled={submitting}
            className="rounded-lg bg-[#a3e635] px-6 py-2 text-sm font-semibold text-[#1a2e05] shadow-sm hover:bg-[#84cc16] disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      }
    >
      <form id="edit-tenant-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 text-left">
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
              aria-label="Full name"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
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
              aria-label="Phone number"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
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
              aria-label="National ID"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
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
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
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
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
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
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
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
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-[#a3e635]"
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
