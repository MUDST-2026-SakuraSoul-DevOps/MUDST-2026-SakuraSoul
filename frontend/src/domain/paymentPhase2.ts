import { roundMoney } from './billing'

/*
  ชนิดข้อมูลกับสูตรของหน้า Payments ที่เหลือจาก Phase 2 รอบแรก

  เดิมไฟล์นี้เก็บการชำระ ค่าตั้ง และ snapshot ของใบไว้ใน localStorage แล้วคิดยอดเอง
  ตั้งแต่ #231 ทุกตัวเลขมาจาก API (paymentLedger.ts) และสลิปเป็นไฟล์แนบของการชำระ (SSK-163)
  ส่วนที่เก็บในเบราว์เซอร์จึงลบไปแล้ว เหลือแค่ชนิดข้อมูลของหน้าจอ สูตรดอกเบี้ยที่ป็อปอัป Billing Settings ใช้แสดงตัวอย่าง
  และตัวสร้าง QR PromptPay (backend จำลองใช้สร้าง promptPayPayload แบบเดียวกับ backend จริง)
*/

export interface PaymentRecord {
  id: string
  paymentId?: number
  canVoid?: boolean
  receiptId: number
  receiptNo: string
  roomNumber: string
  tenantName: string
  amount: number
  date: string
  method?: 'Bank transfer' | 'Cash' | 'PromptPay' | 'Other'
  slipName?: string
  slipUrl?: string
  note?: string
  status?: 'Paid' | 'Partially paid' | 'Pending' | 'Overdue' | 'Voided'
}

export interface BillingSettings {
  interestEnabled: boolean
  interestRate: number
  interestBasis: string
  bankName: string
  accountNumber: string
  accountName?: string
  accountHolder?: string
  graceDays?: number
  promptPayId?: string
  qrCodeImage?: string
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
  if (/\s/.test(target)) {
    throw new Error('PromptPay ID must be a 10-digit phone number or a 13-digit ID')
  }
  const cleaned = target.replace(/[^0-9]/g, '')
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return { type: 'phone', formatted: '0066' + cleaned.substring(1) }
  }
  if (cleaned.length === 13) {
    return { type: 'id', formatted: cleaned }
  }
  throw new Error('PromptPay ID must be a 10-digit phone number or a 13-digit ID')
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
