import type { Lease, LeaseStatus } from '../api/types'
import { bahtAmount } from '../format'

/**
 * กฎเรื่องช่วงวันที่ของสัญญาเช่า เขียนแยกเป็น pure function เพราะใช้สองที่
 *
 * 1. ฝั่งหน้าเว็บ ใช้เตือนผู้ใช้ทันทีก่อนกดส่ง จะได้ไม่ต้องรอ round trip
 * 2. ฝั่ง mock API ใช้ตัดสินว่าจะตอบ 409 ไหม ให้พฤติกรรมเหมือน backend จริง
 *
 * ของจริงตัวตัดสินสุดท้ายคือ exclusion constraint ใน PostgreSQL
 * (daterange(start_date, end_date, '[]') WITH &&) ตามที่ README ระบุไว้
 * ฟังก์ชันนี้จงใจใช้ช่วงแบบปิดทั้งสองด้าน '[]' ให้ตรงกับ constraint นั้น
 * แปลว่าสัญญาเก่าจบวันที่ 31 ส.ค. กับสัญญาใหม่เริ่มวันที่ 31 ส.ค. ถือว่าทับกัน
 *
 * ห้ามใช้ฟังก์ชันนี้แทน constraint ฝั่ง database เพราะสองคำขอที่เข้ามาพร้อมกัน
 * จะเช็คผ่านทั้งคู่ (US-05-S2) ตัวนี้มีไว้ให้ข้อความ error อ่านรู้เรื่องเท่านั้น
 */

/** ใช้แทน "ไม่มีวันจบ" เวลาเทียบช่วง วันที่ไกลพอที่ไม่มีสัญญาจริงไปถึง */
const OPEN_ENDED = '9999-12-31'

export function overlaps(
  a: { startDate: string; endDate: string | null },
  b: { startDate: string; endDate: string | null },
): boolean {
  const aEnd = a.endDate ?? OPEN_ENDED
  const bEnd = b.endDate ?? OPEN_ENDED
  return a.startDate <= bEnd && b.startDate <= aEnd
}

/** true เมื่อช่วงวันที่กรอกมาไม่สมเหตุสมผล (วันจบมาก่อนวันเริ่ม) */
export function isBackwardsRange(startDate: string, endDate: string | null): boolean {
  return endDate !== null && endDate < startDate
}

/**
 * หาสัญญา active ที่ชนกับช่วงที่จะสร้าง/แก้ ตัดสัญญาที่กำลังแก้ตัวเองออกด้วย
 * (ไม่งั้นตอนกดบันทึกโดยไม่เปลี่ยนวันที่ จะฟ้องว่าชนกับตัวเอง)
 */
export function findConflictingLease(
  leases: Lease[],
  candidate: { roomId: number; startDate: string; endDate: string | null },
  ignoreLeaseId?: number,
): Lease | null {
  return (
    leases.find(
      (lease) =>
        lease.id !== ignoreLeaseId &&
        lease.roomId === candidate.roomId &&
        lease.status === 'ACTIVE' &&
        overlaps(lease, candidate),
    ) ?? null
  )
}

/** ข้อความบอกผู้ใช้ว่าห้องไม่ว่างช่วงไหน ตาม US-05-S1 ที่ขอให้ "บอกชัดเจน" */
export function overlapMessage(conflict: Lease): string {
  const until = conflict.endDate ?? 'no end date'
  return `Unit ${conflict.roomNumber} is not available from ${conflict.startDate} to ${until} because ${conflict.tenantName} already has a lease for it`
}

/**
 * สถานะสัญญา ณ วันที่อ้างอิง ใช้ตอนกรองรายชื่อผู้เช่าตามสถานะ (US-07-S2)
 *
 * ที่ไม่ดูแค่ฟิลด์ status ตรง ๆ เพราะสัญญาที่เลยวันจบไปแล้วแต่ยังไม่มีใครกดปิด
 * ในระบบ ก็ไม่ควรนับเป็น active ให้ผู้ใช้เห็น
 */
