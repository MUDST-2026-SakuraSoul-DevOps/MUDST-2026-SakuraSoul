import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ApartmentConfig, Lease, RoomDetail, RoomSummary, Tenant } from '../api/types'
import * as api from '../api/client'
import * as downloads from '../lib/downloadFile'
import { createContractPdfBlob, downloadContractPdf, propertyDetails, renderContractToCanvas } from './contractPdf'

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

function expectPdfReferences(bytes: Uint8Array, objectCount: number) {
  // ใช้ latin1 เพื่อให้หนึ่งตัวอักษรตรงกับหนึ่ง byte แม้ PDF จะฝังภาพหรือข้อความ UTF-8
  const binary = new TextDecoder('latin1').decode(bytes)
  const xrefOffset = Number(binary.match(/startxref\n(\d+)\n%%EOF/)?.[1])
  expect(Number.isInteger(xrefOffset)).toBe(true)
  expect(binary.slice(xrefOffset)).toMatch(new RegExp(`^xref\\n0 ${objectCount + 1}\\n`))

  const entries = [...binary.slice(xrefOffset).matchAll(/^(\d{10}) 00000 n /gm)]
  expect(entries).toHaveLength(objectCount)
  entries.forEach((entry, index) => {
    // ทุก entry ต้องชี้ตำแหน่ง object จริง ไม่ใช่แค่มีตาราง xref อยู่ในไฟล์
    expect(binary.slice(Number(entry[1]))).toMatch(new RegExp(`^${index + 1} 0 obj\\n`))
  })
}

afterEach(() => vi.restoreAllMocks())

const tenant: Tenant = { id: 7, fullName: 'Ada (Tenant)', phone: '0812345678', nationalId: '1234567890123', email: 'ada@example.test' }
const config: ApartmentConfig = { electricRatePerUnit: 8, waterRatePerUnit: 20, commonAreaFee: 0, internetFee: 300, updatedAt: '2026-11-01T00:00:00Z' }

