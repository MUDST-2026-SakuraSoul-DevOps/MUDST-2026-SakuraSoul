import { describe, expect, it } from 'vitest'
import type { ApartmentConfigRequest } from '../api/types'
import { validateApartmentConfig } from './apartmentConfig'

/**
 * US-16-S2 อัตราที่กรอกผิดต้องโดนปฏิเสธ
 *
 * ที่ต้องเทสละเอียดเพราะอัตราติดลบไม่ได้พังทันที มันไหลไปโผล่เป็นใบเสร็จติดลบ
 * ที่ส่งให้ผู้เช่าไปแล้ว กว่าจะรู้ตัวก็สายเกินแก้
 */

function config(overrides: Partial<ApartmentConfigRequest> = {}): ApartmentConfigRequest {
  return {
    electricRatePerUnit: 8,
    waterRatePerUnit: 18,
    commonAreaFee: 300,
    internetFee: 250,
    ...overrides,
  }
}

describe('validateApartmentConfig', () => {
  it('กรอกครบและเป็นบวก ผ่าน', () => {
    expect(validateApartmentConfig(config())).toBeNull()
  })

  it('ศูนย์ใช้ได้ เพราะหอบางที่ไม่คิดค่าส่วนกลาง', () => {
    expect(validateApartmentConfig(config({ commonAreaFee: 0 }))).toBeNull()
  })

  it('ค่าไฟติดลบไม่ผ่าน และบอกชื่อช่องที่ผิด', () => {
    expect(validateApartmentConfig(config({ electricRatePerUnit: -1 }))).toBe(
      'ค่าไฟต่อหน่วย ต้องไม่ติดลบ',
    )
  })

  it('ค่าน้ำติดลบไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ waterRatePerUnit: -0.5 }))).toBe(
      'ค่าน้ำต่อหน่วย ต้องไม่ติดลบ',
    )
  })

  it('ค่าส่วนกลางติดลบไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ commonAreaFee: -100 }))).toBe(
      'ค่าส่วนกลาง ต้องไม่ติดลบ',
    )
  })

  it('ค่าอินเทอร์เน็ตติดลบไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ internetFee: -1 }))).toBe(
      'ค่าอินเทอร์เน็ต ต้องไม่ติดลบ',
    )
  })

  it('ช่องที่ยังไม่กรอกได้ NaN มาจาก input ต้องไม่ผ่าน', () => {
    // input type="number" ที่ว่างอยู่คืน NaN ไม่ใช่ศูนย์ ถ้าไม่ดักจะบันทึก NaN ลงไป
    expect(validateApartmentConfig(config({ waterRatePerUnit: Number.NaN }))).toBe(
      'ค่าน้ำต่อหน่วย ต้องเป็นตัวเลข',
    )
  })

  it('ค่าอนันต์ไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ internetFee: Number.POSITIVE_INFINITY }))).toBe(
      'ค่าอินเทอร์เน็ต ต้องเป็นตัวเลข',
    )
  })

  it('ผิดหลายช่องพร้อมกัน รายงานช่องแรกที่เจอ ไม่ถล่มข้อความรวดเดียว', () => {
    const message = validateApartmentConfig(
      config({ electricRatePerUnit: -1, internetFee: -1 }),
    )
    expect(message).toBe('ค่าไฟต่อหน่วย ต้องไม่ติดลบ')
  })
})
