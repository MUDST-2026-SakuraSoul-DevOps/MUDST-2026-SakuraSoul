/**
 * กฎของการออกบิลผ่าน POST /api/receipts ที่ไม่เกี่ยวกับการวาดหน้าจอ
 *
 * preview ในฟอร์มต้องได้ตัวเลขเดียวกับใบเสร็จที่ backend ออกจริง สูตรจึงตาม
 * docs/api-contract-billing.md ทุกข้อ คือห้าบรรทัดคงที่ อัตรามาจากสัญญา และปัดทีละบรรทัดก่อนรวม
 */

import type { ApartmentConfig, Lease, Receipt } from '../api/types'
import { displayDate, todayInBangkok } from '../format'
import type { ReceiptData } from './receipt'

/**
 * ปัดครึ่งขึ้นสองตำแหน่ง (HALF_UP เหมือน BigDecimal ฝั่ง backend) ใช้ทีละบรรทัดก่อนรวม
 * ผลบวกที่พิมพ์จะได้ตรงกับยอดรวม
 *
 * SSK-16 ปัดที่จำนวนเต็มสตางค์ โดยตัดเศษทศนิยมที่ float เพี้ยนทิ้งก่อน (toPrecision 12 หลัก)
 * เดิมบวก Number.EPSILON ก่อนคูณ 100 ซึ่งช่วยได้แค่ค่าที่ใกล้ 1 ค่าที่ใหญ่กว่านั้นยังพลาด
 * เช่นหน่วยมีทศนิยม 10.5 หน่วย × ฿6.55 = 68.775 พอดี backend ปัดได้ 68.78 แต่ float คูณได้
 * 68.77499… วิธีเดิมจึงได้ 68.77 preview ในฟอร์มกับใบเสร็จจริงจะต่างกันหนึ่งสตางค์
 */
export function roundMoney(value: number): number {
  const cents = Number((value * 100).toPrecision(12))
  return Math.round(cents) / 100
}

/** ป้ายสถานะของใบเสร็จที่หน้าจอใช้ Overdue ไม่มีใน API คิดจาก PENDING กับวันครบกำหนด */
export type PaymentStatus = 'Paid' | 'Pending' | 'Overdue'

/**
 * Overdue คือยังไม่จ่ายและเลยวันครบกำหนดแล้ว เทียบเป็นวันตามเวลาไทย (today = todayInBangkok())
 * ครบกำหนดวันนี้ยังนับเป็น Pending เพราะยังจ่ายทันภายในวัน
 */
export function paymentStatusOf(receipt: Pick<Receipt, 'status' | 'dueDate'>, today: string): PaymentStatus {
  if (receipt.status === 'PAID') {
    return 'Paid'
  }
  return receipt.dueDate < today ? 'Overdue' : 'Pending'
}

/**
 * สถานะการจ่ายของผู้เช่าหนึ่งคน จากใบเสร็จของทุกสัญญาที่เป็นของเขา (ป้ายในหน้า Tenants)
 * มีใบเลยกำหนดใบเดียวก็ขึ้น Overdue ก่อน รองลงมาคือมีใบรอจ่าย ไม่มีทั้งสองอย่างคืน null
 * ให้หน้าจอใช้สถานะของสัญญาแทน
 */
export function tenantPaymentStatus(
  receipts: Receipt[],
  leaseIds: number[],
  today: string,
): 'Overdue' | 'Pending' | null {
  const statuses = receipts
    .filter((receipt) => leaseIds.includes(receipt.leaseId))
    .map((receipt) => paymentStatusOf(receipt, today))
  if (statuses.includes('Overdue')) {
    return 'Overdue'
  }
  return statuses.includes('Pending') ? 'Pending' : null
}

export type MeterReading = { units: number; error: null } | { units: null; error: string }

/**
 * หน่วยมิเตอร์จากช่องกรอก ข้อความตรงกับ backend
 *
 * ช่องว่าง ตัวเลขที่อ่านไม่ออก และค่าติดลบ ต้องคืน error ห้ามแปลงเป็น 0 เงียบ ๆ
 * ไม่งั้น preview โชว์ศูนย์แต่ค่าที่ส่งไปจริงเป็นอีกค่า
 */
export function readMeter(raw: string, meter: 'electricity' | 'water'): MeterReading {
  const label = meter === 'electricity' ? 'Electricity' : 'Water'
  const units = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(units)) {
    return { units: null, error: `Please enter the ${meter} units` }
  }
  if (units < 0) {
    return { units: null, error: `${label} units cannot be negative` }
  }
  return { units, error: null }
}

export interface BillLine {
  item: string
  usageValue: number | null
  rate: number | null
  amount: number
}

/**
 * บรรทัดของบิลก่อนกดออก อัตรามาจากสัญญา ค่าไหนสัญญาไม่มีค่อยใช้ของ Config
 * (backend คัดลอกอัตราลงสัญญาทุกใบตอนเซ็น fallback นี้มีไว้ให้สัญญาตัวอย่างใน mock)
 */
export function previewBill(
  lease: Lease,
  config: ApartmentConfig,
  electricUnits: number,
  waterUnits: number,
): { lines: BillLine[]; total: number } {
  const electricRate = lease.electricRatePerUnit ?? config.electricRatePerUnit
  const waterRate = lease.waterRatePerUnit ?? config.waterRatePerUnit
  const lines: BillLine[] = [
    { item: 'Room rent', usageValue: null, rate: null, amount: roundMoney(lease.monthlyRent) },
    {
      item: 'Common area fee',
      usageValue: null,
      rate: null,
      amount: roundMoney(lease.commonAreaFee ?? config.commonAreaFee),
    },
    { item: 'Internet', usageValue: null, rate: null, amount: roundMoney(lease.internetFee ?? config.internetFee) },
    { item: 'Electricity', usageValue: electricUnits, rate: electricRate, amount: roundMoney(electricUnits * electricRate) },
    { item: 'Water', usageValue: waterUnits, rate: waterRate, amount: roundMoney(waterUnits * waterRate) },
  ]
  return { lines, total: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)) }
}

/** "2026-09" เป็น "September 2026" */
export function displayBillingMonth(billingMonth: string): string {
  const [year, month] = billingMonth.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** ใบเสร็จจาก API เป็นรูปที่ป็อปอัปใบเสร็จกับตัวพิมพ์ใช้ ชื่อบรรทัดไม่ซ้ำกันจึงใช้เป็น id ได้ */
export function toReceiptData(receipt: Receipt, today = todayInBangkok()): ReceiptData {
  return {
    receiptNo: receipt.receiptNo,
    tenant: receipt.tenantName,
    unit: receipt.roomNumber,
    billingMonth: displayBillingMonth(receipt.billingMonth),
    dueDate: displayDate(receipt.dueDate),
    items: receipt.items.map((row) => ({
      id: row.item,
      item: row.item,
      detail: row.detail ?? undefined,
      usageValue: row.usageValue ?? undefined,
      usageUnit: row.usageUnit ?? undefined,
      rate: row.rate ?? undefined,
      amount: row.amount,
    })),
    totalAmount: receipt.totalAmount,
    // ป็อปอัปกับตัวพิมพ์ใช้ป้ายเดียวกับตาราง ใบที่เลยกำหนดขึ้น Overdue ไม่ใช่ Pending (SSK-16)
    status: paymentStatusOf(receipt, today),
    paidDate: receipt.paidAt ? displayDate(receipt.paidAt) : undefined,
    paymentMethod: receipt.paymentMethod ?? undefined,
  }
}
