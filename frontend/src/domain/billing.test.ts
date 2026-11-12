import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApartmentConfig, Lease, Receipt } from '../api/types'
import { previewBill, readMeter, roundMoney, tenantPaymentStatus, toReceiptData } from './billing'
import { invoiceBalances } from './paymentLedger'

const config: ApartmentConfig = {
  electricRatePerUnit: 50,
  waterRatePerUnit: 100,
  commonAreaFee: 300,
  internetFee: 250,
  updatedAt: '2026-09-01',
}

const lease: Lease = {
  id: 1,
  roomId: 1,
  roomNumber: '101',
  tenantId: 1,
  tenantName: 'Yuki Tanaka',
  startDate: '2026-01-01',
  endDate: null,
  monthlyRent: 3500,
  billingCycle: 'MONTHLY',
  status: 'ACTIVE',
}

describe('readMeter', () => {
  it('accepts zero and decimal readings', () => {
    expect(readMeter('0', 'water')).toEqual({ units: 0, error: null })
    expect(readMeter('12.5', 'electricity')).toEqual({ units: 12.5, error: null })
  })

  it('rejects empty and unreadable input instead of treating it as zero', () => {
    expect(readMeter('', 'electricity').error).toBe('Please enter the electricity units')
    expect(readMeter('  ', 'water').error).toBe('Please enter the water units')
    expect(readMeter('abc', 'water').error).toBe('Please enter the water units')
  })

  it('rejects negative units with the backend message', () => {
    expect(readMeter('-5', 'electricity')).toEqual({ units: null, error: 'Electricity units cannot be negative' })
    expect(readMeter('-0.1', 'water').error).toBe('Water units cannot be negative')
  })
})

describe('previewBill', () => {
  it('adds the five fixed lines like the backend, checked by hand', () => {
    // 3,500 + 300 + 250 + 120×50 (6,000) + 15×100 (1,500) = 11,550
    const { lines, total } = previewBill(lease, config, 120, 15)
    expect(lines.map((l) => [l.item, l.amount])).toEqual([
      ['Room rent', 3500],
      ['Common area fee', 300],
      ['Internet', 250],
      ['Electricity', 6000],
      ['Water', 1500],
    ])
    expect(total).toBe(11550)
  })

  it('uses the rates locked on the contract over the current Config', () => {
    const locked = { ...lease, electricRatePerUnit: 77, waterRatePerUnit: 18, commonAreaFee: 0, internetFee: 100 }
    // 3,500 + 0 + 100 + 10×77 (770) + 2×18 (36) = 4,406
    expect(previewBill(locked, { ...config, electricRatePerUnit: 99 }, 10, 2).total).toBe(4406)
  })

  it('charges one month of rent for a YEARLY lease instead of multiplying it by twelve (SSK-147)', () => {
    const yearlyLease = { ...lease, billingCycle: 'YEARLY' as const }

    const { lines, total } = previewBill(yearlyLease, config, 0, 0)

    expect(lines.find((line) => line.item === 'Room rent')?.amount).toBe(3500)
    expect(total).toBe(4050)
  })

  it('rounds each line to two decimals before adding them up', () => {
    // 0.333 × 10 = 3.33 ต่อบรรทัด สองบรรทัดรวม 6.66 ไม่ใช่ 6.67 ที่ได้จากการปัดตอนท้าย
    const fractional = { ...lease, monthlyRent: 0, commonAreaFee: 0, internetFee: 0, electricRatePerUnit: 0.333, waterRatePerUnit: 0.333 }
    expect(previewBill(fractional, config, 10, 10).total).toBe(6.66)
    expect(roundMoney(2.675)).toBe(2.68)
  })

  it('adds the extra charges due this month after the five fixed lines, as flat lines (SSK-165)', () => {
    // บรรทัดมาตรฐานชุดเดียวกับเทสแรก 11,550 + ที่จอดรถ 500 + ทำคีย์การ์ดใหม่ 150.50 = 12,200.50
    const { lines, total } = previewBill(lease, config, 120, 15, [
      { label: 'Parking', amount: 500 },
      { label: 'Key card replacement', amount: 150.5 },
    ])
    expect(lines.map((l) => l.item)).toEqual([
      'Room rent', 'Common area fee', 'Internet', 'Electricity', 'Water', 'Parking', 'Key card replacement',
    ])
    expect(lines.slice(5)).toEqual([
      { item: 'Parking', usageValue: null, rate: null, amount: 500 },
      { item: 'Key card replacement', usageValue: null, rate: null, amount: 150.5 },
    ])
    expect(total).toBe(12200.5)
  })
})

