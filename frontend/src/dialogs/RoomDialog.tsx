import { Wrench } from 'lucide-react'
import { fetchRoomMaintenance } from '../api/client'
import type { MaintenanceTicket, RoomSummary, Tenant } from '../api/types'
import { useLoader } from '../hooks/useLoader'
import { Modal } from '../components/Modal'
import { SecondaryButton } from '../components/Button'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'
import { baht, thaiDate } from '../format'
import { LeaseFormDialog } from './LeaseFormDialog'

/**
 * ป็อปอัปที่เปิดตอนคลิกห้องในแดชบอร์ด (US-09) หน้าตาที่โชว์ขึ้นกับสถานะห้อง
 *
 * - ว่าง        → ฟอร์มสร้างสัญญาเช่าเลย (S1) ไม่ต้องกดอีกชั้น
 * - มีผู้เช่า   → รายละเอียดผู้เช่าและสัญญาของห้องนั้น (S2)
 * - ซ่อมบำรุง  → รายการงานซ่อมของห้องนั้น (S3)
 *
 * ที่รวมสามเคสไว้ component เดียวเพราะจุดเข้าคือการคลิกการ์ดห้องอันเดียวกัน
 * แยกไฟล์แล้วต้องไปเขียน logic เลือกสถานะซ้ำที่หน้าแดชบอร์ดอยู่ดี
 *
 * ปุ่มแก้ไขกับเช็คเอาต์เป็นของ US-06 (SSK-12) ยังไม่อยู่ใน PR นี้
 */

const MAINTENANCE_LABEL: Record<MaintenanceTicket['status'], string> = {
  OPEN: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังซ่อม',
  DONE: 'ซ่อมเสร็จแล้ว',
}

export function RoomDialog({
  room,
  tenants,
  onClose,
  onChanged,
}: {
  room: RoomSummary
  tenants: Tenant[]
  onClose: () => void
  /** เรียกเมื่อข้อมูลเปลี่ยน เพื่อให้แดชบอร์ดโหลดสถานะห้องใหม่ */
  onChanged: () => void
}) {
  if (room.status === 'AVAILABLE') {
    return (
      <LeaseFormDialog
        room={room}
        tenants={tenants}
        onClose={onClose}
        onSaved={() => {
          onChanged()
          onClose()
        }}
      />
    )
  }

  if (room.status === 'MAINTENANCE') {
    return <MaintenanceDialog room={room} onClose={onClose} />
  }

  return <OccupiedRoomDialog room={room} onClose={onClose} />
}

function OccupiedRoomDialog({ room, onClose }: { room: RoomSummary; onClose: () => void }) {
  const lease = room.currentLease

  return (
    <Modal
      title={`ห้อง ${room.roomNumber}`}
      subtitle={`ชั้น ${room.floor} · มีผู้เช่าอยู่`}
      onClose={onClose}
      footer={<SecondaryButton onClick={onClose}>ปิด</SecondaryButton>}
    >
      {lease === null ? (
        // ห้องบอกว่ามีคนอยู่แต่ไม่มีข้อมูลสัญญาติดมา แปลว่าข้อมูลสองชุดไม่ตรงกัน
        // บอกตรง ๆ ดีกว่าโชว์ป็อปอัปเปล่า ๆ ให้คนเดาเอง
        <ErrorState message="ห้องนี้มีสถานะว่ามีผู้เช่า แต่ไม่มีข้อมูลสัญญาติดมาด้วย ลองโหลดหน้าใหม่อีกครั้ง" />
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-ink-muted">ผู้เช่า</dt>
          <dd className="font-medium text-ink">{lease.tenantName}</dd>
          <dt className="text-ink-muted">ช่วงสัญญา</dt>
          <dd className="text-ink">
            {thaiDate(lease.startDate)} ถึง{' '}
            {lease.endDate === null ? 'ไม่กำหนด' : thaiDate(lease.endDate)}
          </dd>
          <dt className="text-ink-muted">ค่าเช่า</dt>
          <dd className="text-ink">
            {baht(lease.monthlyRent)} บาท · {lease.billingCycle === 'MONTHLY' ? 'รายเดือน' : 'รายปี'}
          </dd>
          <dt className="text-ink-muted">งานซ่อมค้าง</dt>
          <dd className="text-ink">
            {room.openMaintenanceCount === 0 ? 'ไม่มี' : `${room.openMaintenanceCount} รายการ`}
          </dd>
        </dl>
      )}
    </Modal>
  )
}

function MaintenanceDialog({ room, onClose }: { room: RoomSummary; onClose: () => void }) {
  const tickets = useLoader(
    () => fetchRoomMaintenance(room.id),
    'เรียกข้อมูลงานซ่อมไม่สำเร็จ',
    [room.id],
  )

  return (
    <Modal
      title={`ห้อง ${room.roomNumber}`}
      subtitle={`ชั้น ${room.floor} · ปิดซ่อมบำรุงอยู่`}
      onClose={onClose}
      footer={<SecondaryButton onClick={onClose}>ปิด</SecondaryButton>}
    >
      {tickets.loading && <LoadingState label="กำลังโหลดงานซ่อม..." />}
      {tickets.error && <ErrorState message={tickets.error} />}
      {tickets.data?.length === 0 && (
        <EmptyState
          title="ยังไม่มีใบแจ้งซ่อมของห้องนี้"
          hint="ห้องถูกตั้งเป็นซ่อมบำรุงไว้ แต่ยังไม่มีรายการงานซ่อมบันทึกเข้ามา"
        />
      )}
      {tickets.data && tickets.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tickets.data.map((ticket) => (
            <li
              key={ticket.id}
              className="flex gap-3 rounded-xl border border-[rgba(238,217,196,0.6)] bg-[#faf9f6] px-4 py-3"
            >
              <Wrench size={16} className="mt-0.5 shrink-0 text-body-muted" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{ticket.title}</p>
                {ticket.detail && <p className="mt-0.5 text-sm text-body-muted">{ticket.detail}</p>}
                <p className="mt-1 text-xs text-ink-muted">
                  {MAINTENANCE_LABEL[ticket.status]} · แจ้งเมื่อ {thaiDate(ticket.reportedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
