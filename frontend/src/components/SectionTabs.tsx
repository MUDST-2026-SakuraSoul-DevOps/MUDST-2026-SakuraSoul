import { Link, useSearchParams } from 'react-router-dom'
import type { SectionView } from '../hooks/useSectionView'

/**
 * แถบแท็บย่อยของหน้า ก๊อปจาก .p2-section-tabs ใน SSK-177 แต่ละช่องกว้างเท่ากัน ช่องที่เลือกพื้นขาว
 * เป็นลิงก์ ไม่ใช่ปุ่ม เพราะเปลี่ยน URL (?view=) และคงพารามิเตอร์อื่นไว้ เช่น ?room=
 */
export function SectionTabs<V extends string>({
  label,
  views,
  active,
}: {
  label: string
  views: SectionView<V>[]
  active: V
}) {
  const [params] = useSearchParams()
  function hrefFor(value: V): string {
    const next = new URLSearchParams(params)
    next.set('view', value)
    return `?${next.toString()}`
  }
  return (
    <nav
      aria-label={label}
      className="inline-grid w-fit max-w-full auto-cols-fr grid-flow-col gap-1 self-start rounded-[7px] border border-card-border bg-chip-bg p-1 max-md:w-full"
    >
      {views.map((view) => (
        <Link
          key={view.value}
          to={hrefFor(view.value)}
          aria-current={view.value === active ? 'page' : undefined}
          className="flex min-h-11 min-w-0 items-center justify-center rounded px-3.5 py-[9px] text-center text-[13px] text-ink-muted no-underline hover:text-brand aria-[current=page]:bg-white aria-[current=page]:text-brand aria-[current=page]:shadow-[0_1px_3px_var(--color-sand-100)] max-md:px-2 max-md:text-xs"
        >
          {view.compactLabel ? (
            <>
              <span className="max-md:hidden">{view.label}</span>
              <span className="hidden max-md:inline">{view.compactLabel}</span>
            </>
          ) : (
            view.label
          )}
        </Link>
      ))}
    </nav>
  )
}
