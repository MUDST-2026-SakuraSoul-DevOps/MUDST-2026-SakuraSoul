import { describe, expect, it } from 'vitest'
import { calculateBill, receiptTotal, utilityCharge, type ReceiptLineItem } from './receipt'

/**
 * SSK-128 (feedback อาจารย์ข้อ 10: ใส่เลขผิดแล้วเทสยังผ่าน)
 *
 * ค่าที่คาดหวังทุกตัวในไฟล์นี้คิดด้วยมือแล้วเขียนเป็นตัวเลขตรง ๆ ห้ามเอาผลจากโค้ดที่กำลังเทส
 * (หรือจากสิ่งที่หน้าจอแสดง) มาเป็นค่าคาดหวัง เพราะถ้าสูตรผิด ทั้งสองฝั่งก็ผิดเหมือนกันและเทสยังเขียว
 *
 * ลองพิสูจน์ได้: เปลี่ยน * เป็น + ใน utilityCharge หรือลืมบวกรายการใดใน calculateBill
 * เทสในไฟล์นี้ต้องแดง
 */
describe('utilityCharge', () => {
  it('ค่าไฟ/น้ำ = หน่วย × อัตรา', () => {
    expect(utilityCharge(120, 50)).toBe(6000)
    expect(utilityCharge(15, 100)).toBe(1500)
    expect(utilityCharge(33, 100)).toBe(3300)
    // อัตราทศนิยม: 120 × 8.5 = 1,020
    expect(utilityCharge(120, 8.5)).toBe(1020)
  })

  it('หน่วยเป็น 0 ว่าง หรือติดลบ คิดเป็น 0 บาท', () => {
    expect(utilityCharge(0, 50)).toBe(0)
    expect(utilityCharge(Number.NaN, 50)).toBe(0)
    expect(utilityCharge(-5, 50)).toBe(0)
  })
})

describe('receiptTotal', () => {
  it('ยอดรวม = ผลบวกของทุกรายการ', () => {
    const items: ReceiptLineItem[] = [
      { id: 'room-rent', item: 'Room rent', amount: 3500 },
      { id: 'electricity', item: 'Electricity', amount: 960 },
      { id: 'water', item: 'Water', amount: 180 },
    ]
    // 3,500 + 960 + 180 = 4,640
    expect(receiptTotal(items)).toBe(4640)
  })

  it('ไม่มีรายการเลยยอดเป็น 0', () => {
    expect(receiptTotal([])).toBe(0)
  })
})

describe('calculateBill', () => {
  it('บิลห้อง Single ค่าเช่า 3,500 ไฟ 120 หน่วย × 8 น้ำ 10 หน่วย × 18', () => {
    // ไฟ 120 × 8 = 960, น้ำ 10 × 18 = 180, รวม 3,500 + 960 + 180 = 4,640
    expect(
      calculateBill({
        roomRent: 3500,
        electricUsage: 120,
        electricRate: 8,
        waterUsage: 10,
        waterRate: 18,
        applianceFee: 0,
        repairCharge: 0,
      }),
    ).toEqual({ electric: 960, water: 180, total: 4640 })
  })

  it('รวมค่าเครื่องใช้ไฟฟ้ากับค่าซ่อมเข้ายอดด้วย', () => {
    // 45,000 + (120 × 50 = 6,000) + (33 × 100 = 3,300) + 3,000 + 3,500 = 60,800
    expect(
      calculateBill({
        roomRent: 45000,
        electricUsage: 120,
        electricRate: 50,
        waterUsage: 33,
        waterRate: 100,
        applianceFee: 3000,
        repairCharge: 3500,
      }),
    ).toEqual({ electric: 6000, water: 3300, total: 60800 })
  })
})
