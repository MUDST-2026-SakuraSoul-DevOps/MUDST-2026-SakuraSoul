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
      setError(errorMessage(err, 'เปลี่ยนสถานะห้องไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`สถานะห้อง ${room.roomNumber}`}
      subtitle={`ชั้น ${room.floor}`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            ปิด
          </SecondaryButton>
          {underMaintenance ? (
            <PrimaryButton onClick={() => apply('AVAILABLE')} disabled={submitting}>
              {submitting ? 'กำลังบันทึก...' : 'ปิดงานซ่อม คืนห้องให้เช่าได้'}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => apply('MAINTENANCE')} disabled={submitting}>
              {submitting ? 'กำลังบันทึก...' : 'ตั้งเป็นซ่อมบำรุง'}
            </PrimaryButton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
          <dt className="text-ink-muted">สถานะตอนนี้</dt>
          <dd>
            <RoomStatusBadge status={room.status} />
          </dd>
          <dt className="text-ink-muted">ผู้เช่าปัจจุบัน</dt>
          <dd className="text-ink">{room.currentLease?.tenantName ?? 'ไม่มี'}</dd>
        </dl>

        <p className="rounded-lg border border-[rgba(238,217,196,0.6)] bg-[#faf9f6] px-4 py-3 text-sm text-body-muted">
          {underMaintenance
            ? 'ปิดงานซ่อมแล้วห้องจะกลับมารับสัญญาใหม่ได้ทันที ถ้ายังมีสัญญาที่ยังไม่จบอยู่ ห้องจะกลับไปเป็นมีผู้เช่าเหมือนเดิม'
            : 'ตั้งเป็นซ่อมบำรุงแล้วห้องจะไม่ถูกเสนอให้สร้างสัญญาเช่าใหม่ จนกว่าจะกดปิดงานซ่อม'}
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
