import type { ReactNode } from 'react'
import { Modal } from '../components/Modal'
import { SecondaryButton } from '../components/Button'
import type { MaintenanceTask } from '../domain/maintenanceBoard'
import { displayDate } from '../format'

/**
 * ป็อปอัปดูรายละเอียดงานซ่อมแบบอ่านอย่างเดียว เปิดจากการกดแถวในตาราง Task Overview
 *
 * ตารางแสดงได้แค่ชื่องาน ห้อง ผู้รับงาน ผู้แจ้ง และสถานะ ส่วนประเภทงาน ความสำคัญ
 * และวันที่นัดซ่อมไม่มีที่แสดงเลย ต้องกดดินสอเข้าโหมดแก้ไขถึงจะเห็น ซึ่งเสี่ยงเผลอ
 * แก้ข้อมูลทั้งที่แค่อยากดู
 */
export function MaintenanceTaskDetailDialog({
  task,
  statusBadge,
  onClose,
}: {
  task: MaintenanceTask
  /** ป้ายสถานะตัวเดียวกับในตาราง ส่งมาจากหน้าเพื่อไม่ให้สีสองที่เพี้ยนจากกัน */
  statusBadge: ReactNode
  onClose: () => void
}) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Unit Number', value: task.unit },
    { label: 'Maintenance Type', value: task.maintenanceType || '-' },
    { label: 'Priority', value: task.priority },
    { label: 'Status', value: statusBadge },
    { label: 'Assigned To', value: task.assignTo || '-' },
    { label: 'Report By', value: task.reportBy || '-' },
    { label: 'Date', value: task.date ? displayDate(task.date) : '-' },
  ]

  return (
    <Modal
      title={task.task}
      subtitle="Maintenance task details"
      onClose={onClose}
      footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-xs font-medium tracking-[0.6px] text-ink-muted uppercase">Description</p>
          <p className="mt-1 text-sm whitespace-pre-line text-ink">{task.detail || '-'}</p>
        </div>

        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs font-medium tracking-[0.6px] text-ink-muted uppercase">{row.label}</dt>
              <dd className="mt-1 text-sm text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  )
}
