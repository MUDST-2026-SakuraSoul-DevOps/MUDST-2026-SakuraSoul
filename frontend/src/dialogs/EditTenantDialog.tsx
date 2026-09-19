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
  const initialIsPassport = Boolean(
    tenant.nationalId &&
      (!/^\d+$/.test(tenant.nationalId.replace(/\s+/g, '')) ||
        tenant.nationalId.replace(/\D/g, '').length !== 13),
  )
  const [fullName, setFullName] = useState(tenant.fullName || '')
  const [phone, setPhone] = useState(formatPhoneNumber(tenant.phone || ''))
  const [idType, setIdType] = useState<'THAI_ID' | 'PASSPORT'>(
    initialIsPassport ? 'PASSPORT' : 'THAI_ID',
  )
  const [nationalId, setNationalId] = useState(
    initialIsPassport
      ? (tenant.nationalId || '').toUpperCase()
      : formatNationalId(tenant.nationalId || ''),
  )
  const [lineId, setLineId] = useState(tenant.lineId || '')

  // กล่องเลือกวันที่กว้างพอให้เห็น วัน เดือน ปี ครบถ้วน ไม่ถูกไอคอนบัง
  const [startDate, setStartDate] = useState(tenant.startDate || '2026-07-21')
  const [endDate, setEndDate] = useState(tenant.endDate || '2026-08-31')
  const [roomType, setRoomType] = useState(tenant.roomType || 'Double Bedroom')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const errors: string[] = []
    if (!fullName.trim()) {
      errors.push('Please enter the full name')
    }

    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits === '') {
      errors.push('Please enter the phone number')
    } else if (phoneDigits.length !== 10) {
      errors.push('Phone number must be 10 digits')
    }

    const cleanId =
      idType === 'THAI_ID'
        ? nationalId.replace(/\D/g, '')
        : nationalId.trim().toUpperCase()

    if (!cleanId) {
      errors.push(
        idType === 'THAI_ID'
          ? 'Please enter Thai National ID'
          : 'Please enter Passport number',
      )
    } else if (idType === 'THAI_ID') {
      if (cleanId.length !== 13) {
        errors.push('Thai National ID must be 13 digits')
      } else if (!isValidThaiNationalId(cleanId)) {
        errors.push('Invalid Thai National ID checksum')
      }
    } else {
      if (!/^[A-Z0-9]{6,20}$/.test(cleanId)) {
        errors.push('Passport number must be 6–20 alphanumeric characters')
      }
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
        nationalId: cleanId || null,
        lineId: lineId.trim() || null,
        startDate: startDate || null,
        endDate: endDate || null,
        roomType: roomType || null,
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
            <label htmlFor={idType === 'THAI_ID' ? 'edit-national-id' : 'edit-passport'} className="mb-1.5 block text-xs font-semibold text-ink">
              Identification <span className="text-red-500">*</span>
            </label>
            <div className="mb-2 flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-ink font-medium">
                <input
                  type="radio"
                  name="edit-id-type"
                  value="THAI_ID"
                  checked={idType === 'THAI_ID'}
                  onChange={() => {
                    setIdType('THAI_ID')
                    setNationalId('')
                  }}
                  className="accent-[#5a3036] cursor-pointer"
                />
                Thai ID
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-ink font-medium">
                <input
                  type="radio"
                  name="edit-id-type"
                  value="PASSPORT"
                  checked={idType === 'PASSPORT'}
                  onChange={() => {
                    setIdType('PASSPORT')
                    setNationalId('')
                  }}
                  className="accent-[#5a3036] cursor-pointer"
                />
                Passport
              </label>
            </div>

            {idType === 'THAI_ID' ? (
              <div>
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
            ) : (
              <div>
                <input
                  id="edit-passport"
                  type="text"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
                  maxLength={20}
                  placeholder="e.g. AA1234567"
                  aria-label="Passport number"
                  className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#a3e635]"
                />
                <p className="mt-1 text-[11px] text-gray-400">6–20 alphanumeric characters (A–Z, 0–9)</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="edit-line-id" className="mb-1.5 block text-xs font-semibold text-ink">
              Line ID
            </label>
            <div className="mb-2 h-4" />
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
      </form>
    </Modal>
  )
}
