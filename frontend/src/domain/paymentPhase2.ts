import { roundMoney } from './billing'
import { todayInBangkok } from '../format'
import { addStoredDocument, getStoredDocuments } from './documents'

export interface PaymentRecord {
  id: string
  receiptId: number
  receiptNo: string
  roomNumber: string
  tenantName: string
  amount: number
  date: string
  method: 'Bank transfer' | 'Cash' | 'PromptPay'
  slipName?: string
  slipUrl?: string
  status?: 'Paid' | 'Partially paid' | 'Pending' | 'Overdue'
}

export interface BillingSettings {
  interestEnabled: boolean
  interestRate: number
  interestBasis: string
  bankName: string
  accountNumber: string
  accountHolder: string
  promptPayId?: string
  qrCodeImage?: string
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  interestEnabled: true,
  interestRate: 1,
  interestBasis: 'Simple interest · principal only',
  bankName: 'Kasikornbank',
  accountNumber: '012-3-45678-9',
  accountHolder: 'Sakura Soul Apartment',
  promptPayId: '',
  qrCodeImage: '',
}

const SETTINGS_KEY = 'sakura_billing_settings'
const PAYMENTS_KEY = 'sakura_payment_records_v2'
const SNAPSHOTS_KEY = 'sakura_invoice_snapshots'

export function getBillingSettings(): BillingSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_BILLING_SETTINGS }
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_BILLING_SETTINGS }
    return { ...DEFAULT_BILLING_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_BILLING_SETTINGS }
  }
}

export function saveBillingSettings(settings: BillingSettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

export interface InvoiceSnapshot {
  receiptId: number
  carriedBalance: number
  lateInterest: number
  interestRate: number
  snapshottedAt: string
}

export function getInvoiceSnapshots(): Record<number, InvoiceSnapshot> {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(SNAPSHOTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveInvoiceSnapshot(snapshot: InvoiceSnapshot): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const snapshots = getInvoiceSnapshots()
    snapshots[snapshot.receiptId] = snapshot
    window.localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots))
  } catch {
    // ignore
  }
}

export function resetInvoiceSnapshots(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(SNAPSHOTS_KEY)
  } catch {
    // ignore
  }
}

export const INITIAL_PAYMENT_RECORDS: PaymentRecord[] = [
  {
    id: 'RC-2026-1101',
    receiptId: 1,
    receiptNo: 'RC-2026-0001',
    roomNumber: '102',
    tenantName: 'Yuki Tanaka',
    amount: 15250,
    date: '2026-10-04',
    method: 'Bank transfer',
    slipName: 'transfer-102.pdf',
  },
]

