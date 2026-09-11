/**
 * กฎของหน้า Appliance Rental ที่ไม่เกี่ยวกับการวาดหน้าจอ
 *
 * แยกออกมาเป็น pure function ด้วยเหตุผลเดียวกับ maintenanceBoard คือเงื่อนไข
 * ว่าอะไรกรอกได้บ้างเป็นส่วนที่พังเงียบที่สุด และป็อปอัปสองใบ (Add กับ Edit)
 * ใช้เงื่อนไขชุดเดียวกัน ถ้าเขียนไว้ในตัว component เงื่อนไขจะเริ่มเพี้ยนจากกัน
 *
 * ฟีเจอร์นี้ยังไม่มี endpoint ฝั่ง backend เลยสักตัว (ดูคอมเมนต์หัวไฟล์
 * pages/AppliancesPage.tsx) ข้อมูลจึงอยู่ใน state ของหน้าเท่านั้น พอมี API
 * จริงค่อยเปลี่ยนที่หน้าให้ยิง API แทน โดยไม่ต้องแตะกฎในไฟล์นี้
 */

export const APPLIANCE_CATEGORIES = ['Kitchen', 'Laundry', 'Living', 'Bedroom'] as const

export type ApplianceCategory = (typeof APPLIANCE_CATEGORIES)[number]

export const RENTAL_STATUSES = ['Pending', 'Active', 'Returned'] as const

export type RentalStatus = (typeof RENTAL_STATUSES)[number]

/** รายการเครื่องใช้ที่ตึกมีให้เช่า */
export interface CatalogItem {
  id: number
  name: string
  sku: string
  category: ApplianceCategory
  /** ค่าเช่าต่อเดือน เก็บเป็นตัวเลข ไม่ใช่สตริงที่พิมพ์สัญลักษณ์เงินมาเอง */
  monthlyFee: number
  /** เงินมัดจำ คืนเมื่อส่งของกลับ */
  deposit: number
  /** จำนวนที่ตึกมีทั้งหมด */
  owned: number
  /** ต่ำกว่านี้ถือว่าใกล้หมด ติดป้าย Low stock */
  lowStockAt: number
}

/** ใบขอเช่าของห้องหนึ่ง */
export interface RentalRequest {
  id: number
  room: string
  /** อ้างถึง CatalogItem.sku ไม่ใช่ชื่อ เพราะชื่อแก้ทีหลังได้ */
  sku: string
  /** ค่าเช่าที่ตกลงกันตอนทำสัญญา ไม่เปลี่ยนตามราคาใหม่ในแคตตาล็อก */
  monthlyFee: number
  deposit: number
  startDate: string
  status: RentalStatus
}

/**
 * SKU สร้างจากสองตัวอักษรแรกของหมวด + เลขลำดับสามหลัก
 *
 * รูปแบบเดียวกับที่หน้า Supplies & Inventory ใช้อยู่แล้ว จะได้ไม่มีสองระบบ
 * ตั้งรหัสคนละแบบในแอปเดียวกัน เลขลำดับนับต่อจากรหัสที่มีอยู่แล้วในหมวดนั้น
 * ไม่ใช่นับจากจำนวนรายการทั้งหมด ไม่งั้นลบรายการแล้วรหัสจะชนของเดิม
 */
export function nextApplianceSku(category: string, existing: string[]): string {
  const prefix = category.slice(0, 2).toUpperCase() || 'AP'
  const used = existing
    .filter((sku) => sku.startsWith(`${prefix}-`))
    .map((sku) => Number(sku.slice(prefix.length + 1)))
    .filter((n) => Number.isFinite(n))
  const next = (used.length === 0 ? 0 : Math.max(...used)) + 1
  return `${prefix}-${String(next).padStart(3, '0')}`
}

export function validateCatalogItem(item: CatalogItem): string | null {
  if (item.name.trim() === '') {
    return 'Please enter the appliance name'
  }
  if (item.category.trim() === '') {
    return 'Please choose a category'
  }
  if (!Number.isFinite(item.monthlyFee) || item.monthlyFee < 0) {
    return 'The monthly fee cannot be negative'
  }
  if (!Number.isFinite(item.deposit) || item.deposit < 0) {
    return 'The deposit cannot be negative'
  }
  if (!Number.isFinite(item.owned) || item.owned < 0) {
    return 'Quantity owned cannot be negative'
  }
  if (!Number.isInteger(item.owned)) {
    return 'Quantity owned must be a whole number'
  }
  if (!Number.isFinite(item.lowStockAt) || item.lowStockAt < 0) {
    return 'The low stock alert cannot be negative'
  }
  /*
    แจ้งเตือนที่ตั้งสูงกว่าจำนวนที่มีทั้งหมดจะติดป้าย Low stock ตลอดเวลา
    ซึ่งทำให้ป้ายนั้นหมดความหมาย คนใช้จะเลิกสนใจไปเลย
  */
  if (item.lowStockAt > item.owned) {
    return 'The low stock alert cannot be higher than the quantity owned'
  }
  return null
}

export function validateRentalRequest(request: RentalRequest): string | null {
  if (request.room.trim() === '') {
    return 'Please choose a room'
  }
  if (request.sku.trim() === '') {
    return 'Please choose an appliance'
  }
  if (request.startDate === '') {
    return 'Please choose a start date'
  }
  return null
}

/**
 * จำนวนที่ยังว่างให้เช่า = ที่มีทั้งหมด ลบด้วยใบที่ยังไม่คืน
 *
 * คำนวณจากใบเช่าจริง ไม่ได้เก็บเป็นฟิลด์แยก ด้วยเหตุผลเดียวกับ supplyStatus
 * คือถ้าเก็บแยกแล้วมีคนแก้ใบเช่าโดยลืมแก้จำนวน ตารางจะโชว์ว่ายังมีของ
 * ทั้งที่จริงถูกเช่าไปหมดแล้ว
 */
export function availableCount(item: CatalogItem, requests: RentalRequest[]): number {
  const out = requests.filter((r) => r.sku === item.sku && r.status !== 'Returned').length
  return Math.max(item.owned - out, 0)
}

export function isLowStock(item: CatalogItem, requests: RentalRequest[]): boolean {
  return availableCount(item, requests) <= item.lowStockAt
}
