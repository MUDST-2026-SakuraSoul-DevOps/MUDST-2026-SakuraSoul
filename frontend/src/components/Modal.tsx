import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * ป็อปอัปกลางจอที่ใช้ซ้ำทุกที่ที่ดีไซน์เป็น popup (Dashboard Popup, Add/Edit
 * Unit, Edit Contract, Confirm Check-out)
 *
 * ที่ไม่ใช้ <dialog> ของเบราว์เซอร์เพราะ jsdom ที่ใช้ตอนเทสยังไม่รองรับ
 * showModal() ทำให้เทสหน้าจอที่มีป็อปอัปเขียนยากโดยไม่ได้อะไรกลับมา
 * ตัวนี้เลยเป็น div ธรรมดาที่ใส่ role="dialog" กับ aria-modal ให้ครบเอง
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'default',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /**
   * ความกว้างของป็อปอัป ตั้งต้นเป็นขนาดฟอร์มสั้น ๆ ที่ใบส่วนใหญ่ใช้
   * 'wide' ไว้ให้ใบที่ดีไซน์วางเป็นหลายคอลัมน์ อย่าง Create Maintenance
   * ที่ในดีไซน์กว้างราว 830px ถ้าบีบลงมาเท่าใบอื่นเนื้อหาจะอัดกันจนอ่านยาก
   */
  width?: 'default' | 'wide'
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-white shadow-[0px_20px_60px_-15px_rgba(122,84,87,0.35)] outline-none ${width === 'wide' ? 'max-w-4xl' : 'max-w-lg'}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[rgba(212,194,195,0.3)] px-6 py-5">
          <div>
            <h2 className="font-heading text-xl text-heading">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-body-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-ink-muted hover:bg-black/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="flex flex-wrap justify-end gap-3 border-t border-[rgba(212,194,195,0.3)] bg-[#faf9f6] px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
