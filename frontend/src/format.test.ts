import { describe, expect, it } from 'vitest'
import {
  todayInBangkok,
  baht,
  bahtAmount,
  dateInBangkok,
  daysUntil,
  displayDate,
  initialsFrom,
} from './format'

/**
 * ตัวอย่างการเขียน unit test ฝั่ง frontend ไว้ให้ทีมก๊อปไปทำส่วนของตัวเอง
 * เลือกเทส pure function เพราะไม่ต้องเรนเดอร์อะไรเลย รันเร็วและไม่พังตามดีไซน์ที่จะเปลี่ยน
 */
/**
 * SSK-126 เงินกลับเป็นบาทตาม feedback อาจารย์ บาทมีสตางค์จึงมีทศนิยมสองตำแหน่งเสมอ
 * ให้ตรงกับเอกสาร PDF ฝั่ง backend ถ้าใครเผลอตัดทศนิยมออกอีก เคสพวกนี้จะแดงทันที
 */
describe('baht', () => {
  it('คั่นหลักพันด้วยคอมมาและมีทศนิยมสองตำแหน่งเสมอ แม้ยอดจะลงตัว', () => {
    expect(baht(3500)).toBe('3,500.00')
    expect(baht(45000)).toBe('45,000.00')
  })

  it('ศูนย์ได้ 0.00 ไม่ใช่ 0 เปล่า', () => {
    expect(baht(0)).toBe('0.00')
  })

  it('สตางค์ยังอยู่ ไม่ถูกปัดทิ้งแบบตอนเป็นเยน', () => {
    expect(baht(99.6)).toBe('99.60')
    expect(baht(12.5)).toBe('12.50')
  })

  it('หลักล้านก็ยังคั่นถูก', () => {
    expect(baht(1234567)).toBe('1,234,567.00')
  })
})

describe('bahtAmount', () => {
  it('มีสัญลักษณ์บาทนำหน้า', () => {
    expect(bahtAmount(45000)).toBe('฿45,000.00')
  })
})

describe('displayDate', () => {
  it('แปลงวันที่จาก backend เป็นรูปแบบที่อ่านง่ายเป็นภาษาอังกฤษ', () => {
    const formatted = displayDate('2026-08-11')
    expect(formatted).toContain('2026')
    expect(formatted).toContain('Aug')
    expect(formatted).toContain('11')
  })

  it('ไม่มีวันที่ให้แสดงขีดแทน ไม่ใช่ Invalid Date', () => {
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
  // ใช้ติดป้าย "สัญญาใกล้หมด" บนการ์ดห้องในแดชบอร์ด นับผิดวันเดียวก็ป้ายหาย
  const reference = new Date('2026-09-04T09:30:00')

  it('นับจำนวนวันที่เหลือถึงวันที่กำหนด', () => {
    expect(daysUntil('2026-09-16', reference)).toBe(12)
  })

  it('วันนี้เองได้ศูนย์ ไม่ใช่ติดลบ ถึงจะเรียกตอนบ่ายก็ตาม', () => {
    expect(daysUntil('2026-09-04', reference)).toBe(0)
  })

  it('วันที่ผ่านมาแล้วได้ค่าติดลบ', () => {
    expect(daysUntil('2026-09-01', reference)).toBe(-3)
  })

  it('ข้ามเดือนก็ยังนับถูก', () => {
    expect(daysUntil('2026-10-04', reference)).toBe(30)
  })
})


/**
 * เทสชุดนี้มาจากบั๊กที่ QA เจอตอนรีวิว โค้ดเดิมใช้ toISOString หาว่าวันนี้คือ
 * วันอะไร ซึ่งคืนวัน UTC ส่วนไทยเป็น GMT+7 ช่วงเที่ยงคืนถึงเกือบเจ็ดโมงเช้า
 * ตามเวลาไทยจึงตอบเป็นวันเมื่อวาน
 *
 * เทสเดิมจับไม่ได้เพราะเลือกเวลาอ้างอิงตอนกลางวัน ซึ่งบังเอิญตกวันเดียวกันทั้ง
 * สองโซน เคสข้างล่างจึงจงใจใช้เวลาที่สองโซนคนละวันกัน
 */
describe('todayInBangkok', () => {
  it('คืนรูปแบบ YYYY-MM-DD', () => {
    expect(todayInBangkok(new Date('2026-09-08T05:00:00Z'))).toBe('2026-09-08')
  })

  it('ห้าทุ่มครึ่ง UTC คือวันถัดไปแล้วในไทย', () => {
    // 2026-09-08T23:30:00Z ตรงกับ 2026-09-09 06:30 ตามเวลาไทย
    expect(todayInBangkok(new Date('2026-09-08T23:30:00Z'))).toBe('2026-09-09')
  })

  it('ตีหนึ่งตามเวลาไทยยังเป็นวันเดิม ไม่ถอยไปเมื่อวานแบบที่ UTC ทำ', () => {
    // 2026-09-08T18:00:00Z ตรงกับ 2026-09-09 01:00 ตามเวลาไทย
    const utcAnswer = new Date('2026-09-08T18:00:00Z').toISOString().slice(0, 10)
    expect(utcAnswer).toBe('2026-09-08')
    expect(todayInBangkok(new Date('2026-09-08T18:00:00Z'))).toBe('2026-09-09')
  })
})

describe('daysUntil ตอนตีหนึ่งตามเวลาไทย', () => {
  it('สัญญาที่หมดเมื่อวานต้องได้ค่าติดลบ ไม่ใช่ศูนย์', () => {
    // เวลาไทยคือ 2026-09-09 01:00 สัญญาหมด 2026-09-08 จึงเลยมาแล้วหนึ่งวัน
    const atOneAm = new Date('2026-09-08T18:00:00Z')
    expect(daysUntil('2026-09-08', atOneAm)).toBe(-1)
  })

  it('สัญญาที่หมดวันนี้ได้ศูนย์', () => {
    const atOneAm = new Date('2026-09-08T18:00:00Z')
    expect(daysUntil('2026-09-09', atOneAm)).toBe(0)
  })
})

/**
 * reportedAt ของใบแจ้งซ่อมเป็นเวลาเต็มแบบ UTC ตัวเลข Today's Activity ของแท็บ Log เคยเทียบ
 * สตริงตรง ๆ กับวันนี้จึงได้ศูนย์เสมอ (SSK-131) เคสข้างล่างจงใจใช้เวลาที่ UTC กับไทยคนละวันกัน
 */
describe('dateInBangkok', () => {
  it('ห้าโมงครึ่งเย็น UTC คือวันถัดไปแล้วในไทย ตัดสิบตัวแรกเฉย ๆ ไม่ได้', () => {
    // 2026-09-25T17:30:00Z ตรงกับ 2026-09-26 00:30 ตามเวลาไทย
    expect(dateInBangkok('2026-09-25T17:30:00Z')).toBe('2026-09-26')
  })

  it('เวลาที่ตกวันเดียวกันทั้งสองโซนได้วันเดิม', () => {
    expect(dateInBangkok('2026-09-25T03:12:00.123456Z')).toBe('2026-09-25')
  })

  it('วันที่ล้วนคืนค่าเดิม ไม่ถูกเลื่อนตามโซนเวลา', () => {
    expect(dateInBangkok('2026-09-25')).toBe('2026-09-25')
  })
})
