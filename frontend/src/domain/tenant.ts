import type { CreateTenantRequest } from '../api/types'

/**
 * ตรวจข้อมูลผู้เช่าก่อนบันทึก ตาม US-03-S2 ที่ขอให้ "แสดงข้อความเตือนฟิลด์ที่ขาด"
 *
 * แยกเป็น pure function ด้วยเหตุผลเดียวกับกฎสัญญาเช่าและอัตราค่าบริการ คือฟอร์ม
 * ใช้เตือนทันทีที่กดบันทึก และ backend จำลองใช้ตัดสินว่าจะตอบ 400 ไหม
 * ข้อความจึงตรงกันทั้งสองทางโดยไม่ต้องเขียนซ้ำ
 *
 * ชื่อ อีเมล เบอร์โทร เป็นข้อมูลบังคับตามที่ story ระบุว่าต้องมีครบทั้งสาม
 * ส่วนเลขบัตรประชาชนไม่บังคับ เพราะผู้เช่าบางคนยื่นทีหลังตอนเซ็นสัญญา
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * ตรวจสอบความถูกต้องของเลขประจำตัวประชาชน 13 หลัก ตามหลัก Modulo 11 ของไทย
 */
export function isValidThaiNationalId(id: string): boolean {
  const clean = id.replace(/\D/g, '')
  if (clean.length !== 13) {
    return false
  }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(clean[i], 10) * (13 - i)
  }
  const checkDigit = (11 - (sum % 11)) % 10
  return checkDigit === parseInt(clean[12], 10)
}

/**
 * ตรวจสอบความถูกต้องของ Passport: ตัวอักษร A-Z และตัวเลข 0-9 จำนวน 6-20 ตัว
 */
export function isValidPassport(passport: string): boolean {
  return /^[A-Za-z0-9]{6,20}$/.test(passport.trim())
}

/** คืนข้อความเตือนทุกช่องที่ผิด หรือ array ว่างเมื่อกรอกถูกครบ */
export function validateTenantAll(tenant: CreateTenantRequest): string[] {
  const errors: string[] = []

  if ((tenant.fullName ?? '').trim() === '') {
    errors.push('Please enter the full name')
  }

  const phoneDigits = (tenant.phone ?? '').replace(/\D/g, '')
  if ((tenant.phone ?? '').trim() === '') {
    errors.push('Please enter the phone number')
  } else if (phoneDigits.length !== 10) {
    errors.push('Phone number must be 10 digits')
  }

  if (tenant.nationalId && tenant.nationalId.trim() !== '') {
    const raw = tenant.nationalId.trim()
    const digitsOnly = /^\d+$/.test(raw.replace(/\s+/g, ''))
    if (digitsOnly) {
      const idDigits = raw.replace(/\D/g, '')
      if (idDigits.length !== 13) {
        errors.push('Thai National ID must be 13 digits')
      } else if (!isValidThaiNationalId(idDigits)) {
        errors.push('Invalid Thai National ID checksum')
      }
    } else {
      if (!isValidPassport(raw)) {
        errors.push('Passport number must be 6–20 alphanumeric characters')
      }
    }
  }

  if ((tenant.email ?? '').trim() === '') {
    errors.push('Please enter the email')
  } else if (!EMAIL_SHAPE.test(tenant.email.trim())) {
    errors.push('That email address is not valid')
  }

  return errors
}

/** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อกรอกถูกครบ */
export function validateTenant(tenant: CreateTenantRequest): string | null {
  const errors = validateTenantAll(tenant)
  return errors.length > 0 ? errors[0] : null
}
