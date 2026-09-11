import { useState, type FormEvent } from 'react'
import { errorMessage, updateTenant } from '../api/client'
import type { Tenant } from '../api/types'
import { isValidThaiNationalId } from '../domain/tenant'
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
 * ป็อปอัปแก้ไขข้อมูลผู้เช่า ตรงกับเฟรม "Edit Tenant Information" ใน Figma (SSK-107)
 */
export function EditTenantDialog({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: Tenant & {
    lineId?: string
    startDate?: string
    endDate?: string
    leasePeriod?: string
    rent?: number | string
    roomType?: string
  }
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(tenant.fullName || '')
  const [phone, setPhone] = useState(formatPhoneNumber(tenant.phone || ''))
  const [nationalId, setNationalId] = useState(formatNationalId(tenant.nationalId || ''))
  const [lineId, setLineId] = useState(tenant.lineId || '')

  // กล่องเลือกวันที่กว้างพอให้เห็น วัน เดือน ปี ครบถ้วน ไม่ถูกไอคอนบัง
  const [startDate, setStartDate] = useState(tenant.startDate || '2026-07-21')
  const [endDate, setEndDate] = useState(tenant.endDate || '2026-08-31')

  // ช่องค่าเช่ารับเฉพาะตัวเลขเท่านั้น ไม่อนุญาตให้ใส่ตัวอักษร (แก้ BUG-T3)
  const initialRent = String(tenant.rent || '45000').replace(/[^0-9]/g, '')
  const [rent, setRent] = useState(initialRent)
  const [roomType, setRoomType] = useState(tenant.roomType || 'Double Bedroom')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function handleRentChange(val: string) {
    // ป้องกันการใส่ตัวอักษร กรองเฉพาะตัวเลข 0-9
    const digitsOnly = val.replace(/[^0-9]/g, '')
    setRent(digitsOnly)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const errors: string[] = []
    if (!fullName.trim()) {
      errors.push('Please enter the full name')
    }

    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits === '') {
      errors.push('Please enter phone number')
    } else if (phoneDigits.length !== 10) {
      errors.push('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
    }

    if (nationalId.trim()) {
      const idDigits = nationalId.replace(/\D/g, '')
      if (idDigits.length !== 13) {
        errors.push('กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก')
      } else if (!isValidThaiNationalId(nationalId)) {
        errors.push('เลขบัตรประชาชนไม่ถูกต้องตามหลัก 13 หลัก')
      }
    }

    if (!rent || Number(rent) <= 0) {
      errors.push('Please enter a valid rent amount')
    }

    if (!startDate || !endDate) {
      errors.push('Please specify complete lease period')
    }

    if (errors.length > 0) {
      setFormError(errors.join('\n'))
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
      setFormError(errorMessage(error, 'Could not update tenant information'))
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
            aria-label="Cancel"
            className="rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-tenant-form"
            disabled={submitting}
            aria-label="Confirm"
            className="rounded-lg bg-[#a3e635] px-6 py-2 text-sm font-semibold text-[#1a2e05] shadow-sm hover:bg-[#84cc16] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      }
    >
      <form id="edit-tenant-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 text-left">
        {formError && (
          <p
            role="alert"
            className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {formError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-full-name" className="mb-1.5 block text-xs font-semibold text-ink">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tenant's Fullname"
              aria-label="Full name"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
            />
          </div>

          <div>
            <label htmlFor="edit-phone" className="mb-1.5 block text-xs font-semibold text-ink">
              Phone number <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-phone"
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
            <label htmlFor="edit-national-id" className="mb-1.5 block text-xs font-semibold text-ink">
              National ID <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-national-id"
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(formatNationalId(e.target.value))}
              maxLength={17}
              placeholder="1 1004 00345 67 3"
              aria-label="National ID"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
            />
            <p className="mt-1 text-[11px] text-gray-400">13 digits — printed on the lease contract</p>
          </div>

          <div>
            <label htmlFor="edit-line-id" className="mb-1.5 block text-xs font-semibold text-ink">
              Line ID
            </label>
            <input
              id="edit-line-id"
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
                id="edit-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start Date"
                className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3 py-2 text-sm text-ink outline-none focus:border-[#a3e635]"
              />
            </div>
            <div>
              <input
                id="edit-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End Date"
                className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3 py-2 text-sm text-ink outline-none focus:border-[#a3e635]"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-rent" className="mb-1.5 block text-xs font-semibold text-ink">
              Rent <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-rent"
              type="text"
              inputMode="numeric"
              value={rent}
              onChange={(e) => handleRentChange(e.target.value)}
              placeholder="e.g. 45000"
              aria-label="Rent"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
            />
          </div>

          <div>
            <label htmlFor="edit-room-type" className="mb-1.5 block text-xs font-semibold text-ink">
              Room Type <span className="text-red-500">*</span>
            </label>
            <select
              id="edit-room-type"
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
      </form>
    </Modal>
  )
}
