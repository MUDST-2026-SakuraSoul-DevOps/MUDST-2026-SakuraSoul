import type { MaintenancePrediction, PredictionConfidence } from '../api/types'

/**
 * ทำนายรอบซ่อมบำรุงครั้งถัดไปด้วยกฎง่าย ๆ ไม่ใช้ AI ไม่เรียกบริการภายนอก (SSK-173, โบนัส)
 *
 * แยกกลุ่มตาม (ห้อง, ประเภทงาน) จากใบแจ้งซ่อมที่ปิดแล้ว ใช้วันปิดงาน (ไม่มีใช้วันนัด ไม่มีอีกใช้วันแจ้ง)
 * 1. ต้องมีอย่างน้อย 3 ครั้ง ไม่งั้นไม่ทำนาย (ไม่เดา)
 * 2. ช่วงห่างระหว่างครั้ง (วัน) → มัธยฐาน ทนต่อค่าผิดปกติกว่าค่าเฉลี่ย
 * 3. วันที่คาดการณ์ = ครั้งล่าสุด + มัธยฐาน
 * 4. ความมั่นใจจาก MAD / มัธยฐาน (MAD = มัธยฐานของ |ช่วงห่าง − มัธยฐาน|)
 *    ≤ 0.1 สูง · ≤ 0.3 กลาง · มากกว่านั้นต่ำ
 *
 * ผลขึ้นกับข้อมูลอย่างเดียว รันซ้ำได้ผลเดิมทุกครั้ง (deterministic)
 */

export const MIN_OCCURRENCES = 3

const DAY_MS = 86_400_000

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS)
}

function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function confidenceOf(intervals: number[]): PredictionConfidence {
  const m = median(intervals)
  if (m <= 0) return 'LOW'
  const mad = median(intervals.map((v) => Math.abs(v - m)))
  const spread = mad / m
  return spread <= 0.1 ? 'HIGH' : spread <= 0.3 ? 'MEDIUM' : 'LOW'
}

/** ทำนายจากวันที่เกิดงาน (YYYY-MM-DD หรือ timestamp) ข้อมูลไม่พอคืน null */
export function predictNext(dates: string[]): Omit<MaintenancePrediction, 'roomId' | 'roomNumber' | 'maintenanceType'> | null {
  const days = [...new Set(dates.map(dayNumber))].sort((a, b) => a - b)
  if (days.length < MIN_OCCURRENCES) {
    return null
  }
  const intervals = days.slice(1).map((day, i) => day - days[i])
  const medianIntervalDays = Math.round(median(intervals))
  const last = days[days.length - 1]
  return {
    lastDate: fromDayNumber(last),
    medianIntervalDays,
    predictedDate: fromDayNumber(last + medianIntervalDays),
    confidence: confidenceOf(intervals),
    sampleSize: days.length,
  }
}

export interface ClosedJob {
  roomId: number
  roomNumber: string
  maintenanceType: string
  date: string
}

/** ทำนายทุกกลุ่ม (ห้อง, ประเภทงาน) ที่ข้อมูลพอ เรียงตามวันที่คาดการณ์ใกล้ที่สุดก่อน */
export function predictAll(jobs: ClosedJob[]): MaintenancePrediction[] {
  const groups = new Map<string, ClosedJob[]>()
  for (const job of jobs) {
    const key = `${job.roomId}|${job.maintenanceType}`
    groups.set(key, [...(groups.get(key) ?? []), job])
  }
  const predictions: MaintenancePrediction[] = []
  for (const group of groups.values()) {
    const result = predictNext(group.map((j) => j.date))
    if (result) {
      const { roomId, roomNumber, maintenanceType } = group[0]
      predictions.push({ roomId, roomNumber, maintenanceType, ...result })
    }
  }
  return predictions.sort(
    (a, b) => a.predictedDate.localeCompare(b.predictedDate) || a.roomNumber.localeCompare(b.roomNumber),
  )
}

/** รอบแจ้งเตือนที่ใกล้กับช่วงห่างที่สุด ใช้เติมฟอร์ม Add Reminder จากคำแนะนำ */
export function suggestedFrequency(medianIntervalDays: number): 'Monthly' | 'Quarterly' | 'Annual' {
  if (medianIntervalDays <= 45) return 'Monthly'
  if (medianIntervalDays <= 180) return 'Quarterly'
  return 'Annual'
}

export const CONFIDENCE_LABEL: Record<PredictionConfidence, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
}
