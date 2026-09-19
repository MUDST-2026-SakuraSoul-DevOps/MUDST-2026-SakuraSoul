import { useState } from 'react'
import { errorMessage, updateRoomStatus } from '../api/client'
import type { RoomSummary } from '../api/types'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { RoomStatusBadge } from '../components/RoomStatusBadge'

/**
 * ล็อกห้องเป็นซ่อมบำรุง หรือปลดล็อกกลับ (US-15) ตรงกับเฟรม "Popup - Edit
 * Maintenance" ใน Figma (node 27:646)
 *
 * ที่ต้องมีเพราะแอดมินต้องกันห้องที่กำลังซ่อมไม่ให้ถูกปล่อยเช่าระหว่างนั้น
 * พอห้องเป็นซ่อมบำรุงแล้ว การคลิกห้องในแดชบอร์ดจะเปิดรายการงานซ่อมแทนฟอร์ม
 * เช็คอิน ห้องจึงไม่ถูกเสนอเป็นตัวเลือกสำหรับสัญญาใหม่โดยอัตโนมัติ
 *
 * ล็อกห้องที่มีผู้เช่าอยู่ได้ด้วย ตามที่ story เขียนไว้ พอปลดล็อกแล้วห้องจะกลับไป
 * เป็นมีผู้เช่าเองถ้าสัญญายังไม่จบ เพราะสถานะนั้นคำนวณจากสัญญา ไม่ได้เก็บตรง ๆ
 */
export function RoomStatusDialog({
  room,
  onClose,
  onChanged,
}: {
  room: RoomSummary
  onClose: () => void
  /** เรียกเมื่อสถานะเปลี่ยนแล้ว เพื่อให้หน้าที่เปิดป็อปอัปโหลดข้อมูลใหม่ */
  onChanged: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const underMaintenance = room.status === 'MAINTENANCE'

  async function apply(next: 'MAINTENANCE' | 'AVAILABLE') {
    setSubmitting(true)
    setError(null)
    try {
      await updateRoomStatus(room.id, next)
      onChanged()
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not change the unit status'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Unit ${room.roomNumber} Status`}
      subtitle={`Floor ${room.floor}`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            Close
          </SecondaryButton>
          {underMaintenance ? (
            <PrimaryButton onClick={() => apply('AVAILABLE')} disabled={submitting}>
              {submitting ? 'Saving...' : 'Finish Maintenance'}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => apply('MAINTENANCE')} disabled={submitting}>
              {submitting ? 'Saving...' : 'Set to Maintenance'}
            </PrimaryButton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
          <dt className="text-ink-muted">Current status</dt>
          <dd>
            <RoomStatusBadge status={room.status} />
          </dd>
          <dt className="text-ink-muted">Current tenant</dt>
          <dd className="text-ink">{room.currentLease?.tenantName ?? 'None'}</dd>
        </dl>

        <p className="rounded-lg border border-[rgba(238,217,196,0.6)] bg-[#faf9f6] px-4 py-3 text-sm text-body-muted">
          {underMaintenance
            ? 'Once maintenance is finished the unit can take new leases again. If a lease is still running, the unit goes back to occupied.'
            : 'While under maintenance the unit will not be offered for new leases until maintenance is finished.'}
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
