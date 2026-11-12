import { describe, expect, it } from 'vitest'
import type { Receipt, ReceiptPayment } from '../api/types'
import { canEditReceipt, canRecordPayment, invoiceBalances, newestPaymentId, paymentHistory, paymentRevenue } from './paymentLedger'

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return { id: 1, receiptNo: 'RC-1', leaseId: 10, roomNumber: '101', tenantName: 'Tenant', tenantEmail: null,
    billingMonth: '2026-11', issuedAt: '2026-11-01', dueDate: '2026-11-05', status: 'PENDING', items: [], totalAmount: 1000,
    paidAt: null, paymentMethod: null, lastSentAt: null, sentCount: 0, latest: true, balanceDue: 1000,
    previousBalance: 0, interestAmount: 0, paidAmount: 0, settledAmount: 0, overdue: false, ...overrides }
}
function payment(id: number, overrides: Partial<ReceiptPayment> = {}): ReceiptPayment {
  return { id, amount: 100, paidOn: '2026-11-09', method: 'CASH', reference: null, note: null,
    recordedAt: '2026-11-09T00:00:00Z', voidedAt: null, ...overrides }
}

describe('backend payment ledger', () => {
  it('uses backend zero balances and statuses instead of local carryovers or dates', () => {
    expect(invoiceBalances(receipt({ status: 'PAID', balanceDue: 0, paidAmount: 1000, overdue: true }))).toMatchObject({ status: 'Paid', outstanding: 0, carriedBalance: 0, lateInterest: 0 })
    expect(invoiceBalances(receipt({ status: 'PARTIAL', overdue: true, balanceDue: 800, paidAmount: 200, settledAmount: 200 }))).toMatchObject({ status: 'Overdue', totalDue: 1000, totalPaid: 200, outstanding: 800 })
    expect(invoiceBalances(receipt({ latest: false, balanceDue: null, outstandingAmount: 0, carriedToReceiptNo: 'RC-2' }))).toMatchObject({ status: 'Pending', outstanding: 0 })
  })

  it('splits a bill that carries an old balance and is paid in part into its parts', () => {
    // ค่าเดือนนี้ 4,638 + ยอดยกมา 1,200 + ดอกเบี้ย 1% ของ 1,200 = 12 รวม 5,850
    // จ่ายมา 2,000 ตัดยอดยกมาก่อน 1,200 เหลือเข้าใบนี้ 800 (settledAmount) ยอดที่ยังต้องจ่าย 5,850 − 2,000 = 3,850
    const bill = receipt({ status: 'PARTIAL', totalAmount: 5850, previousBalance: 1200, interestAmount: 12,
      paidAmount: 2000, settledAmount: 800, balanceDue: 3850, outstandingAmount: 3850 })
    expect(invoiceBalances(bill)).toEqual({
      currentCharges: 4638, carriedBalance: 1200, lateInterest: 12,
      totalDue: 5850, totalPaid: 2000, outstanding: 3850, status: 'Partially paid',
    })
  })

  it('offers edits and payments only when the backend permits them', () => {
    expect(canEditReceipt(receipt())).toBe(true)
    expect(canRecordPayment(receipt())).toBe(true)
    for (const blocked of [receipt({ latest: false }), receipt({ carriedToReceiptNo: 'RC-2' }), receipt({ status: 'PARTIAL', paidAmount: 1 })]) {
      expect(canEditReceipt(blocked)).toBe(false)
    }
    expect(canRecordPayment(receipt({ latest: false, balanceDue: null }))).toBe(false)
    expect(canRecordPayment(receipt({ balanceDue: 0 }))).toBe(false)
  })

  it('keeps voided payments visible but only allows voiding the newest active payment of a latest bill', () => {
    const old = receipt({ id: 1, latest: false, payments: [payment(1)] })
    const latest = receipt({ id: 2, payments: [payment(2), payment(3), payment(4, { voidedAt: '2026-11-10T00:00:00Z' })] })
    const rows = paymentHistory([old, latest])
    expect(rows.map(r => r.paymentId)).toEqual([4, 3, 2, 1])
    expect(rows.filter(r => r.canVoid).map(r => r.paymentId)).toEqual([3])
    expect(rows[0].status).toBe('Voided')
    expect(paymentHistory([receipt({ status: 'PAID', payments: [] })])).toEqual([])
  })

  it('names each payment method the way the history table and receipts show it', () => {
    const rows = paymentHistory([receipt({ payments: [payment(1, { method: 'CASH' }), payment(2, { method: 'TRANSFER' }),
      payment(3, { method: 'QR' }), payment(4, { method: 'OTHER' })] })])
    expect(rows.map(r => [r.id, r.method])).toEqual([['PAY-4', 'Other'], ['PAY-3', 'PromptPay'], ['PAY-2', 'Bank transfer'], ['PAY-1', 'Cash']])
  })

  it('totals only non-voided payments paid in the selected Thai calendar month/year', () => {
    const rows = paymentHistory([receipt({ payments: [payment(1), payment(2, { paidOn: '2026-10-31', amount: 200 }), payment(3, { amount: 900, voidedAt: '2026-11-10T00:00:00Z' }), payment(4, { paidOn: '2025-11-09', amount: 300 })] })])
    expect(paymentRevenue(rows, '2026-11-13')).toEqual({ monthly: 100, yearly: 300, monthlyCount: 1 })
  })
})

describe('newestPaymentId (SSK-163 slip upload after recording)', () => {
  it('picks the highest payment id on the receipt the API returned, because ids grow in recording order', () => {
    expect(newestPaymentId(receipt({ payments: [payment(7), payment(12), payment(9)] }))).toBe(12)
  })

  it('skips a voided payment even when its id is the highest', () => {
    expect(newestPaymentId(receipt({ payments: [payment(7), payment(15, { voidedAt: '2026-11-10T00:00:00Z' })] }))).toBe(7)
  })

  it('has nothing to point at when the receipt has no active payment', () => {
    expect(newestPaymentId(receipt({ payments: [] }))).toBeNull()
    expect(newestPaymentId(receipt({ payments: [payment(3, { voidedAt: '2026-11-10T00:00:00Z' })] }))).toBeNull()
  })
})