export function leaseStatusOn(lease: Lease, today: string): LeaseStatus {
  if (lease.status === 'ENDED') {
    return 'ENDED'
  }
  if (lease.endDate !== null && lease.endDate < today) {
    return 'ENDED'
  }
  return 'ACTIVE'
}

/*
  SSK-127 ค่าเช่าฟิกตามประเภทห้อง (feedback อาจารย์ 13 ก.ย. ข้อ 5)

  ค่าเช่าของสัญญามาจาก backend อย่างเดียว ตอนสร้างสัญญา backend เอาค่าเช่าจาก
  ประเภทห้องเอง (LeaseService.rentForRoomType, V12) แล้วเก็บไว้ที่ lease.monthlyRent
  หน้าเว็บจึงไม่ต้องรู้ราคาของแต่ละประเภทห้องอีก และห้ามคำนวณหรือเดาเอง

  เดิมตรงนี้มีฟังก์ชันที่เขียนราคาตายตัวตามชื่อผู้เช่าให้ตรงกับตัวอย่างใน Figma
  (Tanaka ได้ 35,000, Sato ได้ 500,000 ต่อปี ฯลฯ) ใช้กับข้อมูลจริงแล้วผิดทันที
  เช่นผู้เช่าชื่อสมชายที่เช่าเดือนละ 3,500 ขึ้นเป็น 400,000 ต่อปี จึงลบทิ้ง
*/

/**
 * ค่าเช่าที่แสดงในตาราง เอกสาร และ Preview ของสัญญา
 *
 * ข้อมูลมีแค่ค่าเช่ารายเดือนกับรอบบิล ไม่มียอดรายปีเก็บไว้ที่ไหน จึงไม่คูณ 12 เอง
 * สัญญาที่เก็บเงินรายปีบอกไว้ที่ label แทน
 */
export function leaseRentInfo(lease: Lease): { amount: string; label: string } {
  return {
    amount: bahtAmount(lease.monthlyRent),
    label: lease.billingCycle === 'YEARLY' ? 'Rent / month · billed yearly' : 'Rent / month',
  }
}

/**
 * เงินมัดจำที่พิมพ์ลงเอกสารสัญญา ใช้ค่าที่บันทึกไว้ในสัญญาเท่านั้น
 *
 * ไม่เดาเป็นค่าเช่าคูณสองแทน เพราะเป็นเอกสารที่ผู้เช่าเซ็นจริง ไม่มีข้อมูลก็บอกตรง ๆ
 * แบบเดียวกับช่องอื่นในเอกสารสัญญา (SSK-116)
 */
export function leaseDepositText(lease: Lease): string {
  return lease.securityDeposit === undefined ? 'Not provided' : bahtAmount(lease.securityDeposit)
}

export type LeaseDisplayStatus = 'Active' | 'Ending Soon' | 'Ended'

/** สัญญาที่เหลือไม่เกินกี่วันถึงจะขึ้นว่า Ending Soon */
export const ENDING_SOON_DAYS = 30

/**
 * สถานะที่แสดงในตารางสัญญา คิดจากวันที่ของสัญญาจริง
 *
 * ตัดสถานะ Pending Signature ที่เคยมีออก เพราะระบบไม่ได้เก็บว่าเซ็นแล้วหรือยัง
 * เดิมขึ้นสถานะนี้ให้เฉพาะผู้เช่าชื่อ Sato เพื่อให้ตรงกับ Figma
 */
export function leaseDisplayStatus(lease: Lease, today: string): LeaseDisplayStatus {
  if (leaseStatusOn(lease, today) === 'ENDED') {
    return 'Ended'
  }
  if (lease.endDate !== null) {
    const daysLeft = Math.round(
      (new Date(`${lease.endDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
    )
    if (daysLeft <= ENDING_SOON_DAYS) {
      return 'Ending Soon'
    }
  }
  return 'Active'
}
