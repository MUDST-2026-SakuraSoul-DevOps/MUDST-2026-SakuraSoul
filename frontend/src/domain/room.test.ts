import { describe, expect, it } from 'vitest'
import { roomTypeLabel } from './room'

describe('roomTypeLabel', () => {
  it('uses the displayed room-type labels and a fallback for missing data', () => {
    expect(roomTypeLabel('SINGLE')).toBe('Single Bedroom')
    expect(roomTypeLabel('DOUBLE')).toBe('Double Bedroom')
    expect(roomTypeLabel(null)).toBe('-')
    expect(roomTypeLabel(undefined)).toBe('-')
  })
})
