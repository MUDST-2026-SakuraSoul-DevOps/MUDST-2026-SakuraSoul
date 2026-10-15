import { describe, expect, it } from 'vitest'
import {
  availableCount,
  isLowStock,
  nextApplianceSku,
  validateCatalogItem,
  validateRentalRequest,
  type ApplianceCategory,
  type CatalogItem,
  type RentalRequest,
} from './appliance'

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 1,
    name: 'Microwave',
    sku: 'KI-001',
    category: 'Kitchen',
    monthlyFee: 250,
    deposit: 500,
    owned: 3,
    lowStockAt: 1,
    ...overrides,
  }
}

function rental(overrides: Partial<RentalRequest> = {}): RentalRequest {
  return {
    id: 1,
    room: '101',
    sku: 'KI-001',
    monthlyFee: 250,
    deposit: 500,
    startDate: '2026-09-01',
    status: 'Active',
    ...overrides,
  }
}

describe('nextApplianceSku', () => {
  it('uses the highest valid number in the same category instead of the item count', () => {
    expect(nextApplianceSku('Kitchen', ['KI-001', 'KI-004', 'LA-099', 'KI-abc'])).toBe('KI-005')
    expect(nextApplianceSku('Laundry', ['KI-001'])).toBe('LA-001')
  })
})

describe('validateCatalogItem', () => {
  it('accepts a catalog item with zero owned stock and zero threshold', () => {
    expect(validateCatalogItem(item({ owned: 0, lowStockAt: 0 }))).toBeNull()
  })

  it('requires a name and category', () => {
    expect(validateCatalogItem(item({ name: '  ' }))).toBe('Please enter the appliance name')
    expect(validateCatalogItem(item({ category: '' as ApplianceCategory }))).toBe('Please choose a category')
  })

  it('rejects negative or non-finite fees, deposits, and quantities', () => {
    expect(validateCatalogItem(item({ monthlyFee: -1 }))).toBe('The monthly fee cannot be negative')
    expect(validateCatalogItem(item({ monthlyFee: Number.NaN }))).toBe('The monthly fee cannot be negative')
    expect(validateCatalogItem(item({ deposit: -1 }))).toBe('The deposit cannot be negative')
    expect(validateCatalogItem(item({ deposit: Number.POSITIVE_INFINITY }))).toBe('The deposit cannot be negative')
    expect(validateCatalogItem(item({ owned: -1 }))).toBe('Quantity owned cannot be negative')
    expect(validateCatalogItem(item({ owned: 1.5 }))).toBe('Quantity owned must be a whole number')
  })

  it('rejects an invalid threshold or one above the owned quantity', () => {
    expect(validateCatalogItem(item({ lowStockAt: -1 }))).toBe('The low stock alert cannot be negative')
    expect(validateCatalogItem(item({ lowStockAt: Number.NaN }))).toBe('The low stock alert cannot be negative')
    expect(validateCatalogItem(item({ lowStockAt: 4 }))).toBe('The low stock alert cannot be higher than the quantity owned')
    expect(validateCatalogItem(item({ lowStockAt: 3 }))).toBeNull()
  })
})

describe('validateRentalRequest', () => {
  it('requires a room, appliance SKU, and start date', () => {
    expect(validateRentalRequest(rental())).toBeNull()
    expect(validateRentalRequest(rental({ room: ' ' }))).toBe('Please choose a room')
    expect(validateRentalRequest(rental({ sku: ' ' }))).toBe('Please choose an appliance')
    expect(validateRentalRequest(rental({ startDate: '' }))).toBe('Please choose a start date')
  })
})

describe('appliance availability', () => {
  it('counts only active or pending rentals of the same SKU and clamps at zero', () => {
    const requests = [
      rental(),
      rental({ id: 2, status: 'Pending' }),
      rental({ id: 3, status: 'Returned' }),
      rental({ id: 4, sku: 'LA-001' }),
    ]
    expect(availableCount(item(), requests)).toBe(1)
    expect(availableCount(item({ owned: 1 }), requests)).toBe(0)
  })

  it('marks low stock at the configured threshold for that item', () => {
    expect(isLowStock(item(), [rental()])).toBe(false)
    expect(isLowStock(item(), [rental(), rental({ id: 2 })])).toBe(true)
    expect(isLowStock(item({ lowStockAt: 0 }), [rental(), rental({ id: 2 })])).toBe(false)
    expect(isLowStock(item({ lowStockAt: 0 }), [rental(), rental({ id: 2 }), rental({ id: 3 })])).toBe(true)
  })
})
