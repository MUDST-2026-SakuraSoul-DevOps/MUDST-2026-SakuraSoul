import { describe, expect, it } from 'vitest'
import type { CreateTenantRequest } from '../api/types'
import { validateTenant } from './tenant'

/**
 * US-03-S2 กรอกข้อมูลไม่ครบต้องเตือนว่าขาดช่องไหน และไม่บันทึก
 */

function tenant(overrides: Partial<CreateTenantRequest> = {}): CreateTenantRequest {
  return {
    fullName: 'Aiko Tanaka',
    email: 'somchai@example.com',
    phone: '081-234-5678',
    nationalId: '1100400123450',
    ...overrides,
  }
}

describe('validateTenant', () => {
  it('กรอกครบสามช่องบังคับ ผ่าน', () => {
    expect(validateTenant(tenant())).toBeNull()
  })

  it('ไม่กรอกเลขบัตร ต้องบอกให้กรอก เพราะบังคับตามคำตัดสินอาจารย์ 11 ก.ย. (ข้อความเดียวกับ backend)', () => {
    expect(validateTenant(tenant({ nationalId: undefined }))).toBe('Please enter the national ID')
    expect(validateTenant(tenant({ nationalId: '   ' }))).toBe('Please enter the national ID')
  })

  it('ไม่กรอกชื่อ ต้องบอกว่าขาดชื่อ', () => {
    expect(validateTenant(tenant({ fullName: '' }))).toBe('Please enter the full name')
  })

  // SSK-136 อีเมลไม่บังคับตามคำตัดสินอาจารย์ 11 ก.ย. เดิมที่นี่ยังบังคับ ขัดกับ backend
  it('ไม่กรอกอีเมลผ่าน เพราะอีเมลไม่บังคับ ตรงกับ backend', () => {
    expect(validateTenant(tenant({ email: '' }))).toBeNull()
    expect(validateTenant(tenant({ email: null }))).toBeNull()
    expect(validateTenant(tenant({ email: undefined }))).toBeNull()
  })

  it('ไม่กรอกเบอร์โทร ต้องบอกว่าขาดเบอร์โทร', () => {
    expect(validateTenant(tenant({ phone: '' }))).toBe('Please enter the phone number')
  })

  it('เบอร์โทรไม่ครบ 10 หลัก ต้องเตือน', () => {
    expect(validateTenant(tenant({ phone: '111' }))).toBe('Phone number must be 10 digits')
    expect(validateTenant(tenant({ phone: '081-234' }))).toBe('Phone number must be 10 digits')
  })

  it('กรอกแต่เว้นวรรค ไม่นับว่ากรอกแล้ว', () => {
    expect(validateTenant(tenant({ fullName: '   ' }))).toBe('Please enter the full name')
  })

  it('ขาดหลายช่อง รายงานช่องแรกตามลำดับที่กรอกในฟอร์ม', () => {
    expect(validateTenant(tenant({ fullName: '', email: '', phone: '' }))).toBe(
      'Please enter the full name',
    )
  })

  it('อีเมลไม่มี @ ต้องโดนปฏิเสธ', () => {
    expect(validateTenant(tenant({ email: 'somchai.example.com' }))).toBe(
      'That email address is not valid',
    )
  })

  it('อีเมลไม่มีจุดในโดเมน ต้องโดนปฏิเสธ', () => {
    expect(validateTenant(tenant({ email: 'somchai@example' }))).toBe('That email address is not valid')
  })

  it('อีเมลที่มีเว้นวรรคข้างใน ต้องโดนปฏิเสธ', () => {
    expect(validateTenant(tenant({ email: 'som chai@example.com' }))).toBe(
      'That email address is not valid',
    )
  })

  it('อีเมลที่มีจุดกับขีดในชื่อ ใช้ได้', () => {
    expect(validateTenant(tenant({ email: 'som.chai-j@student.mahidol.ac.th' }))).toBeNull()
  })

  it('เลขบัตรประชาชน 13 หลักถูกต้องตาม Modulo 11 ของไทย ผ่าน', () => {
    expect(validateTenant(tenant({ nationalId: '1 1004 00123 45 0' }))).toBeNull()
    expect(validateTenant(tenant({ nationalId: '1100400123450' }))).toBeNull()
  })

  it('เลขบัตรประชาชนไม่ครบ 13 หลัก หรือผิดหลัก checksum ต้องโดนปฏิเสธ', () => {
    expect(validateTenant(tenant({ nationalId: '12345' }))).toBe(
      'Thai National ID must be 13 digits',
    )
    expect(validateTenant(tenant({ nationalId: '1100400123459' }))).toBe(
      'Invalid Thai National ID checksum',
    )
  })

  it('Passport ตัวเลขและตัวอักษร 6-20 ตัว ผ่าน', () => {
    expect(validateTenant(tenant({ nationalId: 'AA1234567' }))).toBeNull()
    expect(validateTenant(tenant({ nationalId: 'P12345678' }))).toBeNull()
    expect(validateTenant(tenant({ nationalId: '123456A' }))).toBeNull()
  })

  it('Passport สั้นกว่า 6 ตัว หรือมีอักขระพิเศษ ต้องโดนปฏิเสธ (กฎเดียวกับ backend และ US-03-S2)', () => {
    expect(validateTenant(tenant({ nationalId: 'AB12' }))).toBe(
      'Passport number must be 6–20 alphanumeric characters',
    )
    expect(validateTenant(tenant({ nationalId: 'AA123-456' }))).toBe(
      'Passport number must be 6–20 alphanumeric characters',
    )
  })
})
