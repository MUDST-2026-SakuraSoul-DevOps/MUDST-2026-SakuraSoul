/**
 * เงินในระบบเป็นบาท (SSK-126) — SSK-105 เคยเปลี่ยนเป็นเยนตามเฟรม Figma ที่เขียน
 * "Total Value: ¥1,200,000" แต่อาจารย์ feedback วันที่ 13 ก.ย. ให้กลับเป็นบาท
 *
 * บาทมีสตางค์ จึงแสดงทศนิยมสองตำแหน่งเสมอแม้ยอดจะลงตัว ตรงกับเอกสาร PDF ฝั่ง
 * backend (DocumentFormat.money() ใน #88) ใบเสร็จบนหน้าเว็บกับใบที่พิมพ์ออกมา
 * จะได้เขียนยอดเดียวกันเป๊ะ ไม่ใช่ฝั่งหนึ่ง ฿3,500 อีกฝั่ง ฿3,500.00
 *
 * ตัวเลขใช้ en-US เพราะหน้าเว็บเป็นภาษาอังกฤษทั้งระบบตั้งแต่ SSK-105 ส่วนนั้นไม่ได้ย้อน
 */
const BAHT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

/** ยอดเงินพร้อมตัวคั่นหลักพันและทศนิยมสองตำแหน่ง ไม่รวมสัญลักษณ์สกุลเงิน */
export function baht(value: number): string {
  return BAHT.format(value)
}

/** ยอดเงินพร้อมสัญลักษณ์บาทนำหน้า ใช้ตรงที่ต้องบอกสกุลเงินให้ชัด */
export function bahtAmount(value: number): string {
  return `฿${BAHT.format(value)}`
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
 * วันตามเวลาไทยของค่าที่ได้จาก backend รูปแบบ YYYY-MM-DD
 *
 * รับได้ทั้งวันที่ล้วน (2026-09-25) และเวลาเต็ม (2026-09-25T17:30:00Z) เวลาเต็มต้องแปลง
 * เป็นวันไทยก่อน ตัดสิบตัวแรกเฉย ๆ ไม่ได้ เพราะนั่นคือวันตาม UTC ไทยเร็วกว่า UTC เจ็ดชั่วโมง
 * ใบที่แจ้งตั้งแต่เที่ยงคืนถึงก่อนเจ็ดโมงเช้าเวลาไทยจะถูกนับเป็นเมื่อวาน
 * เหตุผลเดียวกับ todayInBangkok ใช้กับตัวเลข Today's Activity ของแท็บ Maintenance Log (SSK-131)
 */
export function dateInBangkok(value: string): string {
  return value.includes('T') ? BANGKOK_DATE.format(new Date(value)) : value.slice(0, 10)
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
 * ตัวอักษรย่อจากชื่อ ใช้แทนรูปโปรไฟล์ตอนที่ยังไม่มีรูปจริง
 *
 * เอาแค่สองคำแรกพอ ชื่อญี่ปุ่นหรือไทยเต็ม ๆ ยาวกว่านั้นได้ ถ้าเอาทุกคำมาย่อจะล้น
 * กรอบเล็ก ๆ ของ avatar ส่วนชื่อว่างคืนสตริงว่าง ให้ฝั่งที่เรียกตัดสินเองว่าจะ
 * โชว์อะไรแทน
 */
export function initialsFrom(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
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

/**
 * ตัวลงท้ายของวันที่แบบภาษาอังกฤษ 1st 2nd 3rd 4th … 11th 12th 13th … 21st 22nd
 *
 * ย้ายมาจาก ScheduledBillingDialog ให้ใช้ร่วมกันทั้งหน้า Payments เดิมหลายที่เขียน th ตายตัว
 * วันที่ในรอบบิลจึงขึ้นเป็น 1th / 22th (SSK-141) ส่วน 11-13 เป็นข้อยกเว้นของภาษาอังกฤษ
 */
export function ordinalSuffix(day: number): string {
  const lastTwo = day % 100
  if (lastTwo >= 11 && lastTwo <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}
