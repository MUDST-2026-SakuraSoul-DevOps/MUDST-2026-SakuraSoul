// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BILLING_SETTINGS,
  INITIAL_PAYMENT_RECORDS,
  compressImageSlip,
  getBillingSettings,
  getInvoiceSnapshots,
  getPaymentRecords,
  resetInvoiceSnapshots,
  resetPaymentRecords,
  saveBillingSettings,
  saveInvoiceSnapshot,
  savePaymentRecord,
} from './paymentPhase2'

/*
  ฟังก์ชันพวกนี้เช็ค typeof window ไว้ เผื่อถูกเรียกนอกเบราว์เซอร์ (เช่นตอน import ในสคริปต์หรือ SSR)
  ไฟล์นี้รันใน environment node ที่ไม่มี window เลย ต้องได้ค่าตั้งต้นและไม่โยน error
*/
describe('paymentPhase2 outside a browser', () => {
  it('reads defaults and ignores writes when there is no window', () => {
    expect(typeof window).toBe('undefined')
    expect(getBillingSettings()).toEqual(DEFAULT_BILLING_SETTINGS)
    expect(getInvoiceSnapshots()).toEqual({})
    expect(getPaymentRecords()).toEqual(INITIAL_PAYMENT_RECORDS)

    expect(() => saveBillingSettings(DEFAULT_BILLING_SETTINGS)).not.toThrow()
    expect(() =>
      saveInvoiceSnapshot({ receiptId: 1, carriedBalance: 0, lateInterest: 0, interestRate: 1, snapshottedAt: 'x' }),
    ).not.toThrow()
    expect(() => resetInvoiceSnapshots()).not.toThrow()
    expect(() => resetPaymentRecords()).not.toThrow()
    expect(() =>
      savePaymentRecord({ id: 'x', receiptId: 1, receiptNo: 'R', roomNumber: '1', tenantName: 'T', amount: 1, date: '2026-01-01' }),
    ).not.toThrow()
  })

  it('cannot shrink a slip without a browser and returns an empty string', async () => {
    const notABlob = { name: 'slip.png', type: 'image/png' } as unknown as File
    expect(await compressImageSlip(notABlob)).toBe('')
  })
})
