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

/**
 * ช่องกรอกตัวเลข
 *
 * step ตั้งต้นเป็น 1 เพราะทุกช่องตัวเลขในแอปนี้เป็นจำนวนเต็มหมด ทั้งจำนวนชิ้น
 * ของในสต็อกและยอดเงิน (เงินเป็นเยนซึ่งไม่มีหน่วยย่อย) ของเดิมฮาร์ดโค้ดไว้เป็น
 * 0.01 ทั้งที่เป็น component กลาง กดลูกศรที่ช่อง Min Stock ทีเดียวจึงได้ 49.98
 * แทนที่จะเป็น 49 (SSK-90) และช่องค่าเช่าในป็อปอัปเช็คอินก็เจอแบบเดียวกัน
 *
 * ใครที่ต้องการทศนิยมจริง ๆ ส่ง step มาเองได้ แต่ตอนนี้ยังไม่มีช่องไหนต้องใช้
 */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
  hint?: string
}) {
  return (
    <Wrapper label={label} hint={hint}>
      <input
        type="number"
        min={min}
        step={step}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={INPUT_CLASS}
      />
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
