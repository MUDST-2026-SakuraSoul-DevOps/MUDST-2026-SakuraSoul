import type { ChargeRecurrence, LeaseExtraCharge, RoomExtraChargeRequest } from '../api/types'
import { MONTH_PATTERN } from './roomRate'

/**
 * ค่าใช้จ่ายพิเศษต่อห้อง (SSK-165) เช่น ที่จอดรถ ค่าเฟอร์นิเจอร์ ใส่เป็นบรรทัดเพิ่มในบิล
 *
 * กติกาที่ใช้ทั้งฟอร์ม ตัวอย่างบิล และ backend จำลอง
 * - รายเดือน: คิดทุกเดือนตั้งแต่ startMonth ถึง endMonth (ไม่กำหนดคือไม่มีกำหนดสิ้นสุด)
 * - ครั้งเดียว: คิดในบิลแรกของสัญญาที่ออกตั้งแต่ startMonth แล้วไม่คิดอีก
 * - ปิดรายการแล้วบิลใหม่ไม่คิด บิลเก่าเก็บบรรทัดเดิมไว้ในตัวเองอยู่แล้ว
 * - สัญญาคิดเฉพาะรายการที่คัดลอกไว้ตอนทำสัญญา (SSK-180) รายการที่ห้องได้เพิ่มทีหลังรอสัญญาใหม่
 */

export const RECURRENCE_LABEL: Record<ChargeRecurrence, string> = {
  ONE_TIME: 'One-time',
  MONTHLY: 'Monthly',
}

const MAX_AMOUNT = 1_000_000

export function validateExtraCharge(charge: RoomExtraChargeRequest): string | null {
  if (charge.label.trim() === '') {
    return 'Please describe the charge'
  }
  if (charge.label.trim().length > 80) {
    return 'The description must be 80 characters or fewer'
  }
  if (!Number.isFinite(charge.amount)) {
    return 'Amount must be a number'
  }
  if (charge.amount < 0) {
    return 'Amount cannot be negative'
  }
  if (charge.amount > MAX_AMOUNT) {
    return 'Amount is too high'
  }
  if (charge.recurrence !== 'ONE_TIME' && charge.recurrence !== 'MONTHLY') {
    return 'Frequency must be ONE_TIME or MONTHLY'
  }
  if (!MONTH_PATTERN.test(charge.startMonth ?? '')) {
    return 'Please choose the first month to charge (YYYY-MM)'
  }
  if (charge.endMonth !== null && charge.endMonth !== undefined && charge.endMonth !== '') {
    if (!MONTH_PATTERN.test(charge.endMonth)) {
      return 'The last month must be YYYY-MM'
    }
    if (charge.endMonth < charge.startMonth) {
      return 'The last month cannot be before the first month'
    }
  }
  return null
}

/**
 * รายการของสัญญาที่ต้องคิดในบิลเดือนนี้ billedChargeIds คือรายการที่บิลก่อนหน้าของสัญญาเดียวกันคิดไปแล้ว
 * ใช้กันรายการครั้งเดียวถูกคิดซ้ำ
 */
export function dueExtraCharges(
  charges: LeaseExtraCharge[] | undefined,
  billingMonth: string,
  billedChargeIds: ReadonlySet<number>,
): LeaseExtraCharge[] {
  return (charges ?? []).filter((charge) => {
    if (!charge.active || charge.startMonth > billingMonth) {
      return false
    }
    if (charge.recurrence === 'ONE_TIME') {
      return !billedChargeIds.has(charge.chargeId)
    }
    return charge.endMonth === null || billingMonth <= charge.endMonth
  })
}

/** id ของรายการที่บิลชุดนี้คิดไปแล้ว อ่านจาก chargeId ในบรรทัดของใบเสร็จ */
export function billedChargeIds(receipts: { items: { chargeId?: number | null }[] }[]): Set<number> {
  const ids = new Set<number>()
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      if (item.chargeId !== undefined && item.chargeId !== null) {
        ids.add(item.chargeId)
      }
    }
  }
  return ids
}
