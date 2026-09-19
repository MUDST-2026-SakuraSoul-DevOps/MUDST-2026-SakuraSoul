import type { ReactNode } from 'react'
import { Modal } from '../components/Modal'
import { SecondaryButton } from '../components/Button'

export interface DetailRow {
  label: string
  value: ReactNode
}

/**
 * ป็อปอัปดูรายละเอียดแบบอ่านอย่างเดียว ใช้ร่วมกันทั้งสี่แท็บในหน้า Maintenance
 *
 * แต่ละตารางแสดงได้ไม่ครบทุกช่อง บางค่าต้องกดดินสอเข้าโหมดแก้ไขถึงจะเห็น
 * ซึ่งเสี่ยงเผลอแก้ข้อมูลทั้งที่แค่อยากดู ใช้ตัวเดียวกันทุกแท็บเพื่อให้หน้าตา
 * และการกดเปิดปิดเหมือนกันทุกที่
 */
export function DetailDialog({
  title,
  subtitle,
  description,
  rows,
  onClose,
}: {
  title: string
  subtitle: string
  description?: string | null
  rows: DetailRow[]
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}
    >
      <div className="flex flex-col gap-5">
        {description !== undefined && (
          <div>
            <p className="text-xs font-medium tracking-[0.6px] text-ink-muted uppercase">Description</p>
            <p className="mt-1 text-sm whitespace-pre-line text-ink">{description || '-'}</p>
          </div>
        )}

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
