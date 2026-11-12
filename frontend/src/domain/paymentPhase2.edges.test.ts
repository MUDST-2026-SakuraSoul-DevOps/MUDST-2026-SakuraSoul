import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BILLING_SETTINGS,
  INITIAL_PAYMENT_RECORDS,
  asciiOr,
  buildReportRows,
  syncPaymentRecordToDocuments,
  compressImageSlip,
  computeCarriedBalanceFromPastReceipts,
  computeInvoiceBalances,
  createPaymentSlipPdfBlob,
  getBillingSettings,
  getInvoiceSnapshots,
  getPaymentRecords,
  resetInvoiceSnapshots,
  resetPaymentRecords,
  saveBillingSettings,
  saveInvoiceSnapshot,
  savePaymentRecord,
  type PaymentRecord,
} from './paymentPhase2'
import { getStoredDocuments } from './documents'

/*
  ทางแยกของ paymentPhase2 ที่เทสชุดอื่นไม่ได้เดิน
  - localStorage เสีย/เต็ม/อ่านไม่ได้ ต้องไม่ทำให้หน้า Payments พัง
  - ย้ายข้อมูลการจ่ายจาก key รุ่นเก่า
  - ยอดยกมาที่คิดจากบิลเก่าของห้องเดียวกัน
  - ย่อรูปสลิปเมื่อเบราว์เซอร์มี/ไม่มี canvas
*/

function record(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'PAY-1',
    receiptId: 10,
    receiptNo: 'RC-2026-0010',
    roomNumber: '201',
    tenantName: 'Kenji Sato',
    amount: 1000,
    date: '2026-11-10',
    method: 'Cash',
    ...overrides,
  }
}

async function textOf(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsText(blob)
  })
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('stored billing settings and snapshots', () => {
  it('falls back to defaults when storage holds broken JSON or cannot be read', () => {
    localStorage.setItem('sakura_billing_settings', '{not json')
    expect(getBillingSettings()).toEqual(DEFAULT_BILLING_SETTINGS)

    localStorage.setItem('sakura_invoice_snapshots', '{not json')
    expect(getInvoiceSnapshots()).toEqual({})

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(getBillingSettings()).toEqual(DEFAULT_BILLING_SETTINGS)
    expect(getPaymentRecords()).toEqual(INITIAL_PAYMENT_RECORDS)
  })

  it('keeps working silently when storage refuses to write or delete', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => saveBillingSettings(DEFAULT_BILLING_SETTINGS)).not.toThrow()
    expect(() =>
      saveInvoiceSnapshot({ receiptId: 1, carriedBalance: 0, lateInterest: 0, interestRate: 1, snapshottedAt: 'x' }),
    ).not.toThrow()
    expect(() => resetInvoiceSnapshots()).not.toThrow()
    expect(() => resetPaymentRecords()).not.toThrow()
  })

  it('saves, reads back and clears a snapshot', () => {
    saveInvoiceSnapshot({ receiptId: 5, carriedBalance: 2000, lateInterest: 20, interestRate: 1, snapshottedAt: 'now' })
    expect(getInvoiceSnapshots()[5].lateInterest).toBe(20)

    resetInvoiceSnapshots()
    expect(getInvoiceSnapshots()).toEqual({})
  })
})

describe('payment records storage', () => {
  it('moves records saved under the old key to the new one', () => {
    const legacy = [record({ id: 'OLD-1' })]
    localStorage.setItem('sakura_payment_records', JSON.stringify(legacy))

    expect(getPaymentRecords()).toEqual(legacy)
    expect(JSON.parse(localStorage.getItem('sakura_payment_records_v2')!)).toEqual(legacy)
  })

  it('ignores an empty or broken old key and starts from the seed records', () => {
    localStorage.setItem('sakura_payment_records', '[]')
    expect(getPaymentRecords()).toEqual(INITIAL_PAYMENT_RECORDS)

    localStorage.setItem('sakura_payment_records', '{broken')
    expect(getPaymentRecords()).toEqual(INITIAL_PAYMENT_RECORDS)
  })

  it.each([
    ['QuotaExceededError', Object.assign(new Error('full'), { name: 'QuotaExceededError' })],
    ['NS_ERROR_DOM_QUOTA_REACHED (Firefox)', Object.assign(new Error('full'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' })],
    ['a message that mentions the quota', new Error('The quota has been exceeded')],
  ])('turns %s into a message about the proof file size', (_case, failure) => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw failure
    })
    expect(() => savePaymentRecord(record())).toThrow('Storage quota exceeded. Please choose a smaller payment proof file.')
  })

  it('passes any other storage failure through unchanged', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw 'disk on fire'
    })
    expect(() => savePaymentRecord(record())).toThrow('disk on fire')
  })
})

