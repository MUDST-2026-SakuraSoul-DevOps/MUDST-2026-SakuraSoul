import { describe, expect, it } from 'vitest'
import {
  blockedRemovalMessage,
  layoutRoomNumbers,
  planLayoutChange,
  summarizeRoomNumbers,
  validateBuildingLayout,
} from './buildingLayout'

describe('validateBuildingLayout', () => {
  it('accepts whole numbers inside the limits', () => {
    expect(validateBuildingLayout({ floors: 3, roomsPerFloor: 10, newRoomType: 'SINGLE' })).toBeNull()
    expect(validateBuildingLayout({ floors: 50, roomsPerFloor: 99, newRoomType: 'DOUBLE' })).toBeNull()
  })

  // ช่อง number ว่างคืน NaN ทศนิยมก็ทำเลขห้องไม่ได้
  it.each([0, -1, 51, 2.5, Number.NaN])('rejects %s floors', (floors) => {
    expect(validateBuildingLayout({ floors, roomsPerFloor: 10, newRoomType: 'SINGLE' })).toBe(
      'Number of floors must be a whole number from 1 to 50',
    )
  })

  // ห้องที่ 100 ของชั้น 1 จะได้เลข 200 ชนกับเลขชั้น 2
  it.each([0, 100, 1.5, Number.NaN])('rejects %s rooms per floor', (roomsPerFloor) => {
    expect(validateBuildingLayout({ floors: 2, roomsPerFloor, newRoomType: 'SINGLE' })).toBe(
      'Rooms per floor must be a whole number from 1 to 99',
    )
  })
})

describe('layoutRoomNumbers', () => {
  it('numbers rooms as floor followed by a two-digit index', () => {
    expect(layoutRoomNumbers(2, 3).map((r) => r.roomNumber)).toEqual(['101', '102', '103', '201', '202', '203'])
    expect(layoutRoomNumbers(10, 1).at(-1)).toEqual({ roomNumber: '1001', floor: 10 })
  })
})

describe('planLayoutChange', () => {
  const rooms = layoutRoomNumbers(2, 12).map((r, i) => ({ ...r, id: i + 1 }))

  it('adds the missing rooms and removes the ones outside the new layout', () => {
    const plan = planLayoutChange(rooms, 3, 10)
    expect(plan.add.map((r) => r.roomNumber)).toEqual(layoutRoomNumbers(1, 10).map((r) => String(Number(r.roomNumber) + 200)))
    expect(plan.remove.map((r) => r.roomNumber)).toEqual(['111', '112', '211', '212'])
  })

  it('changes nothing when the layout is the same', () => {
    expect(planLayoutChange(rooms, 2, 12)).toEqual({ add: [], remove: [] })
  })
})

describe('messages', () => {
  it('names the blocked units', () => {
    expect(blockedRemovalMessage(['110'])).toBe(
      'Unit 110 has lease or maintenance history and cannot be removed. Nothing was changed.',
    )
    expect(blockedRemovalMessage(['103', '110'])).toBe(
      'Units 103, 110 have lease or maintenance history and cannot be removed. Nothing was changed.',
    )
  })

  it('shortens long lists of room numbers', () => {
    expect(summarizeRoomNumbers(['301', '302'])).toBe('301, 302')
    expect(summarizeRoomNumbers(layoutRoomNumbers(1, 10).map((r) => r.roomNumber))).toBe(
      '101, 102, 103, 104, 105, 106 and 4 more',
    )
  })
})
