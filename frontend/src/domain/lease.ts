import type { Lease, LeaseStatus, RoomType } from '../api/types'

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

/**
 * ค่าเช่าตั้งต้นตามประเภทห้อง (BUG-C2 ใน SSK-112)
 *
 * ก่อนหน้านี้ฟอร์ม Create/Edit Contract ใช้ baseRent ของห้อง ซึ่งกำหนดจากชั้น
 * ที่ห้องนั้นอยู่ (ดู mockApi.ts) ไม่ได้แยกตามว่าเป็น Single หรือ Double Bedroom
 * เลย QA ทักว่าค่าเช่าควรผูกกับประเภทห้อง จึงย้ายมาเก็บที่นี่แทน
 *
 * ยังปล่อยให้แอดมินพิมพ์ทับในช่อง Rent Amount ได้เหมือนเดิม ค่านี้เป็นแค่
 * ค่าตั้งต้นตอนเลือกห้องหรือเปลี่ยนประเภทห้อง ไม่ใช่ค่าที่ล็อกตายตัว
 */
export const ROOM_TYPE_RENT: Record<RoomType, number> = {
  SINGLE: 3500,
  DOUBLE: 4500,
}

export function rentForRoomType(type: RoomType): number {
  return ROOM_TYPE_RENT[type]
}
