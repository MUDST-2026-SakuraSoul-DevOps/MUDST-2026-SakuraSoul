import { useState } from 'react'
import { errorMessage, terminateLease } from '../api/client'
import type { Lease } from '../api/types'
import { Modal } from '../components/Modal'
import { DateField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { todayInBangkok, displayDate } from '../format'

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
      setError(errorMessage(err, 'Could not close the lease'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Confirm Check-out for Unit ${lease.roomNumber}`}
      subtitle="Closing the lease makes the unit available again straight away"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            Not now
          </SecondaryButton>
          <PrimaryButton onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Closing...' : 'Confirm Check-out'}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-muted">Tenant</dt>
          <dd className="font-medium text-ink">{lease.tenantName}</dd>
          <dt className="text-ink-muted">Lease start</dt>
          <dd className="text-ink">{displayDate(lease.startDate)}</dd>
          <dt className="text-ink-muted">Lease end</dt>
          <dd className="text-ink">{displayDate(lease.endDate)}</dd>
        </dl>

        <DateField
          label="Actual move-out date"
          value={endDate}
          onChange={setEndDate}
          required
          hint="If the tenant leaves early, enter the real move-out date"
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