describe('toReceiptData', () => {
  /*
    ป้ายมาจาก status กับธง overdue ของ backend ไม่ได้อ่านนาฬิกา ใบนี้จึงได้ Pending ทุกวันที่รัน
    (เดิมคิดจากวันครบกำหนดกับวันนี้ เทสนี้เลยแดงเองตั้งแต่ 6 ต.ค. โดยที่ไม่มีใครแก้โค้ด)
  */
  it('maps an API receipt to what the receipt popup and print use', () => {
    const receipt: Receipt = {
      id: 9,
      receiptNo: 'RC-2026-0009',
      leaseId: 1,
      roomNumber: '103',
      tenantName: 'Yuki Tanaka',
      tenantEmail: null,
      billingMonth: '2026-09',
      issuedAt: '2026-09-11T14:05:22Z',
      dueDate: '2026-10-05',
      status: 'PENDING',
      items: [{ item: 'Room rent', detail: null, usageValue: null, usageUnit: null, rate: null, amount: 3500 }],
      totalAmount: 3500,
      paidAt: null,
      paymentMethod: null,
      lastSentAt: null,
      sentCount: 0,
    }
    expect(toReceiptData(receipt)).toEqual({
      receiptNo: 'RC-2026-0009',
      tenant: 'Yuki Tanaka',
      unit: '103',
      billingMonth: 'September 2026',
      dueDate: '5 Oct 2026',
      items: [{ id: 'Room rent', item: 'Room rent', detail: undefined, usageValue: undefined, usageUnit: undefined, rate: undefined, amount: 3500 }],
      totalAmount: 3500,
      status: 'Pending',
      paidDate: undefined,
      paymentMethod: undefined,
    })
  })

  it('passes the balances, bank snapshot and payment of a settled bill on to the popup (SSK-163, SSK-164, SSK-168)', () => {
    // ค่าเดือนนี้ 4,638 + ยอดยกมา 1,200 + ดอกเบี้ย 1% ของ 1,200 = 12 รวม 5,850 โอนครบแล้ว
    const bank = { bankName: 'Kasikornbank', accountName: 'Sakura Soul Apartment', accountNumber: '012-3-45678-9', promptPayId: '0812345678' }
    const flat = (item: string, amount: number, detail: string | null = null) =>
      ({ item, detail, usageValue: null, usageUnit: null, rate: null, amount })
    const receipt: Receipt = {
      id: 9, receiptNo: 'RC-2026-0009', leaseId: 1, roomNumber: '103', tenantName: 'Yuki Tanaka', tenantEmail: null,
      billingMonth: '2026-08', issuedAt: '2026-08-11T14:05:22Z', dueDate: '2026-09-05', status: 'PAID',
      items: [
        flat('Room rent', 3500), flat('Common area fee', 300), flat('Internet', 250),
        { item: 'Electricity', detail: null, usageValue: 60, usageUnit: 'units', rate: 8, amount: 480 },
        { item: 'Water', detail: null, usageValue: 6, usageUnit: 'units', rate: 18, amount: 108 },
        flat('Previous balance', 1200, 'RC-2026-0005'), flat('Late interest', 12, '1.00% of ฿1,200.00'),
      ],
      totalAmount: 5850, paidAt: '2026-08-30T06:00:00Z', paymentMethod: 'Bank transfer', lastSentAt: null, sentCount: 1,
      latest: true, previousBalance: 1200, interestAmount: 12, paidAmount: 5850, settledAmount: 4650, balanceDue: 0,
      outstandingAmount: 0, overdue: false, carriedToReceiptNo: null, paidOn: '2026-08-30', bank, promptPayPayload: null,
      payments: [{ id: 5, amount: 5850, paidOn: '2026-08-30', method: 'TRANSFER', reference: null, note: null, voidedAt: null }],
    }

    const data = toReceiptData(receipt)

    expect(data).toMatchObject({
      status: 'Paid', paidDate: '30 Aug 2026', paymentMethod: 'Bank transfer', totalAmount: 5850,
      bank, promptPayPayload: null, carriedToReceiptNo: null, balanceDue: 0, outstandingAmount: 0,
      previousBalance: 1200, interestAmount: 12, paidAmount: 5850,
    })
    expect(data.items.slice(3)).toEqual([
      { id: 'Electricity', item: 'Electricity', detail: undefined, usageValue: 60, usageUnit: 'units', rate: 8, amount: 480 },
      { id: 'Water', item: 'Water', detail: undefined, usageValue: 6, usageUnit: 'units', rate: 18, amount: 108 },
      { id: 'Previous balance', item: 'Previous balance', detail: 'RC-2026-0005', usageValue: undefined, usageUnit: undefined, rate: undefined, amount: 1200 },
      { id: 'Late interest', item: 'Late interest', detail: '1.00% of ฿1,200.00', usageValue: undefined, usageUnit: undefined, rate: undefined, amount: 12 },
    ])
  })
})

