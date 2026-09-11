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

  it('ศูนย์ใช้ได้ เพราะหอบางที่ไม่คิดCommon area fee', () => {
    expect(validateApartmentConfig(config({ commonAreaFee: 0 }))).toBeNull()
  })

  it('ค่าไฟติดลบไม่ผ่าน และบอกชื่อช่องที่ผิด', () => {
    expect(validateApartmentConfig(config({ electricRatePerUnit: -1 }))).toBe(
      'Electricity rate per unit cannot be negative',
    )
  })

  it('ค่าน้ำติดลบไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ waterRatePerUnit: -0.5 }))).toBe(
      'Water rate per unit cannot be negative',
    )
  })

  it('Common area feeติดลบไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ commonAreaFee: -100 }))).toBe(
      'Common area fee cannot be negative',
    )
  })

  it('ค่าอินเทอร์เน็ตติดลบไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ internetFee: -1 }))).toBe(
      'Internet fee cannot be negative',
    )
  })

  it('ช่องที่ยังไม่กรอกได้ NaN มาจาก input ต้องไม่ผ่าน', () => {
    // input type="number" ที่ว่างอยู่คืน NaN ไม่ใช่ศูนย์ ถ้าไม่ดักจะบันทึก NaN ลงไป
    expect(validateApartmentConfig(config({ waterRatePerUnit: Number.NaN }))).toBe(
      'Water rate per unit must be a number',
    )
  })

  it('ค่าอนันต์ไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ internetFee: Number.POSITIVE_INFINITY }))).toBe(
      'Internet fee must be a number',
    )
  })

  it('ผิดหลายช่องพร้อมกัน รายงานช่องแรกที่เจอ ไม่ถล่มข้อความรวดเดียว', () => {
    const message = validateApartmentConfig(
      config({ electricRatePerUnit: -1, internetFee: -1 }),
    )
    expect(message).toBe('Electricity rate per unit cannot be negative')
  })
})

/**
 * มาจากที่ QA ทักว่าเดิมเช็คแค่ติดลบกับไม่ใช่ตัวเลข กรอกค่าไฟหน่วยละ 9999999
 * ก็ผ่านได้ พิมพ์ผิดทีเดียวใบเสร็จพุ่งเป็นล้านโดยไม่มีอะไรทัก
 */
describe('ขอบบนของอัตรา', () => {
  it('ค่าไฟหน่วยละเจ็ดหลักไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ electricRatePerUnit: 9_999_999 }))).toContain(
      'Electricity rate per unit',
    )
  })

  it('ค่าน้ำหน่วยละเกินพันไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ waterRatePerUnit: 1_001 }))).toContain('is too high')
  })

  it('ตรงเพดานพอดียังผ่าน ไม่ได้ตัดทิ้งไปด้วย', () => {
    expect(validateApartmentConfig(config({ electricRatePerUnit: 1_000 }))).toBeNull()
    expect(validateApartmentConfig(config({ commonAreaFee: 100_000 }))).toBeNull()
  })

  it('Common area feeรายเดือนเกินแสนไม่ผ่าน', () => {
    expect(validateApartmentConfig(config({ commonAreaFee: 100_001 }))).toContain('Common area fee')
  })

  it('อัตราจริงที่ใช้กันอยู่ยังผ่านสบาย ๆ', () => {
    expect(
      validateApartmentConfig({
        electricRatePerUnit: 8,
        waterRatePerUnit: 18,
        commonAreaFee: 300,
        internetFee: 250,
      }),
    ).toBeNull()
  })
})
