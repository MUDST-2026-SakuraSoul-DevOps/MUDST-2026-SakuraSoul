import type { ReactNode } from 'react'

/**
 * ช่องกรอกในฟอร์ม หน้าตาเดียวกันทุกที่ (ฟอร์มเพิ่มผู้เช่า ฟอร์มสัญญาเช่า)
 * แยกออกมาเพราะเดิมแต่ละหน้าเขียน label + input + สไตล์ซ้ำกันเอง
 */
const INPUT_CLASS =
  'rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand'

function Wrapper({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-body-muted">{hint}</span>}
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  required,
  hint,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: string
  placeholder?: string
}) {
  return (
    <Wrapper label={label} hint={hint}>
      <input
        type="text"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
    </Wrapper>
  )
}

export function DateField({
  label,
  value,
  onChange,
  required,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: string
}) {
  return (
    <Wrapper label={label} hint={hint}>
      <input
        type="date"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
    </Wrapper>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  hint?: string
}) {
  return (
    <Wrapper label={label} hint={hint}>
      <input
        type="number"
        min={min}
        step="0.01"
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={INPUT_CLASS}
      />
    </Wrapper>
  )
}

/**
 * ช่องกรอกที่มีรายการให้เลือก แต่ยังพิมพ์ค่าใหม่เองได้ (combobox)
 *
 * ใช้กับช่องที่ดีไซน์วาดเป็น dropdown แต่ตัวเลือกยังไม่มีแหล่งข้อมูลตายตัว
 * อย่างช่องชื่อช่างในป็อปอัป Maintenance Task (SSK-94) ระบบยังไม่มี API
 * พนักงานเลย ถ้าทำเป็น select ปิดตายจะเพิ่มช่างคนใหม่ไม่ได้เลยซึ่งแย่กว่าเดิม
 * ตัวนี้จึงเสนอชื่อที่เคยใช้ในระบบให้เลือก กันสะกดคนเดิมไม่ตรงกัน แต่ยังรับ
 * ชื่อใหม่ได้ พอมี endpoint พนักงานจริงค่อยเปลี่ยนเป็น SelectField
 */
export function ComboField({
  label,
  value,
  onChange,
  options,
  hint,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  hint?: string
  placeholder?: string
}) {
  const listId = `combo-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <Wrapper label={label} hint={hint}>
      <input
        type="text"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </Wrapper>
  )
}

export function SelectField<T extends string | number>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string
  value: T
  onChange: (value: string) => void
  options: { value: T; label: string }[]
  hint?: string
}) {
  return (
    <Wrapper label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
  hint,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  hint?: string
  placeholder?: string
}) {
  return (
    <Wrapper label={label} hint={hint}>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} resize-y`}
      />
    </Wrapper>
  )
}
