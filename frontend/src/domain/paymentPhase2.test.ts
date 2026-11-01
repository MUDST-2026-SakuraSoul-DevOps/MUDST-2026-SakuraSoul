import { describe, expect, it, beforeEach } from 'vitest'
import {
  calculateInterest,
  computeInvoiceBalances,
  DEFAULT_BILLING_SETTINGS,
  getBillingSettings,
  saveBillingSettings,
  getPaymentRecords,
  savePaymentRecord,
  resetPaymentRecords,
  type PaymentRecord,
} from './paymentPhase2'

describe('paymentPhase2 domain logic', () => {
  beforeEach(() => {
    resetPaymentRecords()
  })

  it('calculates simple monthly interest correctly (SSK-164)', () => {
    // 2,000 * 1% = 20
    expect(calculateInterest(2000, 1)).toBe(20)
    // 1,500 * 1.5% = 22.5
    expect(calculateInterest(1500, 1.5)).toBe(22.5)
    // 0 principal or negative rate
    expect(calculateInterest(0, 1)).toBe(0)
    expect(calculateInterest(2000, 0)).toBe(0)
    expect(calculateInterest(2000, -1)).toBe(0)
  })

  it('computes invoice balances with carryover, interest, and partial payments (SSK-163, SSK-164)', () => {
    const receipt = {
      id: 10,
      totalAmount: 5000,
      status: 'PENDING' as const,
      dueDate: '2026-11-05',
      roomNumber: '101', // carries 2,000 from ROOM_CARRYOVERS
    }

    const settings = {
      ...DEFAULT_BILLING_SETTINGS,
      interestEnabled: true,
      interestRate: 1,
    }

    // Without payments:
    // current = 5000, carry = 2000, interest = 20 -> totalDue = 7020, outstanding = 7020
    const b1 = computeInvoiceBalances(receipt, [], settings, '2026-11-01')
    expect(b1.currentCharges).toBe(5000)
    expect(b1.carriedBalance).toBe(2000)
    expect(b1.lateInterest).toBe(20)
    expect(b1.totalDue).toBe(7020)
    expect(b1.totalPaid).toBe(0)
    expect(b1.outstanding).toBe(7020)
    expect(b1.status).toBe('Pending')

    // Overdue when past due date
    const bOverdue = computeInvoiceBalances(receipt, [], settings, '2026-11-06')
    expect(bOverdue.status).toBe('Overdue')

    // Partial payment of 3,000 (SSK-163)
    const records: PaymentRecord[] = [
      {
        id: 'RC-PAY-1',
        receiptId: 10,
        receiptNo: 'RC-2026-0010',
        roomNumber: '101',
        tenantName: 'Ada Lovelace',
        amount: 3000,
        date: '2026-11-02',
        method: 'Bank transfer',
        slipName: 'slip-101.jpg',
      },
    ]

    const b2 = computeInvoiceBalances(receipt, records, settings, '2026-11-01')
    expect(b2.totalPaid).toBe(3000)
    expect(b2.outstanding).toBe(4020)
    expect(b2.status).toBe('Partially paid')

    // Remaining payment of 4,020 -> fully paid
    const fullRecords: PaymentRecord[] = [
      ...records,
      {
        id: 'RC-PAY-2',
        receiptId: 10,
        receiptNo: 'RC-2026-0010',
        roomNumber: '101',
        tenantName: 'Ada Lovelace',
        amount: 4020,
        date: '2026-11-04',
        method: 'PromptPay',
      },
    ]

    const b3 = computeInvoiceBalances(receipt, fullRecords, settings, '2026-11-01')
    expect(b3.totalPaid).toBe(7020)
    expect(b3.outstanding).toBe(0)
    expect(b3.status).toBe('Paid')
  })

  it('respects interestEnabled toggle from settings (SSK-164)', () => {
    const receipt = {
      id: 11,
      totalAmount: 4000,
      status: 'PENDING' as const,
      dueDate: '2026-11-05',
      roomNumber: '101', // carries 2000
    }

    const disabledSettings = {
      ...DEFAULT_BILLING_SETTINGS,
      interestEnabled: false,
    }

    const b = computeInvoiceBalances(receipt, [], disabledSettings, '2026-11-01')
    expect(b.carriedBalance).toBe(2000)
    expect(b.lateInterest).toBe(0)
    expect(b.totalDue).toBe(6000)
  })

  it('persists and loads billing settings in localStorage (SSK-164, SSK-168)', () => {
    const customSettings = {
      interestEnabled: false,
      interestRate: 2.5,
      interestBasis: 'Simple interest · principal only',
      bankName: 'Siam Commercial Bank',
      accountNumber: '987-6-54321-0',
      accountHolder: 'Sakura Residence',
      qrCodeImage: 'scb-qr.png',
    }

    saveBillingSettings(customSettings)
    expect(getBillingSettings()).toEqual(customSettings)
  })

  it('persists and loads payment records in localStorage (SSK-163)', () => {
    const newRecord: PaymentRecord = {
      id: 'RC-TEST-99',
      receiptId: 99,
      receiptNo: 'RC-99',
      roomNumber: '202',
      tenantName: 'Tester',
      amount: 1200,
      date: '2026-11-03',
      method: 'Cash',
      slipName: 'receipt.pdf',
    }

    savePaymentRecord(newRecord)
    const records = getPaymentRecords()
    expect(records).toContainEqual(newRecord)
  })
})
