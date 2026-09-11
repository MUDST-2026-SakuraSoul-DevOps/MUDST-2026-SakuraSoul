import type { ReactNode } from 'react'

/**
 * หัวหน้าเนื้อหา (ชื่อหน้าใหญ่ + คำอธิบายใต้ชื่อ + ปุ่ม action ขวามือ) รูปแบบ
 * เดียวกันซ้ำทุกหน้าใน Figma (ดู "Page Header" ใน Unit Page node 125:2289)
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="flex w-full items-center justify-between gap-6">
      <div>
        <h1 className="font-heading text-[40px] leading-9 text-heading">{title}</h1>
        <p className="mt-1 text-base leading-9 text-body-muted">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 gap-3">{actions}</div>}
    </div>
  )
}