/*
  SSK-16 ป้ายของใบที่พิมพ์หรือดาวน์โหลดต้องตรงกับตารางและป็อปอัป ซึ่งอ่านจาก invoiceBalances (paymentLedger.ts)
  Overdue มาจากธง overdue ของ backend ธงนี้มีเฉพาะใบล่าสุด และคิดจากวันครบกำหนดของใบเก่าสุดที่ยังค้าง
  ไม่ใช่วันครบกำหนดของใบนี้เอง ตรึงนาฬิกาไว้ 25 ก.ย. 2026 ก่อนวันครบกำหนดของใบ ก.ย. (5 ต.ค.)
  ถ้าป้ายกลับไปคิดจากวันที่เมื่อไหร่ เทสชุดนี้แดงทุกครั้งไม่ขึ้นกับวันที่รัน

  ใบ ก.ย. 2026 ห้อง 103: 3,500 + 300 + 250 + 60×8 (480) + 6×18 (108) = 4,638
*/
describe('toReceiptData status is the label of the table and popup (SSK-16)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-25T03:00:00Z') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const flat = (item: string, amount: number, detail: string | null = null) =>
    ({ item, detail, usageValue: null, usageUnit: null, rate: null, amount })
  const lines = [
    flat('Room rent', 3500), flat('Common area fee', 300), flat('Internet', 250),
    { item: 'Electricity', detail: null, usageValue: 60, usageUnit: 'units', rate: 8, amount: 480 },
    { item: 'Water', detail: null, usageValue: 6, usageUnit: 'units', rate: 18, amount: 108 },
  ]

  function bill(overrides: Partial<Receipt> = {}): Receipt {
    return {
      id: 9, receiptNo: 'RC-2026-0009', leaseId: 1, roomNumber: '103', tenantName: 'Yuki Tanaka', tenantEmail: null,
      billingMonth: '2026-09', issuedAt: '2026-09-11T14:05:22Z', dueDate: '2026-10-05', status: 'PENDING',
      items: lines, totalAmount: 4638, paidAt: null, paymentMethod: null, lastSentAt: null, sentCount: 0,
      latest: true, previousBalance: 0, interestAmount: 0, paidAmount: 0, settledAmount: 0, balanceDue: 4638,
      outstandingAmount: 4638, overdue: false, carriedToReceiptNo: null, paidOn: null, payments: [], bank: null,
      promptPayPayload: null, ...overrides,
    }
  }

  it('a bill paid in part and now past due is Overdue, not Partially paid', () => {
    // ใบ ส.ค. ครบกำหนด 5 ก.ย. จ่ายมา 1,500 ยังเหลือ 4,638 − 1,500 = 3,138 backend จึงส่ง overdue: true
    const receipt = bill({ billingMonth: '2026-08', dueDate: '2026-09-05', status: 'PARTIAL', paidAmount: 1500,
      settledAmount: 1500, balanceDue: 3138, outstandingAmount: 3138, overdue: true })

    expect(invoiceBalances(receipt).status).toBe('Overdue')
    expect(toReceiptData(receipt).status).toBe('Overdue')
  })

  it('a bill not yet due that carries a late balance is Overdue, because the carried debt is late', () => {
    // ใบ ก.ย. ยังไม่ถึงกำหนด (5 ต.ค.) แต่ยกยอด 1,200 ของใบ ส.ค. ที่เลยกำหนด 5 ก.ย. มาด้วย รวม 4,638 + 1,200 = 5,838
    const receipt = bill({ items: [...lines, flat('Previous balance', 1200, 'RC-2026-0008')], totalAmount: 5838,
      previousBalance: 1200, balanceDue: 5838, overdue: true })

    expect(invoiceBalances(receipt).status).toBe('Overdue')
    expect(toReceiptData(receipt).status).toBe('Overdue')
  })

  it('a carried bill past its own due date stays Pending like its row, since it is paid through the newer bill', () => {
    // ใบ ก.ค. ครบกำหนด 5 ส.ค. ยอดถูกยกไปใบ ส.ค. แล้ว ไม่ใช่ใบล่าสุด backend ส่ง overdue: false กับ balanceDue: null
    const receipt = bill({ billingMonth: '2026-07', dueDate: '2026-08-05', latest: false, balanceDue: null,
      carriedToReceiptNo: 'RC-2026-0008' })

    expect(invoiceBalances(receipt).status).toBe('Pending')
    expect(toReceiptData(receipt).status).toBe('Pending')
  })

  it('agrees with invoiceBalances for every state the backend sends', () => {
    const partPaid = { paidAmount: 1500, settledAmount: 1500, balanceDue: 3138, outstandingAmount: 3138 }
    const settled = { paidAmount: 4638, settledAmount: 4638, balanceDue: 0, outstandingAmount: 0, paidAt: '2026-09-20T06:00:00Z' }
    const carried = { latest: false, balanceDue: null, carriedToReceiptNo: 'RC-2026-0010', dueDate: '2026-08-05' }
    const states: [string, Partial<Receipt>, string][] = [
      ['latest, not yet due', {}, 'Pending'],
      ['latest, late', { overdue: true, dueDate: '2026-09-05' }, 'Overdue'],
      ['latest, paid in part', { status: 'PARTIAL', ...partPaid }, 'Partially paid'],
      ['latest, paid in part and late', { status: 'PARTIAL', ...partPaid, overdue: true, dueDate: '2026-09-05' }, 'Overdue'],
      ['latest, paid', { status: 'PAID', ...settled }, 'Paid'],
      ['carried, unpaid', { ...carried }, 'Pending'],
      ['carried, paid in part', { ...carried, status: 'PARTIAL', paidAmount: 1000, settledAmount: 1000, outstandingAmount: 3638 }, 'Partially paid'],
      ['older bill, paid', { status: 'PAID', ...settled, latest: false, balanceDue: null, dueDate: '2026-08-05' }, 'Paid'],
    ]
    for (const [name, overrides, label] of states) {
      const receipt = bill(overrides)
      expect(invoiceBalances(receipt).status, name).toBe(label)
      expect(toReceiptData(receipt).status, name).toBe(label)
    }
  })
})

