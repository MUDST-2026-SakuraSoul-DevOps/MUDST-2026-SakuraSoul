import type { BillingSchedule, BillingScheduleRequest } from '../api/types'
import { todayInBangkok } from '../format'

/**
 * ค่าตั้งเวลาเตือนใบค้างรายเดือนของหน้า Payments (SSK-143) เก็บที่ backend ผ่าน /api/billing-schedule
 * เดิมเป็นแบบจำลองที่เก็บใน localStorage (SSK-130 / SSK-141)
 *
 * เป็นฝาแฝดของ BillingScheduleRules ฝั่ง backend ทั้งข้อความเตือนและกฎรอบต้องตรงกันเป๊ะ หน้าเว็บใช้ฝั่งนี้เตือน
 * ก่อนกดบันทึกและโชว์ตัวอย่างรอบถัดไปในป็อปอัป ส่วน backend จำลองใช้ตัดสินว่าจะตอบ 400 ไหมและคิด nextRunAt
 * ตัวตัดสินจริงคือ backend แก้ที่นี่แล้วต้องไปแก้อีกฝั่งด้วยเสมอ
 *
 * แยกไฟล์ออกจาก ScheduledBillingDialog เพราะไฟล์ component ที่ export ค่าคงที่ด้วยทำให้ fast refresh
 * ของ Vite ใช้ไม่ได้ (eslint react-refresh/only-export-components)
 */

/** ค่าตั้งต้นเดียวกับแถวที่ V15 ใส่ไว้ ปิดเสมอ ถ้าเปิดไว้ตั้งแต่ต้นระบบจะส่งอีเมลเองโดยไม่มีใครตั้งใจ (SSK-141) */
export const DEFAULT_BILLING_SCHEDULE_REQUEST: BillingScheduleRequest = {
  enabled: false,
  dayOfMonth: 25,
  sendTime: '09:00',
}

/** ไทยไม่มี daylight saving เวลาไทยจึงเร็วกว่า UTC เจ็ดชั่วโมงตลอดทั้งปี */
const BANGKOK_OFFSET_HOURS = 7

/** รับ "09:00" หรือ "09:00:30" แบบเดียวกับ LocalTime.parse ของ backend ชั่วโมงต้องสองหลัก */
const SEND_TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/

function parseSendTime(value: string): { hours: number; minutes: number } | null {
  const match = SEND_TIME.exec(value.trim())
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null
}

/**
 * ตรวจค่าก่อนบันทึก คืนข้อความของช่องแรกที่ผิด หรือ null เมื่อถูกทุกช่อง
 * ลำดับและข้อความเดียวกับ BillingScheduleRules.validate ฝั่ง backend
 */
export function validateBillingSchedule(request: Partial<BillingScheduleRequest>): string | null {
  if (typeof request.enabled !== 'boolean') {
    return 'Please choose whether the schedule is enabled'
  }
  if (typeof request.dayOfMonth !== 'number' || Number.isNaN(request.dayOfMonth)) {
    return 'Please choose the billing day'
  }
  if (!Number.isInteger(request.dayOfMonth) || request.dayOfMonth < 1 || request.dayOfMonth > 31) {
    return 'Billing day must be between 1 and 31'
  }
  if (typeof request.sendTime !== 'string' || request.sendTime.trim() === '') {
    return 'Please choose the send time'
  }
  if (parseSendTime(request.sendTime) === null) {
    return 'The send time must be in HH:MM format'
  }
  return null
}

/** "10:30:59" เหลือ "10:30" เพราะ backend เก็บแค่ระดับนาที ค่าที่อ่านไม่ออกคืนตามเดิม */
export function normalizeSendTime(sendTime: string): string {
  const time = parseSendTime(sendTime)
  return time ? `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}` : sendTime
}

/** เดือน "YYYY-MM" ตามเวลาไทยของเวลานั้น ตีหนึ่งวันที่ 1 ต.ค. เวลาไทยเป็นเดือน ต.ค. ถึงตาม UTC จะยังเป็น ก.ย. */
export function billingPeriodOf(now: Date): string {
  return todayInBangkok(now).slice(0, 7)
}

function nextPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * รอบของเดือนหนึ่งเป็นเวลา UTC แบบ ISO เช่นวันที่ 25 เวลา 09:00 ไทยของ ต.ค. 2026 คือ 2026-10-25T02:00:00.000Z
 * เดือนที่สั้นกว่าวันที่ตั้งไว้ใช้วันสุดท้ายของเดือน ตั้ง 31 แล้วเดือนกุมภาพันธ์ได้วันที่ 28 หรือ 29
 */
export function billingSlotAt(period: string, dayOfMonth: number, sendTime: string): string {
  const [year, month] = period.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const time = parseSendTime(sendTime) ?? { hours: 0, minutes: 0 }
  return new Date(
    Date.UTC(year, month - 1, Math.min(dayOfMonth, lastDay), time.hours - BANGKOK_OFFSET_HOURS, time.minutes),
  ).toISOString()
}

/**
 * รอบถัดไป กฎเดียวกับ BillingScheduleRules.nextRunAt ฝั่ง backend คืน null เมื่อปิดอยู่
 *
 * ถ้าเดือนนี้ยังไม่เคยรัน และรอบของเดือนนี้อยู่หลังเวลาที่กดบันทึก รอบถัดไปคือรอบของเดือนนี้ (ถึงจะเลยไปแล้วก็ตาม
 * งานจะส่งตามในนาทีถัดไป) นอกนั้นคือรอบของเดือนหน้า ค่าใหม่จึงมีผลตั้งแต่รอบแรกหลังกดบันทึก เปิดใช้วันที่ 26
 * โดยตั้งวันที่ 25 จะรอเดือนหน้า ไม่ส่งทันที
 */
export function nextBillingRunAt(
  schedule: Pick<BillingSchedule, 'enabled' | 'dayOfMonth' | 'sendTime' | 'updatedAt'>,
  ranThisMonth: boolean,
  now: Date,
): string | null {
  if (!schedule.enabled) {
    return null
  }
  const period = billingPeriodOf(now)
  const thisMonthSlot = billingSlotAt(period, schedule.dayOfMonth, schedule.sendTime)
  if (!ranThisMonth && Date.parse(thisMonthSlot) > Date.parse(schedule.updatedAt)) {
    return thisMonthSlot
  }
  return billingSlotAt(nextPeriod(period), schedule.dayOfMonth, schedule.sendTime)
}
