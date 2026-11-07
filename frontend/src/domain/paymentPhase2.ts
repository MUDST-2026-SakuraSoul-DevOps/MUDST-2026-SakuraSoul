import { roundMoney } from './billing'
import { todayInBangkok } from '../format'

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
}

export interface BillingSettings {
  interestEnabled: boolean
  interestRate: number
  interestBasis: string
  bankName: string
  accountNumber: string
  accountHolder: string
  qrCodeImage?: string
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  interestEnabled: true,
  interestRate: 1,
  interestBasis: 'Simple interest · principal only',
  bankName: 'Kasikornbank',
  accountNumber: '012-3-45678-9',
  accountHolder: 'Sakura Soul Apartment',
  qrCodeImage: '',
}

const SETTINGS_KEY = 'sakura_billing_settings'
const PAYMENTS_KEY = 'sakura_payment_records'

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
    slipName: 'transfer-102.jpg',
  },
  {
    id: 'RC-2026-1102',
    receiptId: -101,
    receiptNo: 'INV-2026-1101',
    roomNumber: '101',
    tenantName: 'Kant S.',
    amount: 3000,
    date: '2026-11-03',
    method: 'Bank transfer',
    slipName: 'transfer-101.jpg',
  },
]

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
  try {
    const records = getPaymentRecords()
    const next = [...records, record]
    window.localStorage.setItem(PAYMENTS_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function resetPaymentRecords(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(PAYMENTS_KEY)
    window.localStorage.removeItem(SETTINGS_KEY)
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

export function computeInvoiceBalances(
  receipt: { id: number; totalAmount: number; status: 'PAID' | 'PENDING'; dueDate: string; roomNumber: string },
  records: PaymentRecord[],
  settings: BillingSettings,
  today: string = todayInBangkok(),
): InvoiceBalances {
  const currentCharges = receipt.totalAmount
  const carriedBalance = ROOM_CARRYOVERS[receipt.roomNumber] ?? 0
  const lateInterest = settings.interestEnabled
    ? calculateInterest(carriedBalance, settings.interestRate)
    : 0
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
  } else if (receipt.dueDate < today) {
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
