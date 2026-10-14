import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES = [
  { num: '01', name: 'Jan', full: 'January' },
  { num: '02', name: 'Feb', full: 'February' },
  { num: '03', name: 'Mar', full: 'March' },
  { num: '04', name: 'Apr', full: 'April' },
  { num: '05', name: 'May', full: 'May' },
  { num: '06', name: 'Jun', full: 'June' },
  { num: '07', name: 'Jul', full: 'July' },
  { num: '08', name: 'Aug', full: 'August' },
  { num: '09', name: 'Sep', full: 'September' },
  { num: '10', name: 'Oct', full: 'October' },
  { num: '11', name: 'Nov', full: 'November' },
  { num: '12', name: 'Dec', full: 'December' },
]

export function MonthCalendarPicker({
  id,
  value,
  onChange,
  maxMonth,
}: {
  id?: string
  value: string
  onChange: (val: string) => void
  /** เพดานเดือนที่เลือกได้ (YYYY-MM) เดือนที่เกินนี้จะถูกปิดไม่ให้เลือก (SSK-155) */
  maxMonth?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const initialYear = value ? Number(value.slice(0, 4)) : new Date().getFullYear()
  const [viewYear, setViewYear] = useState(initialYear || new Date().getFullYear())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const selectedMonthIndex = value && value.length >= 7 ? Number(value.slice(5, 7)) - 1 : -1
  const selectedLabel =
    selectedMonthIndex >= 0 && selectedMonthIndex < 12
      ? `${MONTH_NAMES[selectedMonthIndex].full} ${value.slice(0, 4)}`
      : 'Select Month from Calendar'

  const maxYear = maxMonth ? Number(maxMonth.slice(0, 4)) : null
  const canGoNextYear = maxYear === null || viewYear < maxYear

  return (
    <div ref={ref} className="relative mt-1">
      {/* Hidden native input for forms, accessibility, and testing */}
      <input
        id={id}
        type="month"
        value={value}
        max={maxMonth}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-md border border-avatar-ring/60 bg-white p-2 text-sm text-ink outline-none hover:border-brand focus:border-brand cursor-pointer"
      >
        <span className="truncate">{selectedLabel}</span>
        <Calendar size={18} className="text-sand-530 shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-40 mt-1.5 w-64 rounded-xl border border-avatar-ring/60 bg-white p-3 shadow-xl">
          {/* Calendar Header with Year selector */}
          <div className="flex items-center justify-between border-b border-sand-65 pb-2 mb-2">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="flex size-7 items-center justify-center rounded-lg text-sand-530 hover:bg-black/5 hover:text-ink cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-bold text-sm text-ink">{viewYear}</span>
            <button
              type="button"
              disabled={!canGoNextYear}
              onClick={() => setViewYear((y) => y + 1)}
              className={`flex size-7 items-center justify-center rounded-lg cursor-pointer ${
                canGoNextYear
                  ? 'text-sand-530 hover:bg-black/5 hover:text-ink'
                  : 'text-sand-300 opacity-40 cursor-not-allowed'
              }`}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* 12 Months Grid */}
          <div className="grid grid-cols-3 gap-1.5 text-xs">
            {MONTH_NAMES.map((m) => {
              const monthKey = `${viewYear}-${m.num}`
              const isSelected = value === monthKey
              const isFuture = maxMonth !== undefined && monthKey > maxMonth
              return (
                <button
                  key={m.num}
                  type="button"
                  disabled={isFuture}
                  onClick={() => {
                    if (isFuture) return
                    onChange(monthKey)
                    setIsOpen(false)
                  }}
                  className={`rounded-lg py-2 px-1 text-center font-medium transition cursor-pointer ${
                    isFuture
                      ? 'text-sand-300 opacity-40 cursor-not-allowed hover:bg-transparent'
                      : isSelected
                        ? 'bg-brand font-bold text-white shadow-xs'
                        : 'text-sand-830 hover:bg-page-bg hover:text-brand'
                  }`}
                >
                  {m.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
