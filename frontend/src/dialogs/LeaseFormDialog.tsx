import { useState, type FormEvent } from 'react'
import { createLease, errorMessage } from '../api/client'
import type { BillingCycle, LeaseRequest, RoomSummary, Tenant } from '../api/types'
import { Modal } from '../components/Modal'
import { DateField, NumberField, SelectField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'

/**
 * ฟอร์มสร้างสัญญาเช่า เปิดจากการคลิกห้องว่างในแดชบอร์ด (US-09-S1)
 *
 * ตอนนี้ยังไม่มีการเตือนเรื่องสัญญาทับช่วงเวลากันฝั่งหน้าเว็บ ถ้าห้องไม่ว่างจริง
 * backend จะตอบ 409 กลับมาแล้วข้อความจะขึ้นใต้ฟอร์ม การเตือนตั้งแต่ก่อนกดส่ง
 * เป็นของ US-05 (SSK-11)
 */

const BILLING_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'MONTHLY', label: 'รายเดือน' },
  { value: 'YEARLY', label: 'รายปี' },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LeaseFormDialog({
  room,
  tenants,
  onClose,
  onSaved,
}: {
  room: Pick<RoomSummary, 'id' | 'roomNumber' | 'baseRent'>
  tenants: Tenant[]
  onClose: () => void
  onSaved: () => void
}) {
  const [tenantId, setTenantId] = useState<number>(tenants[0]?.id ?? 0)
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [monthlyRent, setMonthlyRent] = useState(room.baseRent)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (tenants.length === 0 || tenantId === 0) {
      setFormError('ยังไม่มีผู้เช่าในระบบ ไปเพิ่มผู้เช่าที่หน้า Tenants ก่อน')
      return
    }

    const payload: LeaseRequest = {
      roomId: room.id,
      tenantId,
      startDate,
      endDate: endDate === '' ? null : endDate,
      monthlyRent,
      billingCycle,
    }

    setSubmitting(true)
    try {
      await createLease(payload)
      onSaved()
    } catch (error) {
      setFormError(errorMessage(error, 'สร้างสัญญาไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`เช็คอินห้อง ${room.roomNumber}`}
      subtitle="สร้างสัญญาเช่าใหม่ให้ห้องที่ว่างอยู่"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            ยกเลิก
          </SecondaryButton>
          <PrimaryButton type="submit" form="lease-form" disabled={submitting}>
            {submitting ? 'กำลังบันทึก...' : 'สร้างสัญญาเช่า'}
          </PrimaryButton>
        </>
      }
    >
      <form id="lease-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <SelectField
          label="ผู้เช่า"
          value={tenantId}
          onChange={(value) => setTenantId(Number(value))}
          options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.fullName }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="วันเริ่มสัญญา" value={startDate} onChange={setStartDate} required />
          <DateField
            label="วันสิ้นสุดสัญญา"
            value={endDate}
            onChange={setEndDate}
            hint="เว้นว่างได้ถ้ายังไม่กำหนดวันจบ"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="ค่าเช่า (บาท)"
            value={monthlyRent}
            onChange={setMonthlyRent}
            hint={`ค่าเช่าตั้งต้นของห้องนี้คือ ${room.baseRent.toLocaleString('th-TH')} บาท`}
          />
          <SelectField
            label="รอบบิล"
            value={billingCycle}
            onChange={(value) => setBillingCycle(value as BillingCycle)}
            options={BILLING_OPTIONS}
          />
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
