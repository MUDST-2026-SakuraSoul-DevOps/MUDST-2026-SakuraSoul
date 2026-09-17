/**
 * เงินในระบบเป็นเยน ไม่ใช่บาท ตามที่ทีมเคาะกับดีไซน์รอบล่าสุด
 * (เห็นชัดในเฟรม Payment Management ที่เขียน "Total Value: ¥1,200,000")
 *
 * เยนไม่มีหน่วยย่อย จึงไม่แสดงทศนิยม ต่างจากบาทที่เดิมตั้งไว้สองตำแหน่ง
 * ถ้าโชว์ ¥45,000.00 คนญี่ปุ่นอ่านแล้วสะดุดทันที
 */
const YEN = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * ตัวจัดรูปแบบวันที่ตามโซนเวลาไทย ใช้ en-CA เพราะมันให้ YYYY-MM-DD อยู่แล้ว
 * ไม่ต้องประกอบสตริงจากวัน เดือน ปี เอง ซึ่งพลาดเรื่องเลขศูนย์นำหน้าได้ง่าย
 */
const BANGKOK_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })

/** รูปแบบวันที่ที่โชว์บนหน้าจอ ตรงกับดีไซน์ที่เขียนแบบ "21 Jul, 2026" */
const DISPLAY_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** ยอดเงินพร้อมตัวคั่นหลักพัน ไม่รวมสัญลักษณ์สกุลเงิน */
export function yen(value: number): string {
  return YEN.format(value)
}

/** ยอดเงินพร้อมสัญลักษณ์เยนนำหน้า ใช้ตรงที่ต้องบอกสกุลเงินให้ชัด */
export function yenAmount(value: number): string {
  return `¥${YEN.format(value)}`
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

/**
 * วันที่จาก backend มาเป็น ISO เช่น 2026-08-11 แสดงผลเป็น 11 Aug 2026
 *
 * รับได้ทั้งวันที่ล้วนและ timestamp เต็ม เพราะบาง endpoint เช่น
 * GET /api/apartment-config ส่ง updatedAt มาเป็น timestamp ISO-8601
 * (2026-09-06T08:15:30.000Z) ไม่ใช่แค่วันที่ ถ้าเอาไปต่อท้ายด้วย T00:00:00 อีก
 * จะกลายเป็นสตริงที่ parse ไม่ออก แล้วหน้าเว็บจะโชว์ Invalid Date
 */
export function displayDate(value: string | null): string {
  if (!value) {
    return '-'
  }
  // มี T อยู่แล้วแปลว่าเป็น timestamp เต็ม ส่งให้ Date ตรง ๆ ได้เลย
  const parsed = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)
  return DISPLAY_DATE.format(parsed)
}

/**
 * เหลืออีกกี่วันถึงวันที่กำหนด ติดลบแปลว่าเลยมาแล้ว
 *
 * ใช้ติดป้าย "lease ending soon" บนการ์ดห้องในแดชบอร์ด รับ today เข้ามาได้
 * เพื่อให้เทสกำหนดวันอ้างอิงเองได้ ไม่ต้องไปยุ่งกับนาฬิกาของเครื่อง
 */
export function daysUntil(value: string, today = new Date()): number {
  const target = new Date(`${value}T00:00:00`).getTime()
  const from = new Date(`${todayInBangkok(today)}T00:00:00`).getTime()
  return Math.round((target - from) / 86_400_000)
}
