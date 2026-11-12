import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calculateBill,
  createReceiptPdfBlob,
  downloadReceipt,
  downloadReceiptImage,
  downloadReceiptPdf,
  formatReceiptText,
  printReceiptPdf,
  receiptTotal,
  renderReceiptToCanvas,
  utilityCharge,
  type ReceiptData,
  type ReceiptLineItem,
} from './receipt'

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

describe('receipt rendering, printing, and PDF/image downloads', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const sampleReceipt: ReceiptData = {
    receiptNo: 'RC-2026-0099',
    tenant: 'Aiko Tanaka',
    unit: '102',
    billingMonth: 'September 2026',
    dueDate: '5 Oct 2026',
    items: [
      { id: 'rent', item: 'Room rent', amount: 3500 },
      { id: 'electric', item: 'Electricity', detail: 'Meter #1', usageValue: 120, usageUnit: 'units', rate: 8, amount: 960 },
      { id: 'water', item: 'Water', usageValue: 10, usageUnit: '', rate: 18, amount: 180 },
    ],
    totalAmount: 4640,
    status: 'Pending',
  }

  function mockCanvasContext(dataUrl: string | (() => string) = 'data:image/jpeg;base64,/9j/4AAQ') {
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    }
    const origCreateElement = document.createElement.bind(document)
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName)
      if (tagName === 'canvas') {
        const canvas = el as HTMLCanvasElement
        vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
        vi.spyOn(canvas, 'toDataURL').mockImplementation(() =>
          typeof dataUrl === 'function' ? dataUrl() : dataUrl,
        )
      }
      if (tagName === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {})
      }
      return el
    })
    return { ctx, createSpy }
  }

  it('renderReceiptToCanvas draws pending and paid receipts and handles missing 2d context', () => {
    const { ctx } = mockCanvasContext()
    const canvas = renderReceiptToCanvas(sampleReceipt)
    expect(canvas.width).toBe(640)
    expect(ctx.fillText).toHaveBeenCalledWith('SAKURA SOUL APARTMENT', 320, 56)
    expect(ctx.fillText).toHaveBeenCalledWith('⚠ PENDING', 55, expect.any(Number))
    expect(ctx.fillText).toHaveBeenCalledWith('Awaiting Payment', 585, expect.any(Number))

    renderReceiptToCanvas({
      ...sampleReceipt,
      status: 'Paid',
      paidDate: '4 Oct 2026',
      paymentMethod: 'QR',
    })
    expect(ctx.fillText).toHaveBeenCalledWith('✓ PAID', 55, expect.any(Number))
  })

  it('downloadReceiptImage falls back to 1x1 png when toDataURL throws', () => {
    mockCanvasContext(() => {
      throw new Error('tainted canvas')
    })
    expect(() => downloadReceiptImage(sampleReceipt)).not.toThrow()
  })

  it('printReceiptPdf writes receipt HTML when popup opens and no-ops when blocked', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValueOnce(null)
    printReceiptPdf(sampleReceipt)
    expect(openSpy).toHaveBeenCalledTimes(1)

    const write = vi.fn()
    const close = vi.fn()
    openSpy.mockReturnValueOnce({ document: { write, close } } as unknown as Window)
    printReceiptPdf({
      ...sampleReceipt,
      status: 'Paid',
      paidDate: '4 Oct 2026',
      paymentMethod: 'Cash',
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]?.[0]).toContain('RC-2026-0099')
    expect(write.mock.calls[0]?.[0]).toContain('✓ PAID')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('createReceiptPdfBlob builds JPEG PDF when canvas succeeds and falls back to simple PDF on error', () => {
    mockCanvasContext('data:image/jpeg;base64,/9j/4AAQ')
    // 10+ items makes height > width so imgRatio < pageRatio branch runs too
    const tallReceipt: ReceiptData = {
      ...sampleReceipt,
      items: Array.from({ length: 18 }, (_, i) => ({
        id: `item-${i}`,
        item: `Charge ${i}`,
        detail: 'Extra detail',
        amount: 100,
      })),
    }
    const jpegBlob = createReceiptPdfBlob(tallReceipt)
    expect(jpegBlob.type).toBe('application/pdf')
    expect(jpegBlob.size).toBeGreaterThan(100)

    vi.restoreAllMocks()
    mockCanvasContext(() => {
      throw new Error('no jpeg')
    })
    const fallbackBlob = createReceiptPdfBlob(sampleReceipt)
    expect(fallbackBlob.type).toBe('application/pdf')
    expect(fallbackBlob.size).toBeGreaterThan(100)
  })

  it('downloadReceiptPdf and downloadReceipt dispatch pdf, image, and text formats', () => {
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:mock', writable: true })
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, writable: true })
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mockCanvasContext('data:image/jpeg;base64,/9j/4AAQ')

    expect(() => downloadReceiptPdf(sampleReceipt)).not.toThrow()
    expect(() => downloadReceipt(sampleReceipt, 'pdf')).not.toThrow()
    expect(() => downloadReceipt(sampleReceipt, 'image')).not.toThrow()
    expect(() => downloadReceipt(sampleReceipt, 'text')).not.toThrow()
  })
})