/*
  SSK-16 ปัดที่จำนวนเต็มสตางค์ เดิมบวก Number.EPSILON ซึ่งช่วยไม่ได้เมื่อค่าใหญ่กว่า 1
  หน่วยมีทศนิยม 10.5 × ฿6.55 = 68.775 พอดี backend (HALF_UP) ได้ 68.78 แต่ float คูณได้ 68.77499… วิธีเดิมได้ 68.77
*/
describe('roundMoney (SSK-16)', () => {
  it('rounds half up at the satang like BigDecimal on the backend, even where floats drift', () => {
    expect(roundMoney(10.5 * 6.55)).toBe(68.78)
    expect(roundMoney(8.575)).toBe(8.58)
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(1234.565)).toBe(1234.57)
    expect(roundMoney(0.125)).toBe(0.13)
  })

  it('keeps values that are already exact', () => {
    expect(roundMoney(5000)).toBe(5000)
    expect(roundMoney(12.34)).toBe(12.34)
    expect(roundMoney(0)).toBe(0)
  })
})

describe('tenantPaymentStatus (SSK-16)', () => {
  type TenantReceipt = Parameters<typeof tenantPaymentStatus>[0][number]
  /**
   * backend ยกยอดค้างของใบเก่าทุกใบไปรวมในใบล่าสุดของสัญญา และส่ง balanceDue กับ overdue มาเฉพาะใบล่าสุด
   * overdue = ยังมียอดต้องจ่าย และวันนี้เลยวันครบกำหนดของใบเก่าสุดที่ยังค้างแล้ว (ReceiptDtos.ReceiptResponse)
   */
  const latest = (leaseId: number, status: Receipt['status'], balanceDue: number, overdue: boolean) =>
    ({ leaseId, status, dueDate: overdue ? '2026-09-05' : '2026-10-05', latest: true, balanceDue, overdue }) as TenantReceipt
  /** ใบก่อนหน้าของสัญญา (ไม่ใช่ใบล่าสุด) ไม่มี balanceDue และ overdue เป็น false เสมอ */
  const older = (leaseId: number, status: Receipt['status'], dueDate: string) =>
    ({ leaseId, status, dueDate, latest: false, balanceDue: null, overdue: false }) as TenantReceipt

  it('Overdue wins over Pending, across all of the tenant leases', () => {
    const receipts = [latest(1, 'PENDING', 4000, false), latest(2, 'PENDING', 1500, true)]
    expect(tenantPaymentStatus(receipts, [1, 2])).toBe('Overdue')
  })

  it('Pending when something is unpaid but nothing is late', () => {
    expect(tenantPaymentStatus([older(1, 'PAID', '2026-09-05'), latest(1, 'PENDING', 4000, false)], [1])).toBe(
      'Pending',
    )
  })

  it('Overdue for a receipt paid only in part and now late, not hidden behind the lease status', () => {
    expect(tenantPaymentStatus([latest(1, 'PARTIAL', 2500, true)], [1])).toBe('Overdue')
  })

  it('Pending for a receipt paid only in part that is not due yet', () => {
    expect(tenantPaymentStatus([latest(1, 'PARTIAL', 2500, false)], [1])).toBe('Pending')
  })

  it('null when everything is paid, so the page falls back to the lease status', () => {
    expect(tenantPaymentStatus([older(1, 'PAID', '2026-08-05'), latest(1, 'PAID', 0, false)], [1])).toBeNull()
  })

  it('ignores receipts of other tenants', () => {
    expect(tenantPaymentStatus([latest(9, 'PENDING', 4000, true)], [1])).toBeNull()
  })
})
