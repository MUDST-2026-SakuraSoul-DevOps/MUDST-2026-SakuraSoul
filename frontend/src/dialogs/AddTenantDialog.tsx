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
      setFormError(errorMessage(error, 'เพิ่มผู้เช่าไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="เพิ่มผู้เช่าใหม่"
      subtitle="บันทึกประวัติผู้เช่าไว้ในระบบก่อนทำสัญญา"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            ยกเลิก
          </SecondaryButton>
          <PrimaryButton type="submit" form="add-tenant-form" disabled={submitting}>
            {submitting ? 'กำลังบันทึก...' : 'บันทึกผู้เช่า'}
          </PrimaryButton>
        </>
      }
    >
      {/* noValidate ให้ข้อความเตือนมาจาก validateTenant ที่เดียว ไม่งั้นผู้ใช้จะเจอ
          ทั้งฟองข้อความภาษาอังกฤษของเบราว์เซอร์และข้อความไทยของเราปนกัน */}
      <form id="add-tenant-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="ชื่อ-นามสกุล *"
          value={fullName}
          onChange={setFullName}
          placeholder="เช่น สมชาย ใจดี"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="อีเมล *"
            value={email}
            onChange={setEmail}
            placeholder="somchai@example.com"
            hint="ใช้ส่งใบเสร็จและเอกสารสัญญา"
          />
          <TextField
            label="เบอร์โทร *"
            value={phone}
            onChange={setPhone}
            placeholder="08x-xxx-xxxx"
          />
        </div>
        <TextField
          label="เลขบัตรประชาชน"
          value={nationalId}
          onChange={setNationalId}
          hint="ไม่บังคับ กรอกทีหลังตอนเซ็นสัญญาได้"
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
