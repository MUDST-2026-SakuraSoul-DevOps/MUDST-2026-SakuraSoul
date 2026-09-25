import { describe, expect, it } from 'vitest'
import type { ApartmentConfig, Lease, Receipt } from '../api/types'
import { previewBill, readMeter, roundMoney, toReceiptData } from './billing'

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

  it('rounds each line to two decimals before adding them up', () => {
    // 0.333 × 10 = 3.33 ต่อบรรทัด สองบรรทัดรวม 6.66 ไม่ใช่ 6.67 ที่ได้จากการปัดตอนท้าย
    const fractional = { ...lease, monthlyRent: 0, commonAreaFee: 0, internetFee: 0, electricRatePerUnit: 0.333, waterRatePerUnit: 0.333 }
    expect(previewBill(fractional, config, 10, 10).total).toBe(6.66)
    expect(roundMoney(2.675)).toBe(2.68)
  })
})

describe('toReceiptData', () => {
  it('maps an API receipt to what the receipt popup and print use', () => {
    const receipt: Receipt = {
      id: 9,
      receiptNo: 'RC-2026-0009',
      leaseId: 1,
      roomNumber: '103',
      tenantName: 'Yuki Tanaka',
      billingMonth: '2026-09',
      issuedAt: '2026-09-11T14:05:22Z',
      dueDate: '2026-10-05',
      status: 'PENDING',
      items: [{ item: 'Room rent', detail: null, usageValue: null, usageUnit: null, rate: null, amount: 3500 }],
      totalAmount: 3500,
      paidAt: null,
      paymentMethod: null,
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
})
