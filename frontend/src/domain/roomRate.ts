import type { RoomRate, RoomRateRequest } from '../api/types'
import { validateApartmentConfig } from './apartmentConfig'

/**
 * อัตราต่อห้องตามช่วงเวลา (SSK-162)
 *
 * แต่ละห้องมีประวัติอัตราแบบเพิ่มอย่างเดียว แถวหนึ่งมีผลตั้งแต่เดือนที่ระบุ (effectiveFrom) ไปจนกว่าจะมี
 * แถวที่ใหม่กว่า อัตรา ณ เดือนหนึ่งคือแถวล่าสุดที่ effectiveFrom <= เดือนนั้น ถ้าไม่มีเลยใช้ค่าตั้งต้นเดิม
 * (ค่าเช่าตามประเภทห้อง + Apartment Config)
 *
 * กติกาจากคอมเมนต์ของอาจารย์ใน SSK-162 และ SSK-180: อัตราต่อห้องมีผลกับ**สัญญาที่ทำหลังวันมีผล**เท่านั้น
 * สัญญาที่ทำไปแล้วใช้อัตราที่ล็อกไว้ตอนเซ็นตลอดอายุสัญญา บิลเก่าก็เก็บสำเนาอัตราไว้ในตัวเองอยู่แล้ว
 * จึงไม่มีบิลไหนเปลี่ยนตามอัตราใหม่
 *
 * แยกเป็น pure function เพราะใช้ทั้งฟอร์มและ backend จำลองเหมือน apartmentConfig.ts
 */

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** กันพิมพ์ผิดเหมือนอัตราทั้งอาคาร ค่าเช่าห้องที่นี่ราว 3,500-4,500 เพดาน 1 ล้านเผื่อไว้มากแล้ว */
const MAX_MONTHLY_RENT = 1_000_000

/** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อกรอกถูกทุกช่อง ข้อความตรงกับที่ backend ต้องตอบ 400 */
export function validateRoomRate(rate: RoomRateRequest): string | null {
  if (!MONTH_PATTERN.test(rate.effectiveFrom ?? '')) {
    return 'Please choose the month the rate starts (YYYY-MM)'
  }
  if (!Number.isFinite(rate.monthlyRent)) {
    return 'Monthly rent must be a number'
  }
  if (rate.monthlyRent < 0) {
    return 'Monthly rent cannot be negative'
  }
  if (rate.monthlyRent > MAX_MONTHLY_RENT) {
    return 'Monthly rent is too high'
  }
  return validateApartmentConfig(rate)
}

/** แถวที่มีผล ณ เดือนนั้น หรือ null ถ้ายังไม่มีอัตราเฉพาะห้องที่เริ่มแล้ว */
export function rateInEffect<R extends Pick<RoomRate, 'effectiveFrom'>>(rates: R[], month: string): R | null {
  let current: R | null = null
  for (const rate of rates) {
    if (rate.effectiveFrom <= month && (current === null || rate.effectiveFrom > current.effectiveFrom)) {
      current = rate
    }
  }
  return current
}

/** ใหม่ก่อนเก่า แบบที่ตาราง Rate history แสดง */
export function sortRatesNewestFirst<R extends Pick<RoomRate, 'effectiveFrom'>>(rates: R[]): R[] {
  return [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
}

/** เดือนถัดจาก YYYY-MM */
export function nextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "2026-12" เป็น "Dec 2026" */
export function displayMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return MONTH_LABEL.format(new Date(Date.UTC(year, m - 1, 1)))
}

export function retroactiveRateMessage(month: string): string {
  return `A bill for ${month} or later has already been issued for this unit. Choose a later month.`
}
