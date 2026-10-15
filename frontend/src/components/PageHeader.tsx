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
    <div className="flex w-full flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-6xl leading-tight text-heading">{title}</h1>
        <p className="mt-1 text-base leading-normal text-body-muted">{description}</p>
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap gap-3">{actions}</div>}
    </div>
  )
}
