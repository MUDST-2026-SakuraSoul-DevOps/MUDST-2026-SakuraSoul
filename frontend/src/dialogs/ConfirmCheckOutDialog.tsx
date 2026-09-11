import { useState } from 'react'
import { errorMessage, terminateLease } from '../api/client'
import type { Lease } from '../api/types'
import { Modal } from '../components/Modal'
import { DateField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { todayInBangkok, thaiDate } from '../format'

/**
 * ยืนยันปิดสัญญา (เช็คเอาต์) ตาม US-06-S1 — พอกดยืนยันแล้วสัญญาเปลี่ยนเป็น
 * สิ้นสุด และห้องต้องกลับไปเป็นว่างในแดชบอร์ดทันที ตรงกับเฟรม "Confirm
 * Check-out" ใน Figma (node 27:848)
 *
 * ให้เลือกวันสิ้นสุดได้เพราะเคสจริงที่ requirement เขียนไว้คือผู้เช่าย้ายออก
 * ก่อนกำหนด แอดมินจึงต้องระบุวันที่ย้ายออกจริง ไม่ใช่วันที่กดปุ่มเสมอไป
 */
export function ConfirmCheckOutDialog({
  lease,
  onClose,
  onDone,
}: {
  lease: Lease
  onClose: () => void
  onDone: () => void
}) {
  const [endDate, setEndDate] = useState(todayInBangkok())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      await terminateLease(lease.id, endDate)
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'ปิดสัญญาไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`ยืนยันเช็คเอาต์ห้อง ${lease.roomNumber}`}
      subtitle="ปิดสัญญาแล้วห้องจะกลับไปเป็นห้องว่างทันที"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            ไม่ใช่ตอนนี้
          </SecondaryButton>
          <PrimaryButton onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'กำลังปิดสัญญา...' : 'ยืนยันเช็คเอาต์'}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-muted">ผู้เช่า</dt>
          <dd className="font-medium text-ink">{lease.tenantName}</dd>
          <dt className="text-ink-muted">วันเริ่มสัญญา</dt>
          <dd className="text-ink">{thaiDate(lease.startDate)}</dd>
          <dt className="text-ink-muted">วันสิ้นสุดตามสัญญา</dt>
          <dd className="text-ink">{thaiDate(lease.endDate)}</dd>
        </dl>

        <DateField
          label="วันที่ย้ายออกจริง"
          value={endDate}
          onChange={setEndDate}
          required
          hint="ถ้าย้ายออกก่อนกำหนด ให้ใส่วันที่ย้ายออกจริง"
        />

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
