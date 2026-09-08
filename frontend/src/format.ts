const BAHT = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * ตัวจัดรูปแบบวันที่ตามโซนเวลาไทย ใช้ en-CA เพราะมันให้ YYYY-MM-DD อยู่แล้ว
 * ไม่ต้องประกอบสตริงจากวัน เดือน ปี เอง ซึ่งพลาดเรื่องเลขศูนย์นำหน้าได้ง่าย
 */
const BANGKOK_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })

const THAI_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function baht(value: number): string {
  return BAHT.format(value)
}

/**
 * วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD
 *
 * ห้ามใช้ new Date().toISOString().slice(0, 10) หาว่าวันนี้คือวันอะไร เพราะ
 * toISOString คืนเวลา UTC ส่วนไทยเป็น GMT+7 ช่วงเที่ยงคืนถึงเกือบเจ็ดโมงเช้า
 * ตามเวลาไทยมันจะตอบเป็นวันเมื่อวาน ผลคือสัญญาที่หมดอายุไปแล้วยังขึ้นว่า
 * Active และปุ่มยกเลิกยังกดได้ ซึ่ง QA เจอตอนรีวิว
 *
 * ทุกที่ที่ต้องรู้ว่า "วันนี้" คือวันอะไร ให้เรียกตัวนี้ที่เดียว จะได้ไม่ต้อง
 * ไล่แก้ทีละจุดอีกรอบ
 */
export function todayInBangkok(now = new Date()): string {
  return BANGKOK_DATE.format(now)
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
  const from = new Date(`${todayInBangkok(today)}T00:00:00`).getTime()
  return Math.round((target - from) / 86_400_000)
}
