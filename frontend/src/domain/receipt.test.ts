import { describe, expect, it } from 'vitest'
import { calculateBill, formatReceiptText, receiptTotal, utilityCharge, type ReceiptData, type ReceiptLineItem } from './receipt'

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

describe('formatReceiptText', () => {
  const receipt: ReceiptData = {
    receiptNo: 'RC-2026-0042',
    tenant: 'Aiko Tanaka',
    unit: '102',
    billingMonth: 'September 2026',
    dueDate: '5 Oct 2026',
    items: [
      { id: 'rent', item: 'Room rent', amount: 3500 },
      { id: 'electric', item: 'Electricity', usageValue: 120, usageUnit: 'units', rate: 8, amount: 960 },
      { id: 'water', item: 'Water', usageValue: 15, usageUnit: 'units', rate: 18, amount: 270 },
    ],
    totalAmount: 4730,
    status: 'Pending',
  }

  it('uses the supplied receipt identity, meter usage, rates, and total', () => {
    const text = formatReceiptText(receipt)

    expect(text).toContain('RC-2026-0042')
    expect(text).toContain('Aiko Tanaka')
    expect(text).toContain('Unit:           102')
    expect(text).toContain('September 2026')
    expect(text).toContain('120 units')
    expect(text).toContain('15 units')
    expect(text).toContain('฿8.00')
    expect(text).toContain('฿18.00')
    expect(text).toContain('Total Amount:   ฿4,730.00')
  })

  it('includes optional item details and payment information only when supplied', () => {
    const pending = formatReceiptText({
      ...receipt,
      items: [{ id: 'repair', item: 'Repair charge', detail: 'Pipe replacement', amount: 250 }],
      totalAmount: 250,
    })
    expect(pending).toContain('(Pipe replacement)')
    expect(pending).toContain('Status:         Pending')
    expect(pending).not.toContain('Bank transfer')

    const paid = formatReceiptText({
      ...receipt,
      status: 'Paid',
      paidDate: '3 Oct 2026',
      paymentMethod: 'Cash',
    })
    expect(paid).toContain('Status:         Paid (3 Oct 2026 · Cash)')
  })
})
