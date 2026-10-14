import { describe, expect, it } from 'vitest'
import type { Supply } from '../api/types'
import {
  EMPTY_SUPPLY_USAGE,
  addUsageLine,
  pendingUsageError,
  removeUsageLine,
  summarizeSuppliesUsed,
  supplyOptionLabel,
  toUsageRequests,
  usageError,
  validateUsageQuantity,
} from './supplyUsage'

/** กฎของการเบิกของเข้าใบแจ้งซ่อม (SSK-154) ข้อความต้องตรงกับ backend ทุกคำ */

function supply(id: number, name: string, stock: number): Supply {
  return {
    id,
    name,
    sku: null,
    category: 'Electrical',
    stock,
    minStock: 0,
    maxStock: 500,
    status: 'IN_STOCK',
    createdAt: '2026-10-01T00:00:00Z',
  }
}

const BULB = supply(1, 'LED Bulb', 10)
const FILTER = supply(2, 'Air Filter', 3)
const SUPPLIES = [BULB, FILTER]

describe('validateUsageQuantity', () => {
  it.each([
    ['', 'Please enter the quantity used'],
    ['   ', 'Please enter the quantity used'],
    ['1.5', 'The quantity used must be a whole number'],
    ['0', 'The quantity used must be greater than 0'],
    ['-2', 'The quantity used must be greater than 0'],
  ])('จำนวน "%s" เบิกไม่ได้: %s', (raw, message) => {
    expect(validateUsageQuantity(raw)).toBe(message)
  })

  it('จำนวนเต็มบวกผ่าน', () => {
    expect(validateUsageQuantity('3')).toBeNull()
  })
})

describe('usageError', () => {
  it('ไม่ได้เลือกของใช้ข้อความเดียวกับ @NotNull ของ backend', () => {
    expect(usageError('', '1', SUPPLIES)).toBe('Please choose the item')
  })

  it('เบิกเกินสต็อกได้ข้อความเดียวกับ SupplyItem.withdraw พร้อมยอดที่เหลือ', () => {
    expect(usageError('2', '4', SUPPLIES)).toBe('Not enough Air Filter in stock (only 3 left)')
  })

  it('เบิกพอดีสต็อกได้', () => {
    expect(usageError('2', '3', SUPPLIES)).toBeNull()
  })

  it('นับของชิ้นเดียวกันที่อยู่ในรายการแล้วด้วย ไม่ใช่เทียบแค่จำนวนที่เพิ่งพิมพ์', () => {
    expect(usageError('2', '2', SUPPLIES, 2)).toBe('Not enough Air Filter in stock (only 3 left)')
  })
})

describe('addUsageLine / removeUsageLine', () => {
  it('เพิ่มของเข้ารายการแล้วล้างช่องเลือกให้เลือกชิ้นต่อไป', () => {
    const { draft, error } = addUsageLine({ ...EMPTY_SUPPLY_USAGE, supplyId: '1', quantity: '2' }, SUPPLIES)

    expect(error).toBeNull()
    expect(draft).toEqual({ lines: [{ supplyId: 1, name: 'LED Bulb', quantity: 2 }], supplyId: '', quantity: '' })
  })

  it('เลือกของชิ้นเดิมซ้ำรวมเป็นแถวเดียว', () => {
    const first = addUsageLine({ ...EMPTY_SUPPLY_USAGE, supplyId: '1', quantity: '2' }, SUPPLIES).draft
    const second = addUsageLine({ ...first, supplyId: '1', quantity: '3' }, SUPPLIES).draft

    expect(second.lines).toEqual([{ supplyId: 1, name: 'LED Bulb', quantity: 5 }])
  })

  it('เพิ่มไม่ผ่าน draft เดิมไม่หาย ของที่กรอกไว้ยังอยู่ให้แก้', () => {
    const before = { ...EMPTY_SUPPLY_USAGE, supplyId: '2', quantity: '9' }
    const { draft, error } = addUsageLine(before, SUPPLIES)

    expect(error).toBe('Not enough Air Filter in stock (only 3 left)')
    expect(draft).toBe(before)
  })

  it('ลบแถวออกจากรายการก่อนบันทึกได้', () => {
    const draft = {
      ...EMPTY_SUPPLY_USAGE,
      lines: [
        { supplyId: 1, name: 'LED Bulb', quantity: 2 },
        { supplyId: 2, name: 'Air Filter', quantity: 1 },
      ],
    }
    expect(removeUsageLine(draft, 1).lines).toEqual([{ supplyId: 2, name: 'Air Filter', quantity: 1 }])
  })
})

describe('pendingUsageError', () => {
  it('ไม่ได้เลือกอะไรค้างไว้ บันทึกได้', () => {
    expect(pendingUsageError(EMPTY_SUPPLY_USAGE)).toBeNull()
  })

  it.each([
    [{ supplyId: '1', quantity: '' }],
    [{ supplyId: '', quantity: '2' }],
  ])('เลือกของหรือพิมพ์จำนวนค้างไว้แต่ยังไม่กด Add บันทึกไม่ได้ %o', (pending) => {
    expect(pendingUsageError({ lines: [], ...pending })).toBe(
      'Click Add to include the selected supply, or clear it before saving',
    )
  })
})

describe('toUsageRequests', () => {
  it('ไม่ได้เบิกอะไรไม่ส่งช่อง suppliesUsed เลย body ของใบที่ไม่เบิกของจะเหมือนเดิมทุกอย่าง', () => {
    expect(toUsageRequests([])).toBeUndefined()
  })

  it('ส่งแค่ supplyId กับ quantity ชื่อของเป็นของหน้าจอ backend ไม่ได้รับ', () => {
    expect(toUsageRequests([{ supplyId: 1, name: 'LED Bulb', quantity: 2 }])).toEqual([{ supplyId: 1, quantity: 2 }])
  })
})

describe('summarizeSuppliesUsed', () => {
  it('backend ส่งหนึ่งแถวต่อการเบิกหนึ่งครั้ง รวมตามชิ้นก่อนแสดง ลำดับตามครั้งแรกที่เบิก', () => {
    expect(
      summarizeSuppliesUsed([
        { supplyId: 2, name: 'Air Filter', quantity: 1 },
        { supplyId: 1, name: 'LED Bulb', quantity: 2 },
        { supplyId: 2, name: 'Air Filter', quantity: 3 },
      ]),
    ).toEqual([
      { supplyId: 2, name: 'Air Filter', quantity: 4 },
      { supplyId: 1, name: 'LED Bulb', quantity: 2 },
    ])
  })
})

describe('supplyOptionLabel', () => {
  it('บอกยอดคงเหลือในตัวเลือก', () => {
    expect(supplyOptionLabel(BULB)).toBe('LED Bulb · 10 left')
  })
})
