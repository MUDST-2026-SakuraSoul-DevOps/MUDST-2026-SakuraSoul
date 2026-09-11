import { describe, expect, it } from 'vitest'
import type { CreateTenantRequest } from '../api/types'
import { validateTenant } from './tenant'

/**
 * US-03-S2 กรอกข้อมูลไม่ครบต้องเตือนว่าขาดช่องไหน และไม่บันทึก
 */

function tenant(overrides: Partial<CreateTenantRequest> = {}): CreateTenantRequest {
  return {
    fullName: 'สมชาย ใจดี',
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
    expect(validateTenant(tenant({ fullName: '' }))).toBe('กรุณากรอกชื่อ-นามสกุล')
  })

  it('ไม่กรอกอีเมล ต้องบอกว่าขาดอีเมล', () => {
    expect(validateTenant(tenant({ email: '' }))).toBe('กรุณากรอกอีเมล')
  })

  it('ไม่กรอกเบอร์โทร ต้องบอกว่าขาดเบอร์โทร', () => {
    expect(validateTenant(tenant({ phone: '' }))).toBe('กรุณากรอกเบอร์โทร')
  })

  it('เบอร์โทรไม่ครบ 10 หลัก ต้องเตือน', () => {
    expect(validateTenant(tenant({ phone: '111' }))).toBe('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
    expect(validateTenant(tenant({ phone: '081-234' }))).toBe('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
  })

  it('กรอกแต่เว้นวรรค ไม่นับว่ากรอกแล้ว', () => {
    expect(validateTenant(tenant({ fullName: '   ' }))).toBe('กรุณากรอกชื่อ-นามสกุล')
  })

  it('ขาดหลายช่อง รายงานทุกช่องที่ผิด', () => {
    const result = validateTenant(tenant({ fullName: '', email: '', phone: '' }))
    expect(result).toContain('กรุณากรอกชื่อ-นามสกุล')
    expect(result).toContain('กรุณากรอกเบอร์โทร')
    expect(result).toContain('กรุณากรอกอีเมล')
  })

  it('เบอร์โทรไม่ครบ 10 หลัก และ บัตรประชาชนไม่ครบ 13 หลัก รายงานทั้งสองข้อความพร้อมกัน', () => {
    const result = validateTenant(tenant({ phone: '081-23', nationalId: '1 2345' }))
    expect(result).toContain('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
    expect(result).toContain('กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก')
  })

  it('เบอร์โทรไม่ครบ 10 หลัก และ บัตรประชาชนผิด checksum รายงานทั้งสองข้อความพร้อมกัน', () => {
    const result = validateTenant(tenant({ phone: '081-23', nationalId: '1100400123459' }))
    expect(result).toContain('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
    expect(result).toContain('เลขบัตรประชาชนไม่ถูกต้องตามหลัก 13 หลัก')
  })

  it('อีเมลไม่มี @ ต้องโดนปฏิเสธ', () => {
    expect(validateTenant(tenant({ email: 'somchai.example.com' }))).toBe(
      'รูปแบบอีเมลไม่ถูกต้อง',
    )
  })

  it('อีเมลไม่มีจุดในโดเมน ต้องโดนปฏิเสธ', () => {
    expect(validateTenant(tenant({ email: 'somchai@example' }))).toBe('รูปแบบอีเมลไม่ถูกต้อง')
  })

  it('อีเมลที่มีเว้นวรรคข้างใน ต้องโดนปฏิเสธ', () => {
    expect(validateTenant(tenant({ email: 'som chai@example.com' }))).toBe(
      'รูปแบบอีเมลไม่ถูกต้อง',
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
