import { describe, expect, it } from 'vitest'
import { baht, thaiDate } from './format'

/**
 * ตัวอย่างการเขียน unit test ฝั่ง frontend ไว้ให้ทีมก๊อปไปทำส่วนของตัวเอง
 * เลือกเทส pure function เพราะไม่ต้องเรนเดอร์อะไรเลย รันเร็วและไม่พังตามดีไซน์ที่จะเปลี่ยน
 */
describe('baht', () => {
  it('คั่นหลักพันด้วยคอมมาและมีทศนิยมสองตำแหน่งเสมอ', () => {
    expect(baht(3500)).toBe('3,500.00')
    expect(baht(1087.5)).toBe('1,087.50')
  })

  it('ศูนย์ก็ยังต้องมีทศนิยมสองตำแหน่ง', () => {
    expect(baht(0)).toBe('0.00')
  })

  it('ปัดเศษที่เกินสองตำแหน่งทิ้ง', () => {
    expect(baht(99.999)).toBe('100.00')
  })

  it('หลักล้านก็ยังคั่นถูก', () => {
    expect(baht(1234567.89)).toBe('1,234,567.89')
  })
})

describe('thaiDate', () => {
  it('แปลงวันที่จาก backend เป็น พ.ศ.', () => {
    // backend ส่ง ISO date มา ค.ศ. 2026 ตรงกับ พ.ศ. 2569
    expect(thaiDate('2026-08-11')).toContain('2569')
  })

  it('ไม่มีวันที่ให้แสดงขีดแทน ไม่ใช่ Invalid Date', () => {
    expect(thaiDate(null)).toBe('-')
  })
})
