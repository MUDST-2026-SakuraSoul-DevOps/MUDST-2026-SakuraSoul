import { useState, type FormEvent } from 'react'
import { createTenant, errorMessage } from '../api/client'
import type { CreateTenantRequest } from '../api/types'
import { isValidEmail, isValidPassport, isValidThaiNationalId } from '../domain/tenant'
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
 *
 * SSK-136 ตัดช่อง Lease Period กับ Room Type ออก เพราะเป็นข้อมูลของสัญญา ไม่ใช่ของผู้เช่า
 * backend ไม่เคยเก็บ กรอกไปแล้วหายเงียบ ๆ สัญญาสร้างที่หน้า Contracts หรือ check-in บน Dashboard
 * และเพิ่มช่อง Email ไม่บังคับแทนการสร้างอีเมล <ชื่อ>@example.com ขึ้นมาเองลงฐานจริง
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
  const [idType, setIdType] = useState<'THAI_ID' | 'PASSPORT'>('THAI_ID')
  const [nationalId, setNationalId] = useState('')
  const [lineId, setLineId] = useState('')
  const [email, setEmail] = useState('')

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
    if (!phoneDigits) {
      errors.push('Please enter the phone number')
    } else if (phoneDigits.length !== 10) {
      errors.push('Phone number must be 10 digits')
    }

    const cleanId = idType === 'THAI_ID'
      ? nationalId.replace(/\D/g, '')
      : nationalId.trim().toUpperCase()

    /*
      เลขบัตรบังคับตามคำตัดสินอาจารย์ 11 ก.ย. และตรงกับ backend (TenantDtos)
      Thai ID ตรวจ 13 หลักกับ checksum ส่วน Passport ต้องเป็นตัวอักษร/ตัวเลข 6-20 ตัว
      (SSK-113 ปัญหาเดิมคือผู้เช่าต่างชาติกรอกไม่ได้ แก้ด้วยปุ่มเลือก Thai ID / Passport แล้ว)
    */
    if (!cleanId) {
      errors.push(idType === 'THAI_ID' ? 'Please enter the national ID' : 'Please enter the passport number')
    } else if (idType === 'THAI_ID') {
      if (cleanId.length !== 13) {
        errors.push('Thai National ID must be 13 digits')
      } else if (!isValidThaiNationalId(cleanId)) {
        errors.push('Invalid Thai National ID checksum')
      }
    } else if (!isValidPassport(cleanId)) {
      errors.push('Passport number must be 6–20 alphanumeric characters')
    }

    // อีเมลไม่บังคับ (คำตัดสินอาจารย์ 11 ก.ย.) ตรวจรูปแบบเฉพาะตอนกรอกมา เกณฑ์เดียวกับ backend
    if (email.trim() !== '' && !isValidEmail(email)) {
      errors.push('That email address is not valid')
    }

    if (errors.length > 0) {
      setFormError(errors.join('\n'))
      return
    }

    const draft: CreateTenantRequest = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      nationalId: cleanId || undefined,
      lineId: lineId.trim() || undefined,
      email: email.trim() || undefined,
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
            className="rounded-lg border border-avatar-ring/60 bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-tenant-form"
            disabled={submitting}
            aria-label="Confirm"
            className="rounded-lg bg-moss-160 px-6 py-2 text-sm font-semibold text-moss-840 shadow-sm hover:bg-moss-250 transition-colors disabled:opacity-50 cursor-pointer"
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
              className="w-full rounded-lg border border-avatar-ring/60 px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-moss-160"
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
              className="w-full rounded-lg border border-avatar-ring/60 px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-moss-160"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={idType === 'THAI_ID' ? 'add-national-id' : 'add-passport'} className="mb-1.5 block text-xs font-semibold text-ink">
              Identification <span className="text-red-500">*</span>
            </label>
            <div className="mb-2 flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-ink font-medium">
                <input
                  type="radio"
                  name="add-id-type"
                  value="THAI_ID"
                  checked={idType === 'THAI_ID'}
                  onChange={() => {
                    setIdType('THAI_ID')
                    setNationalId('')
                  }}
                  className="accent-wine-750 cursor-pointer"
                />
                Thai ID
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-ink font-medium">
                <input
                  type="radio"
                  name="add-id-type"
                  value="PASSPORT"
                  checked={idType === 'PASSPORT'}
                  onChange={() => {
                    setIdType('PASSPORT')
                    setNationalId('')
                  }}
                  className="accent-wine-750 cursor-pointer"
                />
                Passport
              </label>
            </div>

            {idType === 'THAI_ID' ? (
              <div>
                <input
                  id="add-national-id"
                  type="text"
                  value={nationalId}
                  onChange={(e) => setNationalId(formatNationalId(e.target.value))}
                  maxLength={17}
                  placeholder="1 1004 00345 67 3"
                  aria-label="National ID"
                  className="w-full rounded-lg border border-avatar-ring/60 px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-moss-160"
                />
                <p className="mt-1 text-[11px] text-gray-400">13 digits — printed on the lease contract</p>
              </div>
            ) : (
              <div>
                <input
                  id="add-passport"
                  type="text"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
                  maxLength={20}
                  placeholder="e.g. AA1234567"
                  aria-label="Passport number"
                  className="w-full rounded-lg border border-avatar-ring/60 px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-moss-160"
                />
                <p className="mt-1 text-[11px] text-gray-400">6–20 letters and digits, as printed on the passport</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="add-line-id" className="mb-1.5 block text-xs font-semibold text-ink">
              Line ID
            </label>
            <div className="mb-2 h-4" />
            <input
              id="add-line-id"
              type="text"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              placeholder="@sakura.tenant"
              aria-label="Line ID"
              className="w-full rounded-lg border border-avatar-ring/60 px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-moss-160"
            />
            <p className="mt-1 text-[11px] text-gray-400">Primary contact channel</p>
          </div>
        </div>

        <div>
          <label htmlFor="add-email" className="mb-1.5 block text-xs font-semibold text-ink">
            Email
          </label>
          <input
            id="add-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tenant@example.com"
            aria-label="Email"
            className="w-full rounded-lg border border-avatar-ring/60 px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-moss-160"
          />
          <p className="mt-1 text-[11px] text-gray-400">Optional — for sending receipts and lease documents</p>
        </div>
      </form>
    </Modal>
  )
}
