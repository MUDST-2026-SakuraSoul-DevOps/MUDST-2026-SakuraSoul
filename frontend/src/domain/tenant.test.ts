import { describe, expect, it } from 'vitest'
import type { CreateTenantRequest } from '../api/types'
import { validateTenant } from './tenant'

/**
 * US-03-S2 incomplete input must identify the missing field and avoid saving.
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
  it('passes when all three required fields are present', () => {
    expect(validateTenant(tenant())).toBeNull()
  })

  it('passes without a national ID because it is optional', () => {
    expect(validateTenant(tenant({ nationalId: undefined }))).toBeNull()
  })

  it('reports a missing full name', () => {
    expect(validateTenant(tenant({ fullName: '' }))).toBe('Please enter the full name')
  })

  it('reports a missing email', () => {
    expect(validateTenant(tenant({ email: '' }))).toBe('Please enter the email')
  })

  it('reports a missing phone number', () => {
    expect(validateTenant(tenant({ phone: '' }))).toBe('Please enter the phone number')
  })

  it('warns when the phone number does not contain 10 digits', () => {
    expect(validateTenant(tenant({ phone: '111' }))).toBe('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
    expect(validateTenant(tenant({ phone: '081-234' }))).toBe('กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก')
  })

  it('treats whitespace-only values as empty', () => {
    expect(validateTenant(tenant({ fullName: '   ' }))).toBe('Please enter the full name')
  })

  it('reports the first missing field in form order', () => {
    expect(validateTenant(tenant({ fullName: '', email: '', phone: '' }))).toBe(
      'Please enter the full name',
    )
  })

  it('rejects email addresses without @', () => {
    expect(validateTenant(tenant({ email: 'somchai.example.com' }))).toBe(
      'That email address is not valid',
    )
  })

  it('rejects email addresses without a dot in the domain', () => {
    expect(validateTenant(tenant({ email: 'somchai@example' }))).toBe('That email address is not valid')
  })

  it('rejects email addresses with embedded spaces', () => {
    expect(validateTenant(tenant({ email: 'som chai@example.com' }))).toBe(
      'That email address is not valid',
    )
  })

  it('allows dots and hyphens in the email local part', () => {
    expect(validateTenant(tenant({ email: 'som.chai-j@student.mahidol.ac.th' }))).toBeNull()
  })

  it('accepts a valid Thai 13-digit national ID checksum', () => {
    expect(validateTenant(tenant({ nationalId: '1 1004 00123 45 0' }))).toBeNull()
    expect(validateTenant(tenant({ nationalId: '1100400123450' }))).toBeNull()
  })

  it('rejects incomplete or checksum-invalid national IDs', () => {
    expect(validateTenant(tenant({ nationalId: '12345' }))).toBe(
      'กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก',
    )
    expect(validateTenant(tenant({ nationalId: '1100400123459' }))).toBe(
      'เลขบัตรประชาชนไม่ถูกต้องตามหลัก 13 หลัก',
    )
  })
})
