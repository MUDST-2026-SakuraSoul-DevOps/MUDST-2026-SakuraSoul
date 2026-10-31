import { describe, expect, it } from 'vitest'
import { buildMovements, byMostCritical, isLowStock } from './supplyStock'

describe('isLowStock', () => {
  // AC: stock equal to the minimum is low
  it('is low at or below the minimum', () => {
    expect(isLowStock({ stock: 20, minStock: 20 })).toBe(true)
    expect(isLowStock({ stock: 19, minStock: 20 })).toBe(true)
    expect(isLowStock({ stock: 21, minStock: 20 })).toBe(false)
  })
})

describe('byMostCritical', () => {
  it('puts the emptiest item first relative to its minimum', () => {
    const items = [
      { name: 'B', stock: 10, minStock: 20 },
      { name: 'A', stock: 0, minStock: 5 },
      { name: 'C', stock: 3, minStock: 30 },
    ]
    expect([...items].sort(byMostCritical).map((i) => i.name)).toEqual(['A', 'C', 'B'])
  })
})

describe('buildMovements', () => {
  // AC: restocks and usage in time order with a running balance that ends at the current stock
  it('orders the movements and keeps the balance continuous', () => {
    const movements = buildMovements(12, '2026-01-01T00:00:00Z', [
      { at: '2026-03-01T00:00:00Z', kind: 'USAGE', quantity: -3, note: 'Maintenance ticket #4' },
      { at: '2026-02-01T00:00:00Z', kind: 'RESTOCK', quantity: 10, note: null },
      { at: '2026-04-01T00:00:00Z', kind: 'ADJUSTMENT', quantity: -1, note: null },
    ])
    expect(movements.map((m) => [m.kind, m.quantity, m.balanceAfter])).toEqual([
      ['OPENING', 6, 6],
      ['RESTOCK', 10, 16],
      ['USAGE', -3, 13],
      ['ADJUSTMENT', -1, 12],
    ])
  })
})
