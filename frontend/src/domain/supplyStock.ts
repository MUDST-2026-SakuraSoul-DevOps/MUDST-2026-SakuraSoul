import type { StockMovement, StockMovementKind } from '../api/types'

/**
 * ติดตามสต็อกและของใกล้หมด (SSK-171)
 *
 * เกณฑ์ใกล้หมดคือ stock <= minStock ใช้ที่เดียวกันทุกที่ ทั้งป้ายในตาราง การ์ดสรุป แบนเนอร์ ตัวนับที่เมนู
 * และ endpoint low-stock ตาม AC "ของที่ stock = min_stock ขึ้นเป็นใกล้หมด" (เดิมใช้ < จึงไม่เตือนตอนเท่ากับขั้นต่ำ)
 */
export function isLowStock(item: { stock: number; minStock: number }): boolean {
  return item.stock <= item.minStock
}

/**
 * เรียงจากวิกฤตที่สุด: สัดส่วนของที่เหลือต่อขั้นต่ำน้อยก่อน (หมดเกลี้ยงมาก่อนเสมอ) แล้วตามชื่อ
 * ขั้นต่ำ 0 ที่ยังถือว่าใกล้หมดคือหมดแล้ว จึงนับสัดส่วนเป็น 0
 */
export function byMostCritical<T extends { stock: number; minStock: number; name: string }>(a: T, b: T): number {
  const ratio = (s: T) => (s.minStock === 0 ? 0 : s.stock / s.minStock)
  return ratio(a) - ratio(b) || a.stock - b.stock || a.name.localeCompare(b.name)
}

export interface StockEvent {
  at: string
  kind: Exclude<StockMovementKind, 'OPENING'>
  /** บวกคือเข้า ลบคือออก */
  quantity: number
  note: string | null
}

/**
 * ประวัติความเคลื่อนไหวพร้อมยอดคงเหลือหลังแต่ละรายการ เก่าก่อนใหม่
 * ยอดตั้งต้นย้อนคำนวณจากยอดปัจจุบันลบผลรวมของทุกรายการ ยอดสุดท้ายจึงตรงกับ stock ปัจจุบันเสมอ
 */
export function buildMovements(currentStock: number, createdAt: string, events: StockEvent[]): StockMovement[] {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at))
  let balance = currentStock - sorted.reduce((sum, e) => sum + e.quantity, 0)
  const movements: StockMovement[] = [
    { at: createdAt, kind: 'OPENING', quantity: balance, balanceAfter: balance, note: null },
  ]
  for (const event of sorted) {
    balance += event.quantity
    movements.push({ ...event, balanceAfter: balance })
  }
  return movements
}

export const MOVEMENT_LABEL: Record<StockMovementKind, string> = {
  OPENING: 'Opening stock',
  RESTOCK: 'Restock',
  USAGE: 'Used in repair',
  ADJUSTMENT: 'Manual adjustment',
}