function captureCanvasText() {
  // Record the browser drawing boundary; PDF bytes are checked separately above.
  const ctx = {
    scale: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  return ctx
}

describe('contract PDF content and download', () => {
  it('prints tenant details, agreed terms and zero fees without replacing them with defaults', () => {
    const ctx = captureCanvasText()
    const canvas = renderContractToCanvas(lease({ endDate: '2027-10-31', securityDeposit: 0, floor: 2, roomType: 'DOUBLE' }), tenant, room({ floor: 3, roomType: 'SINGLE' }), config)
    const text = ctx.fillText.mock.calls.map(([value]) => value)
    expect(canvas.width).toBe(2400)
    expect(canvas.height).toBe(3393)
    expect(text).toEqual(expect.arrayContaining([
      tenant.phone, tenant.nationalId, tenant.email, 'Double Bedroom', '2',
      '฿4,500.00', '฿0.00', '฿8.00 per unit', '฿20.00 per unit', '฿0.00 per month', '฿300.00 per month',
    ]))
    expect(text).not.toContain('Indefinite')
    expect(text).not.toContain('Single Bedroom')
    expect(text).not.toContain('Not available')
  })

  it('marks unavailable tenant, property and utility data honestly', () => {
    const ctx = captureCanvasText()
    renderContractToCanvas(lease({ securityDeposit: undefined }))
    const text = ctx.fillText.mock.calls.map(([value]) => value)
    expect(text.filter(value => value === 'Not provided')).toHaveLength(4)
    expect(text.filter(value => value === 'Not available')).toHaveLength(6)
    expect(text).toContain('Indefinite')
    expect(text).not.toContain('฿0.00 per month')
  })

  it('loads missing details before downloading a PDF with the correct filename and tenant', async () => {
    const fetchTenant = vi.spyOn(api, 'fetchTenant').mockResolvedValue(tenant)
    const fetchRoom = vi.spyOn(api, 'fetchRoom').mockResolvedValue(room() as RoomDetail)
    const fetchConfig = vi.spyOn(api, 'fetchApartmentConfig').mockResolvedValue(config)
    const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    const ctx = captureCanvasText()
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,')
    await downloadContractPdf(lease())
    expect(fetchTenant).toHaveBeenCalledWith(7)
    expect(fetchRoom).toHaveBeenCalledWith(14)
    expect(fetchConfig).toHaveBeenCalledOnce()
    expect(ctx.fillText).toHaveBeenCalledWith(tenant.phone, expect.any(Number), expect.any(Number))
    expect(download).toHaveBeenCalledWith('contract-Unit-202.pdf', expect.any(Blob))
    const bytes = await bytesOf(download.mock.calls[0][1])
    expect(new TextDecoder().decode(bytes)).toContain('Ada \\(Tenant\\)')
    expectPdfReferences(bytes, 4)
  })

  it('reuses supplied details without requesting them again', async () => {
    const fetchTenant = vi.spyOn(api, 'fetchTenant')
    const fetchRoom = vi.spyOn(api, 'fetchRoom')
    const fetchConfig = vi.spyOn(api, 'fetchApartmentConfig').mockResolvedValue(config)
    vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    captureCanvasText()
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,')
    await downloadContractPdf(lease(), tenant, room())
    expect(fetchTenant).not.toHaveBeenCalled()
    expect(fetchRoom).not.toHaveBeenCalled()
    expect(fetchConfig).toHaveBeenCalledOnce()
    fetchConfig.mockClear()
    await downloadContractPdf(lease(), tenant, room(), config)
    expect(fetchConfig).not.toHaveBeenCalled()
  })

  it('still downloads a structurally valid contract when all detail requests fail', async () => {
    vi.spyOn(api, 'fetchTenant').mockRejectedValue(new Error('offline'))
    vi.spyOn(api, 'fetchRoom').mockRejectedValue(new Error('offline'))
    vi.spyOn(api, 'fetchApartmentConfig').mockRejectedValue(new Error('offline'))
    const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    const ctx = captureCanvasText()
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,')
    await downloadContractPdf(lease())
    expect(ctx.fillText).toHaveBeenCalledWith('Not available', expect.any(Number), expect.any(Number))
    expect(download).toHaveBeenCalledOnce()
    expectPdfReferences(await bytesOf(download.mock.calls[0][1]), 4)
  })
})

describe('propertyDetails', () => {
  it('prints the floor and room type of the real unit', () => {
    expect(propertyDetails(room())).toEqual({ floor: '2', roomType: 'Double Bedroom' })
    expect(propertyDetails(room({ floor: 1, roomType: 'SINGLE' }))).toEqual({ floor: '1', roomType: 'Single Bedroom' })
  })

  // SSK-140 เดิมโหลดห้องไม่ได้แล้วเอกสารเดาเป็นชั้น 1 ห้อง Single Bedroom เอง
  // ซึ่งเป็นค่าที่แต่งขึ้นในสัญญาที่ผู้เช่าเซ็น ต้องบอกตรง ๆ ว่าไม่มีข้อมูล
  it('says Not available instead of guessing when the unit could not be loaded', () => {
    expect(propertyDetails(null)).toEqual({ floor: 'Not available', roomType: 'Not available' })
    expect(propertyDetails(undefined)).toEqual({ floor: 'Not available', roomType: 'Not available' })
  })

  // SSK-160/SSK-180 ปรับโครงสร้างอาคารหรือประเภทห้องทีหลัง สัญญาเก่าต้องพิมพ์ค่า ณ วันทำสัญญา
  it('prints the floor and room type copied into the lease, not the unit as it is today', () => {
    expect(propertyDetails(room({ floor: 3, roomType: 'SINGLE' }), { floor: 2, roomType: 'DOUBLE' })).toEqual({
      floor: '2',
      roomType: 'Double Bedroom',
    })
    expect(propertyDetails(null, { floor: 1, roomType: 'SINGLE' })).toEqual({ floor: '1', roomType: 'Single Bedroom' })
  })

  it('falls back to the current unit when the lease has no copy yet', () => {
    expect(propertyDetails(room(), {})).toEqual({ floor: '2', roomType: 'Double Bedroom' })
  })
})

describe('createContractPdfBlob', () => {
  it('สร้าง PDF สำรองที่มีข้อมูลสัญญาและ xref ใช้ได้เมื่อ canvas ใช้ไม่ได้', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,')

    const blob = createContractPdfBlob(lease())
    const bytes = await bytesOf(blob)
    const text = new TextDecoder().decode(bytes)
    const binary = new TextDecoder('latin1').decode(bytes)

    // ชื่อที่มีวงเล็บต้อง escape ใน PDF stream เพื่อไม่ให้ข้อความสัญญาหรือไฟล์เสีย
    expect(blob.type).toBe('application/pdf')
    expect(text).toContain('%PDF-1.4')
    expect(text).toContain('Contract No: CT-0042')
    expect(text).toContain('Ada \\(Tenant\\)')
    expect(text).toContain('Unit 202')
    expect(text).toContain('฿4,500.00')
    const streamStart = binary.indexOf('stream\n') + 'stream\n'.length
    const streamEnd = binary.indexOf('endstream\n', streamStart)
    const declaredLength = Number(binary.match(/4 0 obj\n<< \/Length (\d+) >>/)?.[1])
    expect(declaredLength).toBe(streamEnd - streamStart)
    expectPdfReferences(bytes, 4)
  })

  it('ฝังข้อมูล JPEG ใน PDF และให้ startxref ชี้ตารางอ้างอิงจริง', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    // ใช้ JPEG ที่เปิดอ่านได้จริงจาก asset ของโปรเจกต์แทน marker สั้นที่ไม่ใช่ภาพ
    const jpeg = readFileSync('public/login-bg.jpg')
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(`data:image/jpeg;base64,${jpeg.toString('base64')}`)

    const blob = createContractPdfBlob(lease())
    const bytes = await bytesOf(blob)
    const text = new TextDecoder('latin1').decode(bytes)

    // ตรวจทั้งภาพที่ฝังและตำแหน่ง xref จาก bytes ของไฟล์ ไม่ใช้ความยาวของสตริงแทน
    expect(blob.type).toBe('application/pdf')
    expect(text).toContain('/Filter /DCTDecode')
    expect(bytes.some((value, index) => value === 0xff && bytes[index + 1] === 0xd8)).toBe(true)
    expectPdfReferences(bytes, 5)
  })

  it.each([
    ['toDataURL โยนข้อผิดพลาด', () => { throw new Error('Canvas export failed') }],
    ['ข้อมูล base64 ไม่ถูกต้อง', () => 'data:image/jpeg;base64,!!!'],
  ])('ใช้ PDF สำรองเมื่อ %s', async (_caseName, dataUrl) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(dataUrl)

    const bytes = await bytesOf(createContractPdfBlob(lease({ tenantName: 'Fallback Tenant' })))
    const text = new TextDecoder().decode(bytes)

    // ข้อผิดพลาดของ canvas ต้องยังให้ไฟล์ PDF ที่มีชื่อผู้เช่าและโครงสร้างครบ
    expect(text).toContain('Fallback Tenant')
    expect(text).not.toContain('/DCTDecode')
    expectPdfReferences(bytes, 4)
  })
})
