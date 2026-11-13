import { Link, useSearchParams } from 'react-router-dom'
import type { SectionView } from '../hooks/useSectionView'

/**
 * แถบแท็บย่อยของหน้า ตามดีไซน์ SSK-177 แต่ละช่องกว้างเท่ากัน ช่องที่เลือกพื้นขาว
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
      className="section-tabs"
    >
      {views.map((view) => (
        <Link
          key={view.value}
          to={hrefFor(view.value)}
          aria-current={view.value === active ? 'page' : undefined}
          className="section-tab"
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
