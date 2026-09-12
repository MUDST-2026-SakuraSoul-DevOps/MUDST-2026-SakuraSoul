import { describe, expect, it } from 'vitest'
import { todayInBangkok, yen, yenAmount, daysUntil, displayDate, initialsFrom } from './format'

/**
 * Example frontend unit tests for the team to copy into their own areas.
 * Pure functions are tested here because they do not render UI, run quickly,
 * and are not fragile when the design changes.
 */
/**
 * The latest design uses yen instead of baht. Yen has no subunit in this app,
 * so these cases catch accidental decimal formatting regressions.
 */
describe('yen', () => {
  it('formats thousands with commas and no decimals', () => {
    expect(yen(3500)).toBe('3,500')
    expect(yen(45000)).toBe('45,000')
  })

  it('formats zero as plain zero instead of 0.00', () => {
    expect(yen(0)).toBe('0')
  })

  it('rounds decimals because yen has no subunit', () => {
    expect(yen(99.6)).toBe('100')
  })

  it('formats million-level values with separators', () => {
    expect(yen(1234567)).toBe('1,234,567')
  })
})

describe('yenAmount', () => {
  it('prefixes the yen symbol', () => {
    expect(yenAmount(45000)).toBe('¥45,000')
  })
})

describe('displayDate', () => {
  it('formats backend dates into a readable English format', () => {
    const formatted = displayDate('2026-08-11')
    expect(formatted).toContain('2026')
    expect(formatted).toContain('Aug')
    expect(formatted).toContain('11')
  })

  it('shows a dash for missing dates instead of Invalid Date', () => {
    expect(displayDate(null)).toBe('-')
  })

  it('timestamp เต็มจาก GET /api/apartment-config ต้องได้วันเดียวกับวันที่ล้วน ไม่ใช่ Invalid Date', () => {
    // updatedAt ของอัตราค่าสาธารณูปโภคเป็น timestamp ไม่ใช่แค่วันที่ (US-16)
    // เลือก 08:15Z เพราะตรงกับ 15:15 ตามเวลาไทย ยังเป็นวันที่ 6 ทั้งสองโซน
    expect(displayDate('2026-09-06T08:15:30.000Z')).toBe(displayDate('2026-09-06'))
    expect(displayDate('2026-09-06T08:15:30.000Z')).not.toContain('Invalid')
  })
})

/**
 * ตัวย่อของชื่อถูกใช้แทนรูปโปรไฟล์ทั้งใน InitialsAvatar และ ProfileAvatar
 * ชื่อที่ว่างเป็นเรื่องปกติ ไม่ใช่เคสหลุดโลก จึงต้องไม่คืนสตริงเปล่าจนกรอบว่างโบ๋
 */
describe('initialsFrom', () => {
  it('สองคำได้ตัวแรกของทั้งสองคำ', () => {
    expect(initialsFrom('Somchai Prasert')).toBe('SP')
  })

  it('คำเดียวได้ตัวเดียว', () => {
    expect(initialsFrom('admin')).toBe('A')
  })

  it('สามคำขึ้นไปเอาแค่สองคำแรก ไม่ให้ล้นกรอบ avatar', () => {
    expect(initialsFrom('Somchai Prasert Chaiyo')).toBe('SP')
  })

  it('ชื่อว่างหรือมีแต่ช่องว่างได้สตริงเปล่า ให้ฝั่งที่เรียกโชว์ขีดถามแทน', () => {
    expect(initialsFrom('')).toBe('')
    expect(initialsFrom('   ')).toBe('')
  })

  it('ช่องว่างหัวท้ายและช่องว่างซ้อนไม่ทำให้ย่อผิด', () => {
    expect(initialsFrom('  somchai   prasert  ')).toBe('SP')
  })
})

describe('daysUntil', () => {
  // Used for the expiring-lease badge on dashboard room cards; being off by
  // one day would hide the badge.
  const reference = new Date('2026-09-04T09:30:00')

  it('counts the days remaining until the target date', () => {
    expect(daysUntil('2026-09-16', reference)).toBe(12)
  })

  it('returns zero for today instead of a negative value', () => {
    expect(daysUntil('2026-09-04', reference)).toBe(0)
  })

  it('returns a negative value for past dates', () => {
    expect(daysUntil('2026-09-01', reference)).toBe(-3)
  })

  it('counts correctly across month boundaries', () => {
    expect(daysUntil('2026-10-04', reference)).toBe(30)
  })
})


/**
 * These tests come from a QA review bug. The previous code used toISOString
 * to determine today's date, which returns a UTC date. Thailand is GMT+7, so
 * from midnight until early morning in Bangkok it incorrectly returned yesterday.
 *
 * The previous tests missed it because they used midday reference times that
 * landed on the same date in both zones. These cases intentionally use times
 * where the two zones fall on different dates.
 */
describe('todayInBangkok', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayInBangkok(new Date('2026-09-08T05:00:00Z'))).toBe('2026-09-08')
  })

  it('treats late UTC night as the next day in Bangkok', () => {
    // 2026-09-08T23:30:00Z is 2026-09-09 06:30 in Bangkok.
    expect(todayInBangkok(new Date('2026-09-08T23:30:00Z'))).toBe('2026-09-09')
  })

  it('keeps early Bangkok morning on the local date instead of the UTC date', () => {
    // 2026-09-08T18:00:00Z is 2026-09-09 01:00 in Bangkok.
    const utcAnswer = new Date('2026-09-08T18:00:00Z').toISOString().slice(0, 10)
    expect(utcAnswer).toBe('2026-09-08')
    expect(todayInBangkok(new Date('2026-09-08T18:00:00Z'))).toBe('2026-09-09')
  })
})

describe('daysUntil at 1 AM Bangkok time', () => {
  it('returns a negative value for a lease that ended yesterday', () => {
    // Bangkok time is 2026-09-09 01:00. A lease ending on 2026-09-08 is one day overdue.
    const atOneAm = new Date('2026-09-08T18:00:00Z')
    expect(daysUntil('2026-09-08', atOneAm)).toBe(-1)
  })

  it('returns zero for a lease ending today', () => {
    const atOneAm = new Date('2026-09-08T18:00:00Z')
    expect(daysUntil('2026-09-09', atOneAm)).toBe(0)
  })
})