export function createPaymentSlipPdfBlob(
  record: PaymentRecord,
  settings: BillingSettings = getBillingSettings(),
): Blob {
  const bankName = settings.bankName || 'Kasikornbank'
  const accountNumber = settings.accountNumber || '012-3-45678-9'
  const accountHolder = settings.accountHolder || 'Sakura Soul Apartment'

  const lines = [
    '==============================================================',
    '                   SAKURA SOUL APARTMENT                      ',
    '               PAYMENT RECORD / ใบบันทึกการรับชำระเงิน            ',
    '==============================================================',
    '',
    `  Transaction ID   : ${record.id}`,
    `  Invoice Ref      : ${record.receiptNo}`,
    `  Unit / Room      : Unit ${record.roomNumber}`,
    `  Tenant Name      : ${record.tenantName}`,
    `  Date & Time      : ${record.date} 10:42`,
    `  Payment Method   : ${record.method}`,
    `  Amount Paid      : THB ${record.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `  Proof File       : ${record.slipName || `${record.id}.pdf`}`,
    '',
    '--------------------------------------------------------------',
    '  PAYMENT DESTINATION:',
    `  Bank             : ${bankName}`,
    `  Account Number   : ${accountNumber}`,
    `  Account Name     : ${accountHolder}`,
    '--------------------------------------------------------------',
    '',
    '  STATUS           : RECORDED IN SYSTEM',
    '  RECORD TYPE      : SYSTEM PAYMENT RECORD',
    '',
    '==============================================================',
    '          Thank you for your prompt payment!                  ',
    '==============================================================',
  ]

  let streamText = 'BT\n/F1 11 Tf\n16 TL\n50 780 Td\n'
  for (const line of lines) {
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    streamText += `(${escaped}) '\n`
  }
  streamText += 'ET\n'

  const encoder = new TextEncoder()
  const streamLength = encoder.encode(streamText).length

  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> /Contents 4 0 R >>\nendobj\n'
  const obj4 = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamText}endstream\nendobj\n`

  const header = '%PDF-1.4\n'
  const headerBytes = encoder.encode(header)
  const obj1Bytes = encoder.encode(obj1)
  const obj2Bytes = encoder.encode(obj2)
  const obj3Bytes = encoder.encode(obj3)
  const obj4Bytes = encoder.encode(obj4)

  const offset1 = headerBytes.length
  const offset2 = offset1 + obj1Bytes.length
  const offset3 = offset2 + obj2Bytes.length
  const offset4 = offset3 + obj3Bytes.length
  const xrefOffset = offset4 + obj4Bytes.length

  const pad = (n: number) => n.toString().padStart(10, '0')
  const xrefAndTrailer =
    `xref\n0 5\n` +
    `0000000000 65535 f \n` +
    `${pad(offset1)} 00000 n \n` +
    `${pad(offset2)} 00000 n \n` +
    `${pad(offset3)} 00000 n \n` +
    `${pad(offset4)} 00000 n \n` +
    `trailer\n<< /Size 5 /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`

  const xrefBytes = encoder.encode(xrefAndTrailer)
  const fullBytes = new Uint8Array(xrefOffset + xrefBytes.length)
  let pos = 0
  fullBytes.set(headerBytes, pos); pos += headerBytes.length
  fullBytes.set(obj1Bytes, pos); pos += obj1Bytes.length
  fullBytes.set(obj2Bytes, pos); pos += obj2Bytes.length
  fullBytes.set(obj3Bytes, pos); pos += obj3Bytes.length
  fullBytes.set(obj4Bytes, pos); pos += obj4Bytes.length
  fullBytes.set(xrefBytes, pos)

  return new Blob([fullBytes], { type: 'application/pdf' })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function syncPaymentRecordToDocuments(record: PaymentRecord): void {
  const existingDocs = getStoredDocuments()
  const docName = `Payment receipt · ${record.receiptNo || record.id}`
  const alreadyExists = existingDocs.some(
    (d) =>
      d.name === docName ||
      (d.category === 'Receipt' &&
        d.unit === record.roomNumber &&
        ((Boolean(record.id) && d.name.includes(record.id)) ||
          (Boolean(record.receiptNo) && d.name.includes(record.receiptNo)))),
  )
  if (!alreadyExists) {
    const pdfBlob = createPaymentSlipPdfBlob(record)
    const fileName = record.slipName ? record.slipName.replace(/\.[^.]+$/, '.pdf') : `${record.id}.pdf`
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' })
    addStoredDocument({
      name: docName,
      category: 'Receipt',
      unit: record.roomNumber,
      tenant: record.tenantName,
      date: record.date || todayInBangkok(),
      size: formatFileSize(pdfFile.size),
      file: pdfFile,
    })
  }
}

export function getPaymentRecords(): PaymentRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...INITIAL_PAYMENT_RECORDS]
  }
  try {
    const raw = window.localStorage.getItem(PAYMENTS_KEY)
    if (!raw) return [...INITIAL_PAYMENT_RECORDS]
    return JSON.parse(raw)
  } catch {
    return [...INITIAL_PAYMENT_RECORDS]
  }
}

export function savePaymentRecord(record: PaymentRecord): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const records = getPaymentRecords()
  const next = [...records, record]
  try {
    window.localStorage.setItem(PAYMENTS_KEY, JSON.stringify(next))
  } catch (err: unknown) {
    const errObj = err as { name?: string; message?: string } | null
    const name = errObj?.name ?? ''
    const msg = errObj?.message ?? String(err)
    if (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      msg.toLowerCase().includes('quota')
    ) {
      throw new Error('Storage quota exceeded. Please choose a smaller payment proof file.', { cause: err })
    }
    throw err
  }
}

export function resetPaymentRecords(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(PAYMENTS_KEY)
    window.localStorage.removeItem('sakura_payment_records')
    window.localStorage.removeItem(SETTINGS_KEY)
    window.localStorage.removeItem(SNAPSHOTS_KEY)
  } catch {
    // ignore
  }
}

export function calculateInterest(principal: number, monthlyRatePercent: number): number {
  if (principal <= 0 || monthlyRatePercent <= 0) return 0
  return roundMoney(principal * (monthlyRatePercent / 100))
}

export interface InvoiceBalances {
  currentCharges: number
  carriedBalance: number
  lateInterest: number
  totalDue: number
  totalPaid: number
  outstanding: number
  status: 'Paid' | 'Partially paid' | 'Pending' | 'Overdue'
}

export const ROOM_CARRYOVERS: Record<string, number> = {
  '101': 2000,
  '202': 1500,
}

export function computeCarriedBalanceFromPastReceipts(
  roomNumber: string,
  currentBillingMonth: string,
  receipts: { id: number; roomNumber: string; billingMonth: string; totalAmount: number; status: 'PAID' | 'PENDING' }[],
  records: PaymentRecord[],
): number {
  if (!receipts || receipts.length === 0) {
    return ROOM_CARRYOVERS[roomNumber] ?? 0
  }
  const pastReceipts = receipts.filter(
    (r) => r.roomNumber === roomNumber && r.billingMonth < currentBillingMonth,
  )
  if (pastReceipts.length === 0) {
    return ROOM_CARRYOVERS[roomNumber] ?? 0
  }
  let sumUnpaid = 0
  for (const pr of pastReceipts) {
    if (pr.status === 'PAID') {
      continue
    }
    const matchingRecords = records.filter((rec) => rec.receiptId === pr.id)
    const paid = matchingRecords.reduce((s, rec) => s + rec.amount, 0)
    if (paid < pr.totalAmount) {
      sumUnpaid += Math.max(0, pr.totalAmount - paid)
    }
  }
  return roundMoney(sumUnpaid)
}

export function computeInvoiceBalances(
  receipt: {
    id: number
    totalAmount: number
    status?: 'PAID' | 'PENDING'
    dueDate?: string
    roomNumber?: string
    billingMonth?: string
    carriedBalance?: number
    interestSnapshot?: number
  },
  records: PaymentRecord[],
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS,
  today: string = todayInBangkok(),
  allReceipts?: { id: number; roomNumber: string; billingMonth: string; totalAmount: number; status: 'PAID' | 'PENDING' }[],
  snapshots: Record<number, InvoiceSnapshot> = getInvoiceSnapshots(),
): InvoiceBalances {
  const currentCharges = receipt.totalAmount
  const room = receipt.roomNumber ?? ''

  // 1. Carried balance: prioritize explicit carriedBalance, then calculate from past receipts, then fallback to ROOM_CARRYOVERS
  let carriedBalance: number
  if (receipt.carriedBalance !== undefined) {
    carriedBalance = receipt.carriedBalance
  } else if (allReceipts && receipt.billingMonth) {
    carriedBalance = computeCarriedBalanceFromPastReceipts(room, receipt.billingMonth, allReceipts, records)
  } else {
    carriedBalance = ROOM_CARRYOVERS[room] ?? 0
  }

  // 2. Late interest snapshot (PH2-05 S6): issued invoices keep their original snapshot
  let lateInterest = 0
  const existingSnapshot =
    receipt.interestSnapshot !== undefined
      ? { lateInterest: receipt.interestSnapshot }
      : snapshots[receipt.id]

  if (existingSnapshot !== undefined) {
    lateInterest = existingSnapshot.lateInterest
  } else if (settings.interestEnabled) {
    lateInterest = calculateInterest(carriedBalance, settings.interestRate)
  }

  const totalDue = roundMoney(currentCharges + carriedBalance + lateInterest)

  const matchingPayments = records.filter((r) => r.receiptId === receipt.id)
  let totalPaid = matchingPayments.reduce((sum, r) => sum + r.amount, 0)

  // If receipt is marked PAID in backend and has no custom partial records yet,
  // it means it was fully paid originally.
  if (receipt.status === 'PAID' && matchingPayments.length === 0) {
    totalPaid = totalDue
  }

  const outstanding = Math.max(0, roundMoney(totalDue - totalPaid))

  let status: 'Paid' | 'Partially paid' | 'Pending' | 'Overdue'
  if (outstanding <= 0) {
    status = 'Paid'
  } else if (totalPaid > 0) {
    status = 'Partially paid'
  } else if (receipt.dueDate && receipt.dueDate < today) {
    status = 'Overdue'
  } else {
    status = 'Pending'
  }

  return {
    currentCharges,
    carriedBalance,
    lateInterest,
    totalDue,
    totalPaid,
    outstanding,
    status,
  }
}

/**
 * คำนวณ CRC16-CCITT (0x1021, init 0xFFFF) ตามมาตรฐาน EMVCo PromptPay
 */
export function crc16(data: string): string {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff
      } else {
        crc = (crc << 1) & 0xffff
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * ตรวจสอบและจัดรูปแบบ PromptPay Target
 * รองรับ: เบอร์โทร 10 หลัก (เช่น 0812345678 -> 0066812345678) หรือ เลข ปชช./ผู้เสียภาษี 13 หลัก
 */
export function formatPromptPayTarget(target: string): { type: 'phone' | 'id'; formatted: string } {
  const cleaned = target.replace(/[^0-9]/g, '')
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return { type: 'phone', formatted: '0066' + cleaned.substring(1) }
  }
  if (cleaned.length === 13) {
    return { type: 'id', formatted: cleaned }
  }
  throw new Error('PromptPay ID must be a 10-digit mobile number or 13-digit national/tax ID')
}

/**
 * สร้าง EMVCo PromptPay QR Code payload พร้อมยอดเงินบิลจริง (SSK-168)
 * Point 7: POI 12 เมื่อมี amount (Dynamic QR) และ POI 11 เมื่อไม่มี amount (Static QR)
 */
export function generatePromptPayPayload(target: string, amount?: number): string {
  const { type, formatted } = formatPromptPayTarget(target)
  const tag = type === 'phone' ? '01' : '02'
  const merchantInfo = `0016A000000677010111${tag}${String(formatted.length).padStart(2, '0')}${formatted}`

  const hasAmount = amount !== undefined && amount > 0
  const poi = hasAmount ? '12' : '11'
  let payload = `0002010102${poi}29${String(merchantInfo.length).padStart(2, '0')}${merchantInfo}5303764`
  if (hasAmount) {
    const amtStr = amount.toFixed(2)
    payload += `54${String(amtStr.length).padStart(2, '0')}${amtStr}`
  }
  payload += '5802TH6304'
  return payload + crc16(payload)
}

export interface ReportRow {
  unit: string
  tenant: string
  month: string
  charges: number
  collected: number
  balance: number
}

export const INITIAL_REPORT_ROWS: ReportRow[] = [
  { unit: '101', tenant: 'Kant S.', month: 'Nov 2026', charges: 5300, collected: 3000, balance: 4320 },
  { unit: '102', tenant: 'Mali P.', month: 'Nov 2026', charges: 5450, collected: 5450, balance: 0 },
  { unit: '201', tenant: 'Narin K.', month: 'Nov 2026', charges: 5610, collected: 0, balance: 5610 },
  { unit: '202', tenant: 'Pim W.', month: 'Nov 2026', charges: 6200, collected: 0, balance: 7715 },
  { unit: '101', tenant: 'Kant S.', month: 'Oct 2026', charges: 4900, collected: 2900, balance: 2000 },
]

/**
 * สร้าง ReportRow จาก invoices และ payment records จริงในระบบ (SSK-170)
 */
export function buildReportRows(
  invoices: {
    receipt: { id?: number; roomNumber: string; tenantName: string; billingMonth: string; totalAmount: number }
    balances: { totalDue: number; totalPaid: number; outstanding: number }
  }[],
  baseRows: ReportRow[] = INITIAL_REPORT_ROWS,
): ReportRow[] {
  if (!invoices || invoices.length === 0) {
    return [...baseRows]
  }

  const formatMonth = (bm: string): string => {
    const parts = bm.split('-')
    if (parts.length === 2) {
      const year = parts[0]
      const monthNum = parseInt(parts[1], 10)
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      if (monthNum >= 1 && monthNum <= 12) {
        return `${months[monthNum - 1]} ${year}`
      }
    }
    return bm
  }

  return invoices.map((inv) => ({
    unit: inv.receipt.roomNumber,
    tenant: inv.receipt.tenantName,
    month: formatMonth(inv.receipt.billingMonth),
    charges: inv.receipt.totalAmount,
    collected: inv.balances.totalPaid,
    balance: inv.balances.outstanding,
  }))
}

export function exportCsvReport(group: string, rows: [string, { charges: number; collected: number; balance: number }][], month: string): void {
  const content = `${group},current_charges,collections,closing_balance\n${rows
    .map(([k, v]) => `${k},${v.charges},${v.collected},${month === 'All months' && group !== 'Month' ? '' : v.balance}`)
    .join('\n')}`
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `summary-report-${group.toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
