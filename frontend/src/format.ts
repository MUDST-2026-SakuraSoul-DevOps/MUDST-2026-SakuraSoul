const BAHT = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const THAI_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function baht(value: number): string {
  return BAHT.format(value)
}

/** วันที่จาก backend มาเป็น ISO เช่น 2026-08-11 แสดงผลเป็น พ.ศ. ตามที่คนไทยอ่าน */
export function thaiDate(value: string | null): string {
  if (!value) {
    return '-'
  }
  return THAI_DATE.format(new Date(`${value}T00:00:00`))
}
