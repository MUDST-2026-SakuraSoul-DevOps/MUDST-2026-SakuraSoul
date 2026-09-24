import { describe, expect, it } from 'vitest'
import { formatReceiptText, type ReceiptData } from './receipt'

function receipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    receiptNo: 'RC-2026-0042',
    tenant: 'Aiko Tanaka',
    unit: '102',
    billingMonth: 'September 2026',
    dueDate: '5 Oct 2026',
    items: [
      { id: 'rent', item: 'Room rent', amount: 3500 },
      { id: 'electric', item: 'Electricity', usageValue: 120, usageUnit: 'units', rate: 8, amount: 960 },
      { id: 'water', item: 'Water', usageValue: 15, usageUnit: 'units', rate: 18, amount: 270 },
    ],
    totalAmount: 4730,
    status: 'Pending',
    ...overrides,
  }
}

describe('formatReceiptText', () => {
  it('uses the provided receipt identity, meter usage, rates, and total', () => {
    const text = formatReceiptText(receipt())
    expect(text).toContain('RC-2026-0042')
    expect(text).toContain('Aiko Tanaka')
    expect(text).toContain('102')
    expect(text).toContain('September 2026')
    expect(text).toContain('120 units')
    expect(text).toContain('15 units')
    expect(text).toContain('฿8.00')
    expect(text).toContain('฿18.00')
    expect(text).toContain('Total Amount:   ฿4,730.00')
    expect(text).not.toContain('Somchai P.')
  })

  it('includes optional line-item details and payment information only when supplied', () => {
    const pending = formatReceiptText(receipt({
      items: [{ id: 'repair', item: 'Repair charge', detail: 'Pipe replacement', amount: 250 }],
      totalAmount: 250,
    }))
    expect(pending).toContain('(Pipe replacement)')
    expect(pending).toContain('Status:         Pending')
    expect(pending).not.toContain('Bank transfer')

    const paid = formatReceiptText(receipt({ status: 'Paid', paidDate: '3 Oct 2026', paymentMethod: 'Cash' }))
    expect(paid).toContain('Status:         Paid (3 Oct 2026 · Cash)')
  })
})
