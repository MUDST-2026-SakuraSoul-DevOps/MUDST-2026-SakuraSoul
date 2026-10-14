import type { MaintenanceSupplyUsed, Supply, SupplyUsageRequest } from '../api/types'

/**
 * กฎของการเบิกของจากคลังเข้าใบแจ้งซ่อม (SSK-154) ที่ไม่เกี่ยวกับการวาดหน้าจอ
 *
 * ใช้ร่วมกันสามที่ คือป็อปอัป Create Maintenance บน Dashboard, ป็อปอัป Create Task ในหน้า
 * Maintenance และปุ่ม Add Supply ในรายละเอียดใบ ถ้าแต่ละที่เขียนกฎเอง สักวันจะมีที่หนึ่ง
 * ยอมให้เบิก 1.5 ชิ้นหรือเบิกเกินสต็อกแล้วไปรู้ตัวตอน backend ตอบ 400
 *
 * ข้อความ error ใช้ชุดเดียวกับ backend (MaintenanceDtos.SupplyUsageRequest และ
 * SupplyItem.withdraw) ผู้ใช้จะเห็นข้อความเดียวกันไม่ว่าจะโดนกันที่หน้าเว็บหรือที่ server
 */

/** ของหนึ่งรายการที่เลือกไว้ในฟอร์ม ยังไม่ได้ส่งไป backend */
export interface SupplyUsageLine {
  supplyId: number
  name: string
  quantity: number
}

/**
 * สถานะของช่องเบิกของในฟอร์ม รายการที่กด Add แล้ว กับของที่กำลังเลือกอยู่แต่ยังไม่ได้กด Add
 * เก็บจำนวนเป็นสตริงตามที่พิมพ์ จะได้แยกช่องว่างกับเลขศูนย์ออกจากกันได้
 */
export interface SupplyUsageDraft {
  lines: SupplyUsageLine[]
  supplyId: string
  quantity: string
}

export const EMPTY_SUPPLY_USAGE: SupplyUsageDraft = { lines: [], supplyId: '', quantity: '' }

/** ตัวเลือกใน dropdown บอกยอดคงเหลือไปด้วย แอดมินจะได้ไม่ต้องสลับไปดูแท็บคลัง */
export function supplyOptionLabel(supply: Pick<Supply, 'name' | 'stock'>): string {
  return `${supply.name} · ${supply.stock} left`
}

/** ตรวจช่องจำนวน ว่าง ไม่ใช่ตัวเลข ทศนิยม ศูนย์ หรือติดลบ เบิกไม่ได้ทั้งหมด */
export function validateUsageQuantity(raw: string): string | null {
  const text = raw.trim()
  const quantity = Number(text)
  if (text === '' || Number.isNaN(quantity)) {
    return 'Please enter the quantity used'
  }
  if (!Number.isInteger(quantity)) {
    return 'The quantity used must be a whole number'
  }
  if (quantity <= 0) {
    return 'The quantity used must be greater than 0'
  }
  return null
}

/**
 * ตรวจของที่เลือกกับจำนวนที่กรอก คืนข้อความเตือนหรือ null ถ้าเบิกได้
 *
 * already คือจำนวนของชิ้นเดียวกันที่อยู่ในรายการแล้ว เลือกซ้ำจะถูกรวมเป็นแถวเดียว
 * จึงต้องเอายอดรวมไปเทียบกับสต็อก ไม่ใช่เทียบแค่จำนวนที่เพิ่งพิมพ์
 */
export function usageError(
  supplyId: string,
  quantity: string,
  supplies: Supply[],
  already = 0,
): string | null {
  const supply = supplies.find((s) => String(s.id) === supplyId)
  if (!supply) {
    return 'Please choose the item'
  }
  const quantityError = validateUsageQuantity(quantity)
  if (quantityError !== null) {
    return quantityError
  }
  if (already + Number(quantity) > supply.stock) {
    return `Not enough ${supply.name} in stock (only ${supply.stock} left)`
  }
  return null
}

/**
 * กด Add เอาของที่เลือกเข้ารายการ ของชิ้นเดิมรวมเป็นแถวเดียว แล้วล้างช่องเลือกให้เลือกชิ้นต่อไป
 * ผ่านไม่ได้คืน draft เดิมพร้อมข้อความเตือน ของที่กรอกไว้ไม่หาย
 */
export function addUsageLine(
  draft: SupplyUsageDraft,
  supplies: Supply[],
): { draft: SupplyUsageDraft; error: string | null } {
  const existing = draft.lines.find((line) => String(line.supplyId) === draft.supplyId)
  const error = usageError(draft.supplyId, draft.quantity, supplies, existing?.quantity ?? 0)
  if (error !== null) {
    return { draft, error }
  }
  const supply = supplies.find((s) => String(s.id) === draft.supplyId) as Supply
  const quantity = Number(draft.quantity)
  const lines = existing
    ? draft.lines.map((line) =>
        line.supplyId === supply.id ? { ...line, quantity: line.quantity + quantity } : line,
      )
    : [...draft.lines, { supplyId: supply.id, name: supply.name, quantity }]
  return { draft: { lines, supplyId: '', quantity: '' }, error: null }
}

export function removeUsageLine(draft: SupplyUsageDraft, supplyId: number): SupplyUsageDraft {
  return { ...draft, lines: draft.lines.filter((line) => line.supplyId !== supplyId) }
}

/**
 * เลือกของหรือพิมพ์จำนวนไว้แล้วแต่ยังไม่กด Add แล้วกดบันทึกใบ
 *
 * ถ้าปล่อยผ่าน ของที่ค้างอยู่ในช่องจะไม่ถูกเบิก ทั้งที่ผู้ใช้เห็นมันอยู่บนจอและเข้าใจว่าเบิกแล้ว
 * จึงให้บันทึกไม่ได้จนกว่าจะกด Add หรือล้างช่อง
 */
export function pendingUsageError(draft: SupplyUsageDraft): string | null {
  if (draft.supplyId !== '' || draft.quantity.trim() !== '') {
    return 'Click Add to include the selected supply, or clear it before saving'
  }
  return null
}

/** รายการในฟอร์มเป็น suppliesUsed ของ POST /api/maintenance ไม่ได้เบิกอะไรเลยไม่ส่งช่องนี้ */
export function toUsageRequests(lines: SupplyUsageLine[]): SupplyUsageRequest[] | undefined {
  return lines.length === 0
    ? undefined
    : lines.map((line) => ({ supplyId: line.supplyId, quantity: line.quantity }))
}

/**
 * backend ส่ง suppliesUsed มาหนึ่งแถวต่อการเบิกหนึ่งครั้ง (MaintenanceService.responsesOf)
 * เบิกหลอดไฟสองรอบจะได้สองแถว แอดมินอยากรู้ว่าใบนี้ใช้หลอดไฟไปทั้งหมดกี่หลอด
 * จึงรวมตามชิ้นก่อนแสดง ลำดับตามครั้งแรกที่เบิกของชิ้นนั้น
 */
export function summarizeSuppliesUsed(used: MaintenanceSupplyUsed[]): MaintenanceSupplyUsed[] {
  const totals = new Map<number, MaintenanceSupplyUsed>()
  for (const usage of used) {
    const current = totals.get(usage.supplyId)
    totals.set(
      usage.supplyId,
      current ? { ...current, quantity: current.quantity + usage.quantity } : { ...usage },
    )
  }
  return [...totals.values()]
}
