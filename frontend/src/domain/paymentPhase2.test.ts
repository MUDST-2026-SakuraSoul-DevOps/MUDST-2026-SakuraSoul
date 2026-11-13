import { describe, expect, it } from 'vitest'
import { calculateInterest, formatPromptPayTarget, generatePromptPayPayload } from './paymentPhase2'

/*
  ส่วนที่เหลือของ paymentPhase2.ts หลังลบของยุค localStorage (SSK-179)
  ยอดค้าง การชำระ และรายงานมาจาก API แล้ว จึงเหลือแค่สูตรดอกเบี้ยของป็อปอัป Billing Settings กับ QR PromptPay
*/

describe('calculateInterest (SSK-164)', () => {
  it('charges a simple monthly rate on the principal', () => {
    // 2,000 × 1% = 20 · 1,500 × 1.5% = 22.5
    expect(calculateInterest(2000, 1)).toBe(20)
    expect(calculateInterest(1500, 1.5)).toBe(22.5)
  })

  it('refuses to charge interest on nothing or on a rate that is not positive', () => {
    // PH2-05 S7: อัตราติดลบต้องไม่กลายเป็นเครดิต
    expect(calculateInterest(2000, 0)).toBe(0)
    expect(calculateInterest(2000, -1)).toBe(0)
    expect(calculateInterest(0, 5)).toBe(0)
    expect(calculateInterest(-500, 5)).toBe(0)
  })

  it('rounds to satang rather than leaving a long float', () => {
    expect(calculateInterest(3333, 1)).toBe(33.33)
    // 1234.56 × 1.25% = 15.432 ต้องไม่ไปถึงบิลเป็น 15.432000000001
    expect(calculateInterest(1234.56, 1.25)).toBe(15.43)
  })
})

describe('PromptPay QR payload (SSK-168)', () => {
  it('accepts a 10-digit phone number or a 13-digit ID and rejects anything else', () => {
    expect(formatPromptPayTarget('0812345678')).toEqual({ type: 'phone', formatted: '0066812345678' })
    expect(formatPromptPayTarget('1234567890123')).toEqual({ type: 'id', formatted: '1234567890123' })

    expect(() => formatPromptPayTarget('123')).toThrow('PromptPay ID must be a 10-digit phone number or a 13-digit ID')
    expect(() => formatPromptPayTarget('abcdefghij')).toThrow('PromptPay ID must be')
    expect(() => formatPromptPayTarget('081 234 5678')).toThrow('PromptPay ID must be')
    expect(() => generatePromptPayPayload('', 5000)).toThrow('PromptPay ID must be')
  })

  it('builds the EMVCo payload with the amount and a CRC checksum', () => {
    const payload = generatePromptPayPayload('0812345678', 5300.0)

    expect(payload).toContain('000201010212') // dynamic QR (POI 12) เมื่อมียอดเงิน
    expect(payload).toContain('A000000677010111') // PromptPay AID
    expect(payload).toContain('54075300.00') // ยอด 5,300.00
    // ชุดทดสอบที่รู้คำตอบ CRC 7BA8 ตรวจแยกด้วย binascii.crc_hqx แล้ว
    expect(payload).toBe('00020101021229370016A00000067701011101130066812345678530376454075300.005802TH63047BA8')
  })

  it('uses a static QR (POI 11) with no amount when none is given', () => {
    const payload = generatePromptPayPayload('0812345678')

    expect(payload).toContain('000201010211')
    expect(payload).not.toContain('540')
    expect(payload).toMatch(/6304[0-9A-F]{4}$/)
  })
})
