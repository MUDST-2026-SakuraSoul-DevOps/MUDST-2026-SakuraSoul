import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createReceiptPdfBlob,
  downloadReceipt,
  downloadReceiptImage,
  downloadReceiptPdf,
  escapeHtml,
  formatReceiptText,
  printReceiptPdf,
  renderReceiptToCanvas,
  type ReceiptData,
} from './receipt'

/**
 * SSK-128 (feedback อาจารย์ข้อ 10: ใส่เลขผิดแล้วเทสยังผ่าน)
 *
 * ค่าที่คาดหวังทุกตัวในไฟล์นี้คิดด้วยมือแล้วเขียนเป็นตัวเลขตรง ๆ ห้ามเอาผลจากโค้ดที่กำลังเทส
 * (หรือจากสิ่งที่หน้าจอแสดง) มาเป็นค่าคาดหวัง เพราะถ้าสูตรผิด ทั้งสองฝั่งก็ผิดเหมือนกันและเทสยังเขียว
 *
 */
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

describe('escapeHtml', () => {
  it('escapes the five characters that can open a tag or leave an attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>Tom & Jerry</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;',
    )
  })

  it('escapes an ampersand that is already part of an entity, so the text shows exactly as typed', () => {
    expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;')
  })

  it('leaves plain text, Thai names and separators alone', () => {
    expect(escapeHtml('สมชาย ใจดี · ห้อง 101 · ฿3,500.00')).toBe('สมชาย ใจดี · ห้อง 101 · ฿3,500.00')
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

  it('printReceiptPdf prints an overdue receipt with an OVERDUE badge, awaiting payment', () => {
    const write = vi.fn()
    const close = vi.fn()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: { write, close } } as unknown as Window)

    // ใบล่าสุดที่ backend ส่ง overdue: true มา toReceiptData ให้ป้าย Overdue ป้ายตัวใหญ่ต้องพูดคำเดียวกัน
    printReceiptPdf({ ...sampleReceipt, status: 'Overdue' })

    expect(openSpy).toHaveBeenCalledWith('', '_blank', 'width=800,height=900')
    const html = write.mock.calls[0]?.[0] as string
    expect(html).toContain('<span class="meta-value" style="color: #f57f17;">Overdue</span>')
    expect(html).toMatch(/<span class="status-badge status-pending">\s*⚠ OVERDUE\s*<\/span>/)
    expect(html).toMatch(/<span class="payment-note">\s*Awaiting Payment\s*<\/span>/)
    expect(html).not.toContain('⚠ PENDING')
    expect(html).not.toContain('✓ PAID')
    expect(html).not.toContain('status-paid"')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('printReceiptPdf words the badge after the status for a part-paid and a pending receipt', () => {
    const partPaid = printedHtml({ ...sampleReceipt, status: 'Partially paid' })
    expect(partPaid).toContain('<span class="meta-value" style="color: #f57f17;">Partially paid</span>')
    expect(partPaid).toMatch(/<span class="status-badge status-pending">\s*⚠ PARTIALLY PAID\s*<\/span>/)
    expect(partPaid).not.toContain('⚠ PENDING')

    const pending = printedHtml({ ...sampleReceipt, status: 'Pending' })
    expect(pending).toMatch(/<span class="status-badge status-pending">\s*⚠ PENDING\s*<\/span>/)
    expect(pending).not.toContain('⚠ OVERDUE')
  })

  it('renderReceiptToCanvas draws the same status badge as the printed receipt', () => {
    // ใบที่ดาวน์โหลดเป็น PDF หรือรูปในโหมด backend จำลองวาดจากผืนผ้าใบนี้ ป้ายต้องตรงกับใบที่พิมพ์
    const { ctx } = mockCanvasContext()
    renderReceiptToCanvas({ ...sampleReceipt, status: 'Overdue' })
    renderReceiptToCanvas({ ...sampleReceipt, status: 'Partially paid' })

    const badges = ctx.fillText.mock.calls.filter(([text]) => /^(✓|⚠) /.test(String(text))).map(([text]) => text)
    expect(badges).toEqual(['⚠ OVERDUE', '⚠ PARTIALLY PAID'])
  })

  /*
    หน้าต่างพิมพ์เปิดจาก about:blank จึงเป็น origin เดียวกับแอป ข้อความในใบเสร็จมาจากข้อมูลที่คนพิมพ์เอง
    (ชื่อผู้เช่า ชื่อค่าใช้จ่ายพิเศษ ช่องทางชำระแบบข้อความอิสระของ /pay เดิม) ถ้าเขียนลงไปเป็น HTML ตรง ๆ
    สคริปต์ที่แฝงมาจะรันด้วยสิทธิ์ของแอดมินที่กดพิมพ์ ทุกช่องที่เป็นข้อความต้องออกมาเป็นตัวอักษรเท่านั้น
  */
  function printedHtml(receipt: ReceiptData): string {
    const write = vi.fn()
    vi.spyOn(window, 'open').mockReturnValue({ document: { write, close: vi.fn() } } as unknown as Window)
    printReceiptPdf(receipt)
    return write.mock.calls[0]?.[0] as string
  }

  it('printReceiptPdf writes a tenant name and an item name that look like HTML as plain text', () => {
    const html = printedHtml({
      ...sampleReceipt,
      tenant: '<img src=x onerror="alert(1)">',
      items: [{ id: 'parking', item: '<b>Parking</b>', amount: 500 }],
      totalAmount: 500,
    })

    expect(html).toContain('<span class="meta-value">&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</span>')
    expect(html).toContain('<div class="item-name">&lt;b&gt;Parking&lt;/b&gt;</div>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Parking</b>')
  })

  it('printReceiptPdf escapes every other text field it prints, title and payment note included', () => {
    const html = printedHtml({
      receiptNo: 'RC-1</title><script>steal()</script>',
      tenant: 'Tom & Jerry',
      unit: '<u>101</u>',
      billingMonth: '<i>October</i> 2026',
      dueDate: "5 Nov '26",
      items: [
        { id: 'water', item: 'Water', detail: '<script>detail()</script>', usageValue: 6, usageUnit: '<s>units</s>', rate: 18, amount: 108 },
      ],
      totalAmount: 108,
      status: 'Paid',
      paidDate: '3 Nov 2026',
      paymentMethod: '<a href="javascript:pay()">Cash</a>',
    })

    expect(html).toContain('<title>Receipt - RC-1&lt;/title&gt;&lt;script&gt;steal()&lt;/script&gt;</title>')
    expect(html).toContain('<span class="meta-value">RC-1&lt;/title&gt;&lt;script&gt;steal()&lt;/script&gt;</span>')
    expect(html).toContain('<span class="meta-value">Tom &amp; Jerry</span>')
    expect(html).toContain('<span class="meta-value">&lt;u&gt;101&lt;/u&gt;</span>')
    expect(html).toContain('<span class="meta-value">&lt;i&gt;October&lt;/i&gt; 2026</span>')
    expect(html).toContain('<span class="meta-value">5 Nov &#39;26</span>')
    expect(html).toContain('<div class="item-detail">&lt;script&gt;detail()&lt;/script&gt;</div>')
    expect(html).toMatch(/>\s*6 &lt;s&gt;units&lt;\/s&gt;\s*</)
    expect(html).toMatch(/<span class="payment-note">\s*3 Nov 2026 · &lt;a href=&quot;javascript:pay\(\)&quot;&gt;Cash&lt;\/a&gt;\s*<\/span>/)
    // ตัวเลขเงินที่จัดรูปเองยังออกมาตามปกติ
    expect(html).toContain('<span class="total-amount">฿108.00</span>')
    for (const raw of ['<script>steal()', '<script>detail()', '<u>101</u>', '<i>October</i>', '<s>units</s>', '<a href=', 'Tom & Jerry']) {
      expect(html).not.toContain(raw)
    }
  })

  it('createReceiptPdfBlob builds JPEG PDF when canvas succeeds and falls back to simple PDF on error', () => {
    mockCanvasContext('data:image/jpeg;base64,/9j/4AAQ')
    // ผืนผ้าใบคงที่ 640×760 ไม่ว่ากี่รายการ ภาพจึงกว้างกว่าสัดส่วนหน้า A4 เสมอ ทาง imgRatio < pageRatio ไม่เกิดจากใบจริง
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
