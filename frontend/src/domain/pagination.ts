/**
 * แบ่งรายการเป็นหน้า ใช้ร่วมกันหลายตาราง (SSK-136)
 *
 * เดิมหน้า Tenants เขียนปุ่มหน้าตายตัวไว้ [1, 2, 3] มีผู้เช่าแค่หน้าเดียวก็ยังกดไปหน้า 3 ได้
 * แล้วเจอตารางว่าง และถ้ามีเกินสามหน้าก็เปิดดูส่วนที่เหลือไม่ได้ หน้า Contracts แก้เรื่องเดียวกัน
 * ไว้แล้วใน SSK-115 ส่วนคำนวณจึงแยกมาไว้ที่นี่ ส่วนหน้าตาปุ่มยังเป็นของแต่ละหน้าตาม Figma
 *
 * หน้าที่ขอมาถูกบีบให้อยู่ในช่วง 1 ถึงหน้าสุดท้ายเสมอ กรองหรือลบจนหน้าหายไปก็ไม่ค้างที่หน้าว่าง
 */
export interface Page<T> {
  items: T[]
  /** หน้าที่แสดงจริงหลังบีบแล้ว เริ่มที่ 1 */
  page: number
  /** อย่างน้อย 1 หน้าเสมอ แม้ไม่มีรายการ */
  totalPages: number
  total: number
  /** ลำดับของรายการแรกและรายการสุดท้ายในหน้านี้ นับจาก 1 ไม่มีรายการเป็น 0 ทั้งคู่ */
  from: number
  to: number
}

export function paginate<T>(items: T[], requestedPage: number, pageSize: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const start = (page - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)
  return {
    items: pageItems,
    page,
    totalPages,
    total: items.length,
    from: pageItems.length === 0 ? 0 : start + 1,
    to: start + pageItems.length,
  }
}
