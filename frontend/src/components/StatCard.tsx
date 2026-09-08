import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'

/**
 * การ์ดสรุปตัวเลขแบบ bento (พื้นโปร่งแสง + ไอคอนใหญ่มุมขวา) ก๊อปจาก Payment
 * Management (node 11:1269 "Total Revenue" ฯลฯ) ใช้ซ้ำได้กับหน้าอื่นที่มี
 * stat card แบบเดียวกัน (Maintenance, Contracts)
 */
export function StatCard({
  label,
  value,
  icon: IconComp,
  footer,
}: {
  label: string
  value: string
  icon: Icon
  footer?: ReactNode
}) {
  return (
    <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-[rgba(238,217,196,0.5)] bg-white/70 p-6 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
      <IconComp size={72} weight="thin" className="absolute top-0 right-0 text-body-muted/15" />
      <p className="text-xs font-medium tracking-[0.6px] text-body-muted uppercase">{label}</p>
      <p className="font-heading text-[32px] tracking-[-0.32px] text-heading">{value}</p>
      {footer && <div className="pt-1">{footer}</div>}
    </div>
  )
}
