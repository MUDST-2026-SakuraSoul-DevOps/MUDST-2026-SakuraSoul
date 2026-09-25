import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption<T extends string | number = string> {
  value: T
  label: string
}

export function CustomSelect<T extends string | number = string>({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className = '',
  buttonClassName,
  menuClassName,
  disabled = false,
  variant = 'light',
}: {
  id?: string
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  className?: string
  buttonClassName?: string
  menuClassName?: string
  disabled?: boolean
  variant?: 'light' | 'dark'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const selectedOption = options.find((opt) => String(opt.value) === String(value))
  const isDark = variant === 'dark'

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Hidden native select for HTML forms, accessibility, and testing */}
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const val = typeof value === 'number' ? Number(e.target.value) : e.target.value
          onChange(val as T)
        }}
        disabled={disabled}
        className="sr-only"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={
          buttonClassName ||
          (isDark
            ? 'mt-1 flex w-full items-center justify-between rounded bg-sand-860 border border-sand-680 px-3 py-2 text-xs text-white outline-none hover:border-sand-530 focus:border-moss-160 cursor-pointer'
            : 'mt-1 flex w-full items-center justify-between rounded-lg border border-sand-110 bg-white px-3 py-2 text-sm text-sand-830 outline-none hover:border-wine-750 focus:border-wine-750 cursor-pointer')
        }
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown
          size={isDark ? 14 : 16}
          className={`${isDark ? 'text-sand-320' : 'text-sand-530'} shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className={
            menuClassName ||
            (isDark
              ? 'absolute top-full left-0 z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-sand-680 bg-sand-860 p-1 shadow-2xl'
              : 'absolute top-full left-0 z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-sand-110 bg-white p-1 shadow-lg')
          }
        >
          {options.map((opt) => {
            const isSelected = String(opt.value) === String(value)
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors cursor-pointer ${
                  isDark
                    ? isSelected
                      ? 'bg-white/10 font-semibold text-moss-160 text-xs'
                      : 'text-sand-90 text-xs hover:bg-white/5'
                    : isSelected
                      ? 'bg-sand-45 font-semibold text-brand text-sm'
                      : 'text-sand-830 text-sm hover:bg-black/5'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check size={14} className={isDark ? 'text-moss-160' : 'text-brand'} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
