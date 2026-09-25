import { describe, expect, it } from 'vitest'
import type { RoomSummary } from '../api/types'
import { propertyDetails } from './contractPdf'

/**
 * ตัววาด PDF ในเบราว์เซอร์ใช้ canvas ซึ่ง jsdom ไม่มี (getContext คืน null)
 * จึงเทสค่าที่จะพิมพ์ในหัวข้อ 2 ผ่าน propertyDetails แทนการอ่านจากภาพ
 */

function room(overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id: 14,
    roomNumber: '202',
    floor: 2,
    roomType: 'DOUBLE',
    baseRent: 4500,
    status: 'OCCUPIED',
    currentLease: null,
    openMaintenanceCount: 0,
    openMaintenanceTitle: null,
    ...overrides,
  }
}

describe('propertyDetails', () => {
  it('prints the floor and room type of the real unit', () => {
    expect(propertyDetails(room())).toEqual({ floor: '2', roomType: 'Double Bedroom' })
    expect(propertyDetails(room({ floor: 1, roomType: 'SINGLE' }))).toEqual({ floor: '1', roomType: 'Single Bedroom' })
  })

  // SSK-140 เดิมโหลดห้องไม่ได้แล้วเอกสารเดาเป็นชั้น 1 ห้อง Single Bedroom เอง
  // ซึ่งเป็นค่าที่แต่งขึ้นในสัญญาที่ผู้เช่าเซ็น ต้องบอกตรง ๆ ว่าไม่มีข้อมูล
  it('says Not available instead of guessing when the unit could not be loaded', () => {
    expect(propertyDetails(null)).toEqual({ floor: 'Not available', roomType: 'Not available' })
    expect(propertyDetails(undefined)).toEqual({ floor: 'Not available', roomType: 'Not available' })
  })
})
