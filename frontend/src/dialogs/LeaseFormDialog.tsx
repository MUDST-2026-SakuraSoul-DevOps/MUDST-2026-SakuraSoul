import { useState, type FormEvent } from 'react'
import { createLease, errorMessage } from '../api/client'
import type { BillingCycle, Lease, LeaseRequest, RoomSummary, Tenant } from '../api/types'
import { findConflictingLease, isBackwardsRange, overlapMessage } from '../domain/lease'
import { Modal } from '../components/Modal'
import { DateField, NumberField, SelectField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { todayInBangkok } from '../format'

/**
 * ฟอร์มสร้างสัญญาเช่า เปิดจากการคลิกห้องว่างในแดชบอร์ด (US-09-S1)
 *
 * การกันสัญญาทับช่วงเวลากันตาม US-05 มีสองชั้นและตั้งใจให้ซ้ำกัน
 * 1. เช็คจากสัญญาที่โหลดมาแล้วก่อนกดส่ง เพื่อให้ผู้ใช้เห็นทันทีตามที่ story ขอว่า
 *    ต้อง "เตือนและบล็อกทันที" ไม่ต้องรอ round trip
 * 2. ถ้าหลุดชั้นแรกมา เพราะข้อมูลในมือเก่าหรือมีคนอื่นสร้างพร้อมกัน ก็ยังโดน 409
 *    จาก backend ซึ่งสุดท้ายมาจาก exclusion constraint ใน PostgreSQL
 *
 * ชั้นแรกไม่ใช่ตัวกัน race condition ตาม US-05-S2 เพราะสองคำขอที่เข้ามาพร้อมกัน
 * จะเช็คผ่านทั้งคู่ มันมีไว้ทำให้ error อ่านรู้เรื่องและมาถึงเร็วขึ้นเท่านั้น
 */

const BILLING_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'MONTHLY', label: 'รายเดือน' },
  { value: 'YEARLY', label: 'รายปี' },
]

/**
 * วันเริ่มสัญญาตั้งต้นเป็นวันนี้ตามเวลาไทย ไม่ใช่ UTC
 *
 * ถ้าใช้ UTC แล้วแอดมินสร้างสัญญาตอนตีหนึ่ง สัญญาจะเริ่มย้อนหลังไปหนึ่งวันจริง
 * ลงฐานข้อมูล ซึ่งกระทบการตรวจสัญญาทับกันด้วย เพราะช่วงวันที่ขยับไปคาบกับ
 * สัญญาเดิมของห้องนั้นได้
 */
function today(): string {
  return todayInBangkok()
}

export function LeaseFormDialog({
  room,
  tenants,
  existingLeases,
  onClose,
  onSaved,
}: {
  room: Pick<RoomSummary, 'id' | 'roomNumber' | 'baseRent'>
  tenants: Tenant[]
  /** สัญญาทั้งหมดที่โหลดมาแล้ว ใช้เตือนล่วงหน้าก่อนยิง API */
  existingLeases: Lease[]
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

    const normalizedEnd = endDate === '' ? null : endDate

    if (tenants.length === 0 || tenantId === 0) {
      setFormError('ยังไม่มีผู้เช่าในระบบ ไปเพิ่มผู้เช่าที่หน้า Tenants ก่อน')
      return
    }
    if (isBackwardsRange(startDate, normalizedEnd)) {
      setFormError('วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา')
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

    const payload: LeaseRequest = {
      roomId: room.id,
      tenantId,
      startDate,
      endDate: normalizedEnd,
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
