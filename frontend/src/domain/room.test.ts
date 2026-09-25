import { describe, expect, it } from 'vitest'
import type { CreateRoomRequest } from '../api/types'
import { roomTypeLabel, validateRoom } from './room'

function room(overrides: Partial<CreateRoomRequest> = {}): CreateRoomRequest {
  return { roomNumber: '101', floor: 1, roomType: 'SINGLE', ...overrides }
}

describe('validateRoom', () => {
  it('accepts a three-digit unit number and a positive whole-number floor', () => {
    expect(validateRoom(room())).toBeNull()
    expect(validateRoom(room({ roomNumber: '212', floor: 2 }))).toBeNull()
  })

  it('reports a missing unit number before other invalid fields', () => {
    expect(validateRoom(room({ roomNumber: '  ', floor: 0 }))).toBe('Please enter the unit number')
  })

  it('rejects a unit number that is not three digits', () => {
    expect(validateRoom(room({ roomNumber: '10' }))).toBe('The unit number must be three digits, for example 101')
    expect(validateRoom(room({ roomNumber: '10A' }))).toBe('The unit number must be three digits, for example 101')
  })

  it('rejects a non-finite floor before checking whether it is a whole number', () => {
    expect(validateRoom(room({ floor: Number.NaN }))).toBe('Please enter the floor')
    expect(validateRoom(room({ floor: Number.POSITIVE_INFINITY }))).toBe('Please enter the floor')
  })

  it('rejects zero, negative, and fractional floors', () => {
    for (const floor of [0, -1, 1.5]) {
      expect(validateRoom(room({ floor }))).toBe('The floor must be a whole number of 1 or more')
    }
  })
})

describe('roomTypeLabel', () => {
  it('uses the displayed room-type labels and a fallback for missing data', () => {
    expect(roomTypeLabel('SINGLE')).toBe('Single Bedroom')
    expect(roomTypeLabel('DOUBLE')).toBe('Double Bedroom')
    expect(roomTypeLabel(null)).toBe('-')
    expect(roomTypeLabel(undefined)).toBe('-')
  })
})
