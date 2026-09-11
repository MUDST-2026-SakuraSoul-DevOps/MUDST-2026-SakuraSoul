import { useState, type FormEvent } from 'react'
import { createLease, errorMessage, updateLease } from '../api/client'
import type { BillingCycle, Lease, LeaseRequest, RoomSummary, Tenant } from '../api/types'
import { findConflictingLease, isBackwardsRange, overlapMessage } from '../domain/lease'
import { Modal } from '../components/Modal'
import { DateField, NumberField, SelectField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { todayInBangkok, yenAmount } from '../format'

/**
 * ฟอร์มสัญญาเช่า ใช้ทั้งตอนสร้างใหม่ (US-04 / US-09-S1 กดห้องว่างแล้วเช็คอิน)
 * และตอนแก้ไขสัญญาเดิม (US-06-S2) เพราะช่องกรอกกับกฎเรื่องวันที่ทับกัน
 * เหมือนกันทุกอย่าง ต่างแค่ปลายทางว่ายิง POST หรือ PUT
 *
 * การกันสัญญาทับกันมีสองชั้นและตั้งใจให้ซ้ำกัน
 * 1. เช็คจากสัญญาที่โหลดมาแล้วก่อนกดส่ง เพื่อให้ผู้ใช้เห็นทันทีตามที่ US-05 ขอ
 * 2. ถ้าหลุดชั้นแรกมา (ข้อมูลในมือเก่า หรือมีคนอื่นสร้างพร้อมกัน) ก็ยังโดน 409
 *    จาก backend ซึ่งสุดท้ายมาจาก exclusion constraint ใน PostgreSQL
 * ชั้นแรกไม่ใช่ตัวกัน race condition มันแค่ทำให้ error อ่านรู้เรื่องเร็วขึ้น
 */

const BILLING_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
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
  lease,
  existingLeases,
  onClose,
  onSaved,
}: {
  room: Pick<RoomSummary, 'id' | 'roomNumber' | 'baseRent'>
  tenants: Tenant[]
  /** ส่งมาเมื่อเป็นการแก้สัญญาเดิม ไม่ส่ง = สร้างสัญญาใหม่ */
  lease?: Lease
  /** สัญญาทั้งหมดที่โหลดมาแล้ว ใช้เตือนล่วงหน้าก่อนยิง API */
  existingLeases: Lease[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = lease !== undefined

  const [tenantId, setTenantId] = useState<number>(lease?.tenantId ?? tenants[0]?.id ?? 0)
  const [startDate, setStartDate] = useState(lease?.startDate ?? today())
  const [endDate, setEndDate] = useState(lease?.endDate ?? '')
  const [monthlyRent, setMonthlyRent] = useState(lease?.monthlyRent ?? room.baseRent)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(lease?.billingCycle ?? 'MONTHLY')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const normalizedEnd = endDate === '' ? null : endDate

    if (tenants.length === 0 || tenantId === 0) {
      setFormError('There are no tenants yet. Add one on the Tenants page first.')
      return
    }
    if (isBackwardsRange(startDate, normalizedEnd)) {
      setFormError('The end date cannot be before the start date')
      return
    }

    const conflict = findConflictingLease(
      existingLeases,
      { roomId: room.id, startDate, endDate: normalizedEnd },
      lease?.id,
    )
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
      if (isEdit) {
        await updateLease(lease.id, payload)
      } else {
        await createLease(payload)
      }
      onSaved()
    } catch (error) {
      setFormError(errorMessage(error, isEdit ? 'Could not update the lease' : 'Could not create the lease'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit Lease for Unit ${room.roomNumber}` : `Check In Unit ${room.roomNumber}`}
      subtitle={
        isEdit
          ? 'If the new dates overlap another lease for this unit, it will not save'
          : 'Create a new lease for this available unit'
      }
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" form="lease-form" disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Lease'}
          </PrimaryButton>
        </>
      }
    >
      <form id="lease-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <SelectField
          label="Tenant"
          value={tenantId}
          onChange={(value) => setTenantId(Number(value))}
          options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.fullName }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="Lease start" value={startDate} onChange={setStartDate} required />
          <DateField
            label="Lease end"
            value={endDate}
            onChange={setEndDate}
            hint="Leave blank if there is no fixed end date"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Monthly Rent (¥)"
            value={monthlyRent}
            onChange={setMonthlyRent}
            hint={`The base rent for this unit is ${yenAmount(room.baseRent)}`}
          />
          <SelectField
            label="Billing Cycle"
            value={billingCycle}
            onChange={(value) => setBillingCycle(value as BillingCycle)}
            options={BILLING_OPTIONS}
          />
        </div>

        {formError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  )
}
