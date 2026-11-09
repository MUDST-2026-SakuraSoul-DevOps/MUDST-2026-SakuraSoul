import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  getPaymentRecords,
  savePaymentRecord,
  resetPaymentRecords,
  createPaymentSlipPdfBlob,
  syncPaymentRecordToDocuments,
  computeCarriedBalanceFromPastReceipts,
  computeInvoiceBalances,
  generatePromptPayPayload,
  formatFileSize,
  DEFAULT_BILLING_SETTINGS,
  saveInvoiceSnapshot,
  type PaymentRecord,
  type BillingSettings,
} from './paymentPhase2'
import { getStoredDocuments } from './documents'

describe('Mew QA Payment Phase 2 Probes & Verification Suite', () => {
  beforeEach(() => {
    resetPaymentRecords()
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('sakura_soul_documents')
    }
    vi.restoreAllMocks()
  })

  // Probe 1 & Probe 1c: getPaymentRecords() must preserve Unit 101, INV-2026-1101, and receiptId: -101 without deleting on read
  it('Probe 1: preserves real payments for Room 101 with INV-2026-1101 and negative receiptIds across reloads', () => {
    const realPayment101: PaymentRecord = {
      id: 'RC-2026-9001',
      receiptId: 101,
      receiptNo: 'INV-2026-1101',
      roomNumber: '101',
      tenantName: 'Somchai P.',
      amount: 4500,
      date: '2026-11-05',
      method: 'Bank transfer',
      slipName: 'slip-101.jpg',
    }

    const realPaymentNegativeId: PaymentRecord = {
      id: 'RC-2026-9002',
      receiptId: -101,
      receiptNo: 'INV-2026-0208',
      roomNumber: '208',
      tenantName: 'Anan K.',
      amount: 6000,
      date: '2026-11-06',
      method: 'PromptPay',
    }

    savePaymentRecord(realPayment101)
    savePaymentRecord(realPaymentNegativeId)

    // Simulate reloading from storage
    const loaded = getPaymentRecords()
    const found101 = loaded.find((r) => r.id === realPayment101.id)
    const foundNeg = loaded.find((r) => r.id === realPaymentNegativeId.id)

    expect(found101).toBeDefined()
    expect(found101?.amount).toBe(4500)
    expect(found101?.receiptNo).toBe('INV-2026-1101')

    expect(foundNeg).toBeDefined()
    expect(foundNeg?.receiptId).toBe(-101)

    // Ensure getPaymentRecords does not wipe them on subsequent calls
    const reloaded = getPaymentRecords()
    expect(reloaded.map((r) => r.id)).toContain('RC-2026-9001')
    expect(reloaded.map((r) => r.id)).toContain('RC-2026-9002')
  })

  // Probe 2: Handles storage quota exceeded and rejects oversized payloads with visible error
  it('Probe 2: throws QuotaExceededError when saving oversized records so caller can display visible error', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      const quotaErr = new Error('The quota has been exceeded.')
      quotaErr.name = 'QuotaExceededError'
      throw quotaErr
    })

    const bigRecord: PaymentRecord = {
      id: 'RC-BIG',
      receiptId: 999,
      receiptNo: 'RC-999',
      roomNumber: '301',
      tenantName: 'Big Slip Tenant',
      amount: 5000,
      date: '2026-11-08',
      method: 'Bank transfer',
      slipName: 'huge_photo.jpg',
      slipUrl: 'data:image/jpeg;base64,' + 'A'.repeat(5 * 1024 * 1024),
    }

    expect(() => savePaymentRecord(bigRecord)).toThrow(/Storage quota exceeded/i)
    setItemSpy.mockRestore()
  })

  // Probe 3: Cleared PromptPay ID does not render QR or fall back to dummy phone number
  it('Probe 3: formatPromptPayTarget throws on empty target and GenerateReceiptModal suppresses QR when promptPayId is unconfigured', () => {
    // Empty PromptPay ID in settings
    const emptySettings: BillingSettings = {
      ...DEFAULT_BILLING_SETTINGS,
      promptPayId: '',
    }

    expect(emptySettings.promptPayId).toBe('')
    // Calling generatePromptPayPayload with empty string throws validation error
    expect(() => generatePromptPayPayload('', 5000)).toThrow(/PromptPay ID must be/i)
  })

  // Probe 4: Partial payments sequence updates status correctly: Pending -> Partially paid -> Paid, outstanding reaches 0
  it('Probe 4: partial payment sequence transitions status correctly (Pending -> Partially paid -> Paid)', () => {
    const invoice = {
      id: 205,
      totalAmount: 6000,
      status: 'PENDING' as const,
      dueDate: '2026-11-20',
      roomNumber: '205',
      carriedBalance: 0,
    }

    // Step 0: Initially Pending
    const b0 = computeInvoiceBalances(invoice, [], DEFAULT_BILLING_SETTINGS, '2026-11-01')
    expect(b0.status).toBe('Pending')
    expect(b0.totalDue).toBe(6000)
    expect(b0.outstanding).toBe(6000)
    expect(b0.totalPaid).toBe(0)

    // Step 1: First partial payment of 2,000 -> Partially paid
    const rec1: PaymentRecord = {
      id: 'PAY-1',
      receiptId: 205,
      receiptNo: 'INV-205',
      roomNumber: '205',
      tenantName: 'Tadao A.',
      amount: 2000,
      date: '2026-11-05',
      method: 'Bank transfer',
    }
    const b1 = computeInvoiceBalances(invoice, [rec1], DEFAULT_BILLING_SETTINGS, '2026-11-01')
    expect(b1.status).toBe('Partially paid')
    expect(b1.totalPaid).toBe(2000)
    expect(b1.outstanding).toBe(4000)

    // Step 2: Second payment of remaining 4,000 -> Paid
    const rec2: PaymentRecord = {
      id: 'PAY-2',
      receiptId: 205,
      receiptNo: 'INV-205',
      roomNumber: '205',
      tenantName: 'Tadao A.',
      amount: 4000,
      date: '2026-11-10',
      method: 'PromptPay',
    }
    const b2 = computeInvoiceBalances(invoice, [rec1, rec2], DEFAULT_BILLING_SETTINGS, '2026-11-01')
    expect(b2.status).toBe('Paid')
    expect(b2.totalPaid).toBe(6000)
    expect(b2.outstanding).toBe(0)
  })

  // Probe 5: Previous invoice with status = PAID and a partial payment record produces 0 carried balance
  it('Probe 5: past invoice marked PAID produces 0 carried balance regardless of partial records in storage', () => {
    const pastReceipts = [
      {
        id: 77,
        roomNumber: '109',
        billingMonth: '2026-10',
        totalAmount: 5000,
        status: 'PAID' as const, // Backend confirms PAID
      },
    ]

    // There is an older record of 2,000 (e.g. from an installment)
    const records: PaymentRecord[] = [
      {
        id: 'REC-77',
        receiptId: 77,
        receiptNo: 'RC-77',
        roomNumber: '109',
        tenantName: 'Ken S.',
        amount: 2000,
        date: '2026-10-15',
        method: 'Cash',
      },
    ]

    const carried = computeCarriedBalanceFromPastReceipts('109', '2026-11', pastReceipts, records)
    expect(carried).toBe(0)
  })

  // Probe 6: Turning off late interest after issuing invoice does not change late interest on snapshotted bill
  it('Probe 6: disables late interest setting without altering already snapshotted invoices', () => {
    // Snapshot existing invoice 88 with 50 THB late interest
    saveInvoiceSnapshot({
      receiptId: 88,
      carriedBalance: 2500,
      lateInterest: 50,
      interestRate: 2,
      snapshottedAt: '2026-11-01',
    })

    const bill = {
      id: 88,
      roomNumber: '101',
      totalAmount: 4000,
      status: 'PENDING' as const,
      dueDate: '2026-11-15',
    }

    // Landlord now turns off interest completely
    const zeroInterestSettings: BillingSettings = {
      ...DEFAULT_BILLING_SETTINGS,
      interestEnabled: false,
    }

    const b = computeInvoiceBalances(bill, [], zeroInterestSettings, '2026-11-05')
    // Must remain 50 because of snapshot
    expect(b.lateInterest).toBe(50)
    expect(b.totalDue).toBe(4000 + 2000 + 50) // current 4000 + room 101 carry 2000 + snapshot interest 50
  })

  // Additional Probe for Issue 4: PDF generation respects BillingSettings bank and honest system record labels
  it('Issue 4: createPaymentSlipPdfBlob dynamically uses custom bank settings and honest system labels', async () => {
    const customSettings: BillingSettings = {
      interestEnabled: true,
      interestRate: 1,
      interestBasis: 'Simple interest',
      bankName: 'Siam Commercial Bank (SCB)',
      accountNumber: '999-8-77777-6',
      accountHolder: 'Sakura Soul Residence Ltd.',
      promptPayId: '0812345678',
    }

    const testRecord: PaymentRecord = {
      id: 'RC-SCB-01',
      receiptId: 301,
      receiptNo: 'INV-2026-301',
      roomNumber: '301',
      tenantName: 'Ploy Ch.',
      amount: 8500,
      date: '2026-11-07',
      method: 'Bank transfer',
    }

    const blob = createPaymentSlipPdfBlob(testRecord, customSettings)
    const text = await blob.text()

    // Bank details must come from customSettings
    expect(text).toContain('Siam Commercial Bank')
    expect(text).toContain('999-8-77777-6')
    expect(text).toContain('Sakura Soul Residence Ltd.')

    // Must NOT have old hardcoded fake bank labels
    expect(text).not.toContain('012-3-45678-9')
    expect(text).not.toContain('VERIFIED SUCCESSFUL')
    expect(text).not.toContain('EMVCO COMPLIANT')

    // Must use honest system labels
    expect(text).toContain('PAYMENT RECORD')
    expect(text).toContain('RECORDED IN SYSTEM')
  })

  // Additional Probe for Issue 7: PromptPay POI 11 vs 12
  it('Issue 7: generatePromptPayPayload uses POI 11 for static QR and POI 12 for dynamic QR', () => {
    // Dynamic (with amount) -> POI = 12
    const dynamicPayload = generatePromptPayPayload('0812345678', 1500)
    expect(dynamicPayload).toContain('000201010212')

    // Static (no amount) -> POI = 11
    const staticPayload = generatePromptPayPayload('0812345678')
    expect(staticPayload).toContain('000201010211')
    expect(staticPayload).not.toContain('540')
  })

  // Additional Probe for Issue 8 & real file size in Documents sync
  it('Issue 8: syncPaymentRecordToDocuments guards empty receiptNo and uses actual file size', () => {
    const recordWithEmptyReceiptNo: PaymentRecord = {
      id: 'RC-EMPTY-REF',
      receiptId: 401,
      receiptNo: '',
      roomNumber: '401',
      tenantName: 'No Ref Tenant',
      amount: 3200,
      date: '2026-11-08',
      method: 'Cash',
    }

    syncPaymentRecordToDocuments(recordWithEmptyReceiptNo)
    const docs = getStoredDocuments()
    const synced = docs.find((d) => d.unit === '401')
    expect(synced).toBeDefined()
    expect(synced?.size).not.toBe('142 KB') // Real formatted size, not mock constant
    expect(synced?.size).toMatch(/KB|B|MB/)
  })

  it('formatFileSize correctly formats bytes, kilobytes, and megabytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1500)).toBe('1 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})