describe('createPaymentSlipPdfBlob fallbacks', () => {
  it('prints placeholders for empty bank details and a Thai-only tenant name', async () => {
    const text = await textOf(
      createPaymentSlipPdfBlob(record({ tenantName: 'สมชาย', roomNumber: '', slipName: undefined, method: undefined }), {
        ...DEFAULT_BILLING_SETTINGS,
        bankName: '',
        accountNumber: '',
        accountHolder: '',
      }),
    )

    expect(text).toContain('Bank             : See billing settings')
    expect(text).toContain('Account Number   : See billing settings')
    expect(text).toContain('Account Name     : See billing settings')
    expect(text).toContain('Tenant Name      : Tenant \\(Thai name - see app\\)')
    expect(text).toContain('Proof File       : PAY-1.pdf')
    expect(text).toContain('Payment Method   : Unspecified')
  })
})

describe('syncPaymentRecordToDocuments', () => {
  it('files one receipt per payment and does not add it twice', () => {
    syncPaymentRecordToDocuments(record({ id: 'PAY-9', receiptNo: 'RC-9', slipName: 'proof.jpg', date: '' }))
    syncPaymentRecordToDocuments(record({ id: 'PAY-9', receiptNo: 'RC-9', slipName: 'proof.jpg', date: '' }))

    const mine = getStoredDocuments().filter((d) => d.name === 'Payment receipt · RC-9')
    expect(mine).toHaveLength(1)
    // ไม่มีวันที่จ่ายก็ลงวันนี้
    expect(mine[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('recognises an existing receipt of the same unit by payment id or invoice number', () => {
    syncPaymentRecordToDocuments(record({ id: 'PAY-7', receiptNo: '' }))
    const before = getStoredDocuments().length
    // ชื่อเอกสารมี PAY-7 อยู่แล้วในห้องเดียวกัน ไม่เพิ่มใหม่ แม้เลขบิลต่าง
    syncPaymentRecordToDocuments(record({ id: 'PAY-7', receiptNo: 'RC-NEW' }))
    expect(getStoredDocuments()).toHaveLength(before)

    syncPaymentRecordToDocuments(record({ id: 'PAY-8', receiptNo: 'RC-2026-0010' }))
    const afterFirst = getStoredDocuments().length
    syncPaymentRecordToDocuments(record({ id: '', receiptNo: 'RC-2026-0010', slipName: undefined }))
    expect(getStoredDocuments()).toHaveLength(afterFirst)
  })
})

describe('asciiOr', () => {
  it('uses the fallback for blank or non-ASCII text', () => {
    expect(asciiOr('   ', 'fallback')).toBe('fallback')
    expect(asciiOr(null, 'fallback')).toBe('fallback')
    expect(asciiOr('ธนาคาร', 'fallback')).toBe('fallback')
    expect(asciiOr('  KBank  ', 'fallback')).toBe('KBank')
  })
})

describe('computeCarriedBalanceFromPastReceipts', () => {
  const receipts = [
    { id: 1, roomNumber: '201', billingMonth: '2026-09', totalAmount: 5000, status: 'PAID' as const },
    { id: 2, roomNumber: '201', billingMonth: '2026-10', totalAmount: 5000, status: 'PARTIAL' as const },
    { id: 3, roomNumber: '201', billingMonth: '2026-10', totalAmount: 800, status: 'PENDING' as const },
    { id: 4, roomNumber: '201', billingMonth: '2026-11', totalAmount: 5000, status: 'PENDING' as const },
    { id: 5, roomNumber: '305', billingMonth: '2026-10', totalAmount: 9999, status: 'PENDING' as const },
  ]

  it('adds up what is still unpaid on earlier bills of the same unit only', () => {
    const records = [record({ receiptId: 2, amount: 3000 }), record({ receiptId: 3, amount: 900 })]
    // บิล 2 ค้าง 2,000 บิล 3 จ่ายเกินถือว่าไม่ค้าง บิล 1 จ่ายแล้ว บิล 4 เป็นเดือนปัจจุบัน บิล 5 คนละห้อง
    expect(computeCarriedBalanceFromPastReceipts('201', '2026-11', receipts, records)).toBe(2000)
  })

  it('uses the seeded carry-over when the unit has no earlier bill', () => {
    expect(computeCarriedBalanceFromPastReceipts('101', '2026-11', [], [])).toBe(2000)
    expect(computeCarriedBalanceFromPastReceipts('101', '2026-11', null as never, [])).toBe(2000)
    expect(computeCarriedBalanceFromPastReceipts('101', '2026-11', receipts, [])).toBe(2000)
    expect(computeCarriedBalanceFromPastReceipts('999', '2026-11', receipts, [])).toBe(0)
  })

  it('is what computeInvoiceBalances uses when the bill itself says nothing about carry-over', () => {
    const balances = computeInvoiceBalances(
      { id: 4, roomNumber: '201', billingMonth: '2026-11', totalAmount: 5000 },
      [],
      { ...DEFAULT_BILLING_SETTINGS, interestEnabled: false },
      '2026-11-13',
      receipts,
      {},
    )
    // ค้าง 5,000 (บิล 2) + 800 (บิล 3) ไม่มีการจ่าย
    expect(balances.carriedBalance).toBe(5800)
    expect(balances.totalDue).toBe(10800)
  })
})

describe('computeInvoiceBalances priority', () => {
  it('prefers the interest the API sent over a snapshot and the settings', () => {
    const balances = computeInvoiceBalances(
      { id: 9, totalAmount: 6020, previousBalance: 1000, interestAmount: 20 },
      [],
      DEFAULT_BILLING_SETTINGS,
      '2026-11-13',
      undefined,
      { 9: { receiptId: 9, carriedBalance: 0, lateInterest: 999, interestRate: 1, snapshottedAt: 'x' } },
    )
    expect(balances.lateInterest).toBe(20)
    expect(balances.carriedBalance).toBe(1000)
    expect(balances.currentCharges).toBe(5000)
    expect(balances.totalDue).toBe(6020)
  })

  it('uses the interest frozen on the bill before the stored snapshot', () => {
    const balances = computeInvoiceBalances(
      { id: 9, totalAmount: 5000, carriedBalance: 1000, interestSnapshot: 15 },
      [],
      DEFAULT_BILLING_SETTINGS,
      '2026-11-13',
      undefined,
      {},
    )
    expect(balances.lateInterest).toBe(15)
  })

  it('treats a PAID bill without payment rows as fully paid', () => {
    const balances = computeInvoiceBalances({ id: 3, totalAmount: 4000, status: 'PAID', carriedBalance: 0 }, [], undefined, '2026-11-13', undefined, {})
    expect(balances.totalPaid).toBe(4000)
    expect(balances.status).toBe('Paid')
  })
})

describe('buildReportRows month labels', () => {
  it('leaves a month it cannot read as it was', () => {
    const rows = buildReportRows([
      { receipt: { roomNumber: '201', tenantName: 'K', billingMonth: '2026-13', totalAmount: 1 }, balances: { totalDue: 1, totalPaid: 0, outstanding: 1 } },
      { receipt: { roomNumber: '201', tenantName: 'K', billingMonth: 'Nov 2026', totalAmount: 1 }, balances: { totalDue: 1, totalPaid: 0, outstanding: 1 } },
    ])
    expect(rows.map((r) => r.month)).toEqual(['2026-13', 'Nov 2026'])
  })
})

describe('compressImageSlip', () => {
  const PNG = new File([new Uint8Array([137, 80, 78, 71])], 'slip.png', { type: 'image/png' })

  /** Image ปลอม เรียก onload/onerror เองหลังตั้ง src เหมือนเบราว์เซอร์ */
  function fakeImage(width: number, height: number, fail = false) {
    class FakeImage {
      width = width
      height = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()))
      }
    }
    vi.stubGlobal('Image', FakeImage)
  }

  afterEach(() => vi.unstubAllGlobals())

  it('reads a PDF proof as-is instead of trying to shrink it', async () => {
    const pdf = new File(['%PDF-1.4'], 'slip.pdf', { type: 'application/pdf' })
    expect(await compressImageSlip(pdf)).toMatch(/^data:application\/pdf;base64,/)
  })

  it('guesses from the file name when the browser gives no type', async () => {
    fakeImage(100, 100)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,SMALL')

    expect(await compressImageSlip(new File(['x'], 'slip.JPG'))).toBe('data:image/jpeg;base64,SMALL')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 100, 100)
  })

  it('scales a large photo down to fit inside the limit, keeping its shape', async () => {
    fakeImage(4000, 2000)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,SMALL')

    await compressImageSlip(PNG, 800, 1000)

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 400)
  })

  it('keeps the original image when it cannot be drawn', async () => {
    fakeImage(10, 10)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(await compressImageSlip(PNG)).toMatch(/^data:image\/png;base64,/)

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      drawImage: () => {
        throw new Error('tainted')
      },
    } as unknown as CanvasRenderingContext2D)
    expect(await compressImageSlip(PNG)).toMatch(/^data:image\/png;base64,/)
  })

  it('keeps the original when the browser cannot decode the image', async () => {
    fakeImage(10, 10, true)
    expect(await compressImageSlip(PNG)).toMatch(/^data:image\/png;base64,/)
  })

  it('keeps the original when creating the image throws', async () => {
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          throw new Error('no images here')
        }
      },
    )
    expect(await compressImageSlip(PNG)).toMatch(/^data:image\/png;base64,/)
  })

  it('returns an empty string when the file cannot be read', async () => {
    const realReader = globalThis.FileReader
    class BrokenReader {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('FileReader', BrokenReader)
    fakeImage(10, 10)

    expect(await compressImageSlip(PNG)).toBe('')
    expect(await compressImageSlip(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe('')
    vi.stubGlobal('FileReader', realReader)
  })

  it('returns an empty string for something that is not a file', async () => {
    const notAFile = { name: 'slip.pdf', type: 'application/pdf' } as unknown as File
    expect(await compressImageSlip(notAFile)).toBe('')
    const notAnImageFile = { name: 'slip.png', type: 'image/png' } as unknown as File
    expect(await compressImageSlip(notAnImageFile)).toBe('')
  })
})
