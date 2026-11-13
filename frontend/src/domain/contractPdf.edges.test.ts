import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ApartmentConfig, Lease, RoomSummary, Tenant } from '../api/types'
import { createContractPdfBlob, downloadContractPdf, renderContractToCanvas } from './contractPdf'

const fetchTenant = vi.fn()
const fetchRoom = vi.fn()
const fetchApartmentConfig = vi.fn()
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  fetchTenant: (...args: unknown[]) => fetchTenant(...args),
  fetchRoom: (...args: unknown[]) => fetchRoom(...args),
  fetchApartmentConfig: (...args: unknown[]) => fetchApartmentConfig(...args),
}))

const downloadBlob = vi.fn()
vi.mock('../lib/downloadFile', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}))

/**
 * ตัววาด PDF ในเบราว์เซอร์ใช้ canvas ซึ่ง jsdom ไม่มี (getContext คืน null)
 * จึงเทสค่าที่จะพิมพ์ในหัวข้อ 2 ผ่าน propertyDetails แทนการอ่านจากภาพ
 */

function room(overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id: 14,
    roomNumber: '202',
    floor: 2,
    roomType: 'DOUBLE',
    baseRent: 4500,
    status: 'OCCUPIED',
    currentLease: null,
    openMaintenanceCount: 0,
    openMaintenanceTitle: null,
    ...overrides,
  }
}

function lease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: 42,
    roomId: 14,
    roomNumber: '202',
    tenantId: 7,
    tenantName: 'Ada (Tenant)',
    startDate: '2026-11-01',
    endDate: null,
    monthlyRent: 4500,
    billingCycle: 'MONTHLY',
    status: 'ACTIVE',
    securityDeposit: 9000,
    ...overrides,
  }
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  // อ่าน Blob ที่ผู้ใช้จะดาวน์โหลดจริง ไม่ตรวจเพียงค่าที่ส่งให้ตัวสร้าง PDF
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

afterEach(() => vi.restoreAllMocks())

describe('createContractPdfBlob without image export', () => {
  it('falls back to the text PDF when the canvas cannot export images at all', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    // เบราว์เซอร์บางตัว (หรือ canvas ที่ถูก polyfill) ไม่มี toDataURL
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toDataURL')!
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', { value: undefined, configurable: true, writable: true })
    let text: string
    try {
      text = new TextDecoder().decode(await bytesOf(createContractPdfBlob(lease({ endDate: '2027-10-31' }))))
    } finally {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', original)
    }
    expect(text).toContain('End Date:')
    expect(text).not.toContain('Indefinite')
    expect(text).not.toContain('/DCTDecode')
  })
})

/**
 * canvas ปลอมที่จดทุกข้อความที่วาด jsdom ไม่มี 2d context จริง แต่ตัววาดเรียกแค่เมธอดวาดกับตั้งค่าสี/ฟอนต์
 * จดข้อความไว้ก็พอจะตรวจได้ว่าเอกสารที่ผู้เช่าเซ็นพิมพ์อะไรลงไป
 */
function fakeContext() {
  const texts: string[] = []
  const calls: string[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop === 'fillText') return (text: string) => texts.push(text)
      if (prop in target) return target[prop]
      return () => calls.push(prop)
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  return { texts, calls }
}

const TENANT: Tenant = { id: 7, fullName: 'Ada (Tenant)', email: 'ada@example.com', phone: '081-234-5678', nationalId: '1103700012345' }
const CONFIG: ApartmentConfig = { electricRatePerUnit: 8, waterRatePerUnit: 18, commonAreaFee: 300, internetFee: 250, updatedAt: '2026-11-01T00:00:00Z' }

