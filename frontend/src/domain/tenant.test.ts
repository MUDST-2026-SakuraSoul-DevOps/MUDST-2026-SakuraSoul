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
    ...overrides,
  }
}

describe('validateTenant', () => {
  it('กรอกครบสามช่องบังคับ ผ่าน', () => {
    expect(validateTenant(tenant())).toBeNull()
  })

  it('ไม่กรอกเลขบัตรประชาชนก็ผ่าน เพราะไม่บังคับ', () => {
    expect(validateTenant(tenant({ nationalId: undefined }))).toBeNull()
  })

  it('ไม่กรอกชื่อ ต้องบอกว่าขาดชื่อ', () => {
    expect(validateTenant(tenant({ fullName: '' }))).toBe('Please enter the full name')
  })

  it('ไม่กรอกอีเมล ต้องบอกว่าขาดอีเมล', () => {
    expect(validateTenant(tenant({ email: '' }))).toBe('Please enter the email')
  })

  it('ไม่กรอกเบอร์โทร ต้องบอกว่าขาดเบอร์โทร', () => {
    expect(validateTenant(tenant({ phone: '' }))).toBe('Please enter the phone number')
  })

  it('เบอร์โทรไม่ครบ 10 หลัก ต้องเตือน', () => {
    expect(validateTenant(tenant({ phone: '111' }))).toBe('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
    expect(validateTenant(tenant({ phone: '081-234' }))).toBe('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
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
      'กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก',
    )
    expect(validateTenant(tenant({ nationalId: '1100400123459' }))).toBe(
      'เลขบัตรประชาชนไม่ถูกต้องตามหลัก 13 หลัก',
    )
  })
})
