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

/**
 * เหลืออีกกี่วันถึงวันที่กำหนด ติดลบแปลว่าเลยมาแล้ว
 *
 * ใช้ติดป้าย "สัญญาใกล้หมด" บนการ์ดห้องในแดชบอร์ด รับ today เข้ามาได้เพื่อให้
 * เทสกำหนดวันอ้างอิงเองได้ ไม่ต้องไปยุ่งกับนาฬิกาของเครื่อง
 */
export function daysUntil(value: string, today = new Date()): number {
  const target = new Date(`${value}T00:00:00`).getTime()
  const from = new Date(
    `${today.toISOString().slice(0, 10)}T00:00:00`,
  ).getTime()
  return Math.round((target - from) / 86_400_000)
}