describe('renderContractToCanvas', () => {
  it('draws the tenant, unit, terms and utility rates that were loaded', () => {
    const { texts, calls } = fakeContext()

    const canvas = renderContractToCanvas(lease({ endDate: '2027-10-31' }), TENANT, room(), CONFIG)

    expect(canvas.width).toBe(2400)
    expect(canvas.height).toBe(3393)
    expect(calls).toContain('scale')
    expect(texts).toEqual(expect.arrayContaining([
      'Residential Lease Agreement',
      'Contract No: CT-0042',
      '081-234-5678',
      '1103700012345',
      'ada@example.com',
      'Unit 202',
      '2',
      'Double Bedroom',
      '฿4,500.00',
      '฿9,000.00',
      '฿8.00 per unit',
      '฿18.00 per unit',
      '฿300.00 per month',
      '฿250.00 per month',
    ]))
    expect(texts).not.toContain('Indefinite')
    expect(texts).not.toContain('Not provided')
    expect(texts).not.toContain('Not available')
  })

  it('says Not provided / Not available / Indefinite instead of inventing values', () => {
    const { texts } = fakeContext()

    renderContractToCanvas(lease({ endDate: null, securityDeposit: undefined }), { ...TENANT, phone: '', email: null, nationalId: null }, null, null)

    // เบอร์ อีเมล เลขบัตร และเงินประกันที่ไม่มี = Not provided 4 ช่อง
    expect(texts.filter((t) => t === 'Not provided')).toHaveLength(4)
    // ชั้น ประเภทห้อง (lease ในเทสไม่มีสำเนา) และอัตราน้ำไฟ 4 ช่อง = Not available 6 ช่อง
    expect(texts.filter((t) => t === 'Not available')).toHaveLength(6)
    expect(texts).toContain('Indefinite')
  })

  it('falls back to the text PDF when the canvas cannot export images at all', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    // เบราว์เซอร์บางตัว (หรือ canvas ที่ถูก polyfill) ไม่มี toDataURL
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toDataURL')!
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', { value: undefined, configurable: true, writable: true })
    let text: string
    try {
      text = new TextDecoder().decode(await bytesOf(createContractPdfBlob(lease({ endDate: '2027-10-31' }))))
    } finally {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', original)
    }
    expect(text).toContain('End Date:')
    expect(text).not.toContain('Indefinite')
    expect(text).not.toContain('/DCTDecode')
  })

  it('returns the blank canvas when the browser gives no 2d context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const canvas = renderContractToCanvas(lease())
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
  })
})

describe('createContractPdfBlob page fit', () => {
  it('fits a tall image by height and centres it across the page', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const jpeg = readFileSync('public/login-bg.jpg')
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(`data:image/jpeg;base64,${jpeg.toString('base64')}`)
    // canvas ที่สูงกว่าสัดส่วน A4 ต้องย่อตามความสูงแล้วเว้นขอบซ้ายขวาเท่ากัน
    vi.spyOn(HTMLCanvasElement.prototype, 'height', 'get').mockReturnValue(6000)

    const text = new TextDecoder('latin1').decode(await bytesOf(createContractPdfBlob(lease())))

    const draw = text.match(/q\n([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/)
    expect(draw).not.toBeNull()
    const [, w, h, x, y] = draw!.map(Number)
    expect(h).toBeCloseTo(841.89, 1)
    expect(w).toBeLessThan(595.28)
    expect(x).toBeCloseTo((595.28 - w) / 2, 1)
    expect(y).toBeCloseTo(0, 1)
  })
})

describe('downloadContractPdf', () => {
  beforeEach(() => {
    fetchTenant.mockReset()
    fetchRoom.mockReset()
    fetchApartmentConfig.mockReset()
    downloadBlob.mockReset()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,')
  })

  it('downloads straight away when the tenant, unit and rates are already known', async () => {
    await downloadContractPdf(lease(), TENANT, room(), CONFIG)

    expect(fetchTenant).not.toHaveBeenCalled()
    expect(fetchRoom).not.toHaveBeenCalled()
    expect(fetchApartmentConfig).not.toHaveBeenCalled()
    expect(downloadBlob).toHaveBeenCalledWith('contract-Unit-202.pdf', expect.any(Blob))
  })

  it('loads only what is missing before drawing', async () => {
    fetchRoom.mockResolvedValue(room())
    fetchApartmentConfig.mockResolvedValue(CONFIG)

    await downloadContractPdf(lease(), TENANT, null, null)

    expect(fetchTenant).not.toHaveBeenCalled()
    expect(fetchRoom).toHaveBeenCalledWith(14)
    expect(fetchApartmentConfig).toHaveBeenCalledTimes(1)
    expect(downloadBlob).toHaveBeenCalledTimes(1)
  })

  it('loads only the tenant when the unit and rates were passed in', async () => {
    fetchTenant.mockResolvedValue(TENANT)

    await downloadContractPdf(lease(), null, room(), CONFIG)

    expect(fetchTenant).toHaveBeenCalledWith(7)
    expect(fetchRoom).not.toHaveBeenCalled()
    expect(fetchApartmentConfig).not.toHaveBeenCalled()
  })

  it('still downloads a document when every lookup fails', async () => {
    fetchTenant.mockRejectedValue(new Error('offline'))
    fetchRoom.mockRejectedValue(new Error('offline'))
    fetchApartmentConfig.mockRejectedValue(new Error('offline'))

    await downloadContractPdf(lease())

    expect(fetchTenant).toHaveBeenCalledWith(7)
    expect(downloadBlob).toHaveBeenCalledWith('contract-Unit-202.pdf', expect.any(Blob))
  })
})
