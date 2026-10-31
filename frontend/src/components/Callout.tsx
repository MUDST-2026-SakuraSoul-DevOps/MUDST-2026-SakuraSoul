import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

export type Tone = 'neutral' | 'green' | 'amber' | 'rose'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-chip-bg text-ink-muted',
  green: 'bg-moss-50 text-moss-545',
  amber: 'bg-honey-20 text-honey-615',
  rose: 'bg-blush-50 text-wine-630',
}

/** ป้ายสั้นสี่สีตามดีไซน์ SSK-177 (.p2-badge) ใช้บอกสถานะของแถว เช่น Locked, Similar name, Low stock */
export function ToneBadge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex w-fit items-center rounded px-2 py-1 text-[10px] font-medium ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  )
}

/** กล่องอธิบายกติกาสั้น ๆ ใต้แถบเครื่องมือ (.p2-note ของ SSK-177) */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[7px] border border-sidebar-border bg-sidebar px-4 py-3 text-xs leading-[1.7] text-body-muted">
      <Info className="ui-icon size-icon-inline mt-0.5 shrink-0 text-brand" aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}

/** การ์ดขาวหัวเรื่อง + คำอธิบาย + ปุ่มขวา (.p2-card ของ SSK-177) */
export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="w-full rounded-2xl border border-card-border bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-card-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl text-heading">{title}</h2>
          {description && <p className="mt-1 text-xs text-body-muted">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}
