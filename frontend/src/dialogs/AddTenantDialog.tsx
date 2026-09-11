import { useState, type FormEvent } from 'react'
import { createTenant, errorMessage } from '../api/client'
import type { CreateTenantRequest } from '../api/types'
import { validateTenant } from '../domain/tenant'
import { Modal } from '../components/Modal'
import { TextField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'

/**
 * ป็อปอัปเพิ่มผู้เช่าใหม่ (US-03) ตรงกับเฟรม "Add Tenant" ใน Figma (node 378:1960)
 *
 * เดิมเป็นแผงที่กางออกมาใต้หัวข้อหน้า Tenants เปลี่ยนมาเป็นป็อปอัปตามดีไซน์
 * และเพราะการเพิ่มผู้เช่าเป็นงานที่ทำแล้วจบ ไม่ได้ต้องเห็นตารางข้างหลังไปด้วย
 *
 * ชื่อ อีเมล เบอร์โทร บังคับครบสามช่องตามที่ story ระบุ ส่วนเลขบัตรประชาชน
 * ไม่บังคับเพราะผู้เช่าบางคนยื่นทีหลังตอนเซ็นสัญญา
 */
export function AddTenantDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** เรียกเมื่อบันทึกสำเร็จ เพื่อให้รายชื่อโหลดใหม่ */
  onCreated: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [nationalId, setNationalId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const draft: CreateTenantRequest = {
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      nationalId: nationalId.trim() || undefined,
    }

    // US-03-S2 บอกช่องที่ขาดตั้งแต่ก่อนยิง API ผู้ใช้จะได้ไม่ต้องรอ round trip
    // แล้วค่อยรู้ว่าลืมกรอกอะไร
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
      setFormError(errorMessage(error, 'Could not add the tenant'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add New Tenant"
      subtitle="Save the tenant's details before creating a lease"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" form="add-tenant-form" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Tenant'}
          </PrimaryButton>
        </>
      }
    >
      {/* noValidate ให้ข้อความเตือนมาจาก validateTenant ที่เดียว ไม่งั้นผู้ใช้จะเจอ
          ทั้งฟองข้อความภาษาอังกฤษของเบราว์เซอร์และข้อความไทยของเราปนกัน */}
      <form id="add-tenant-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Full Name *"
          value={fullName}
          onChange={setFullName}
          placeholder="e.g. Aiko Tanaka"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Email *"
            value={email}
            onChange={setEmail}
            placeholder="somchai@example.com"
            hint="Used to send receipts and lease documents"
          />
          <TextField
            label="Phone Number *"
            value={phone}
            onChange={setPhone}
            placeholder="08x-xxx-xxxx"
          />
        </div>
        <TextField
          label="National ID"
          value={nationalId}
          onChange={setNationalId}
          hint="Optional. It can be filled in later when the lease is signed."
        />

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
