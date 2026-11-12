import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Supply } from '../api/types'
import { ticketPatch } from '../api/maintenanceMappers'
import type { MaintenanceTask } from './maintenanceBoard'
import { nextApplianceSku } from './appliance'
import { validateBuildingLayout } from './buildingLayout'
import { validateExtraCharge } from './extraCharge'
import { confidenceOf, predictAll } from './maintenancePrediction'
import { METER_CSV_HEADER, METER_CSV_MAX_ROWS, checkMeterCsv } from './meterCsv'
import { SAMPLE_RECEIPT, createReceiptPdfBlob, printReceiptPdf } from './receipt'
import { billingSlotAt, normalizeSendTime } from './scheduledBilling'
import { byMostCritical } from './supplyStock'
import { addUsageLine } from './supplyUsage'
import { niceCeiling } from './usage'

/*
  ทางแยกเล็ก ๆ ของ domain ที่เทสประจำไฟล์ยังไม่ได้เดิน รวมไว้ที่เดียวเพราะแต่ละเรื่องสั้น
  แต่ละ describe บอกไว้ว่าเป็นกฎของหน้าไหน
*/

afterEach(() => vi.restoreAllMocks())

describe('meter CSV (SSK-166)', () => {
  const header = METER_CSV_HEADER.join(',')
  const rooms = new Set(['101'])

  it('refuses a file with only the header', () => {
    expect(() => checkMeterCsv(`${header}\n`, rooms, new Set())).toThrow('The file has no data rows.')
  })

  it('refuses a file over the row limit', () => {
    const body = Array.from({ length: METER_CSV_MAX_ROWS + 1 }, () => '101,2026-10,1,1').join('\n')
    expect(() => checkMeterCsv(`${header}\n${body}`, rooms, new Set())).toThrow('The file has more than 5,000 rows. Split it into smaller files.')
  })

  it('calls a blank unit number (blank) in the problem list', () => {
    const report = checkMeterCsv(`${header}\n,2026-10,1,1`, rooms, new Set())
    expect(report.errors).toEqual([{ line: 2, message: 'Unit (blank) does not exist' }])
  })
})

describe('small form rules', () => {
  it('rejects an unknown room type for new units (SSK-160)', () => {
    expect(validateBuildingLayout({ floors: 2, roomsPerFloor: 4, newRoomType: 'SUITE' as never })).toBe(
      'Room type for new units must be SINGLE or DOUBLE',
    )
  })

  it('asks for the first month when it is missing (SSK-165)', () => {
    expect(
      validateExtraCharge({ label: 'Parking', amount: 1, recurrence: 'MONTHLY', startMonth: undefined as never, endMonth: null, active: true }),
    ).toBe('Please choose the first month to charge (YYYY-MM)')
  })

  it('uses AP as the SKU prefix when the appliance has no category', () => {
    expect(nextApplianceSku('', ['AP-004', 'AP-x'])).toBe('AP-005')
  })

  it('keeps an unreadable send time as typed and sends at midnight for it', () => {
    expect(normalizeSendTime('soon')).toBe('soon')
    // 00:00 เวลาไทยของวันที่ 25 คือ 17:00 UTC ของวันที่ 24
    expect(billingSlotAt('2026-10', 25, 'soon')).toBe('2026-10-24T17:00:00.000Z')
  })
})

describe('chart axis and stock order', () => {
  it('still gives an axis ceiling for a value the steps cannot fit', () => {
    expect(niceCeiling(Number.NaN)).toBeNaN()
  })

  it('orders equally critical supplies by stock, then by name', () => {
    const a = { name: 'Bulb', stock: 2, minStock: 4 }
    const b = { name: 'Fuse', stock: 4, minStock: 8 }
    const c = { name: 'Apron', stock: 2, minStock: 4 }
    expect([a, b, c].sort(byMostCritical).map((s) => s.name)).toEqual(['Apron', 'Bulb', 'Fuse'])
  })
})

describe('supply usage lines', () => {
  it('adds to the matching line and leaves the other lines alone', () => {
    const supplies = [
      { id: 1, name: 'Bulb', stock: 10 },
      { id: 2, name: 'Fuse', stock: 10 },
    ] as Supply[]
    const draft = {
      lines: [
        { supplyId: 1, name: 'Bulb', quantity: 1 },
        { supplyId: 2, name: 'Fuse', quantity: 1 },
      ],
      supplyId: '2',
      quantity: '3',
    }
    const { draft: next, error } = addUsageLine(draft, supplies)
    expect(error).toBeNull()
    expect(next.lines).toEqual([
      { supplyId: 1, name: 'Bulb', quantity: 1 },
      { supplyId: 2, name: 'Fuse', quantity: 4 },
    ])
  })
})

describe('maintenance prediction (SSK-173)', () => {
  it('has low confidence when the repairs happened on the same day', () => {
    expect(confidenceOf([0, 0])).toBe('LOW')
  })

  it('lists rooms predicted for the same day by unit number', () => {
    const jobs = ['2026-01-01', '2026-02-01', '2026-03-01'].flatMap((date) => [
      { roomId: 2, roomNumber: '202', maintenanceType: 'HVAC', date },
      { roomId: 1, roomNumber: '101', maintenanceType: 'HVAC', date },
    ])
    expect(predictAll(jobs).map((p) => p.roomNumber)).toEqual(['101', '202'])
  })
})

describe('maintenance ticket patch', () => {
  const original: MaintenanceTask = {
    id: 1,
    roomId: 1,
    task: 'AC',
    detail: 'old',
    maintenanceType: 'HVAC',
    unit: '101',
    priority: 'Medium',
    assignTo: '',
    reportBy: '',
    date: '',
    status: 'Wait for Assign',
    billToTenant: true,
    amount: 300,
  }

  it('sends a new detail and a new billed amount only', () => {
    expect(ticketPatch({ ...original, detail: 'new', amount: 450 }, original)).toEqual({ detail: 'new', cost: 450 })
  })
})

describe('receipt print and PDF fallbacks', () => {
  it('prints a pending receipt as awaiting payment', () => {
    const write = vi.fn()
    vi.spyOn(window, 'open').mockReturnValue({ document: { write, close: vi.fn() } } as unknown as Window)

    printReceiptPdf({ ...SAMPLE_RECEIPT, status: 'Pending', paidDate: undefined })

    const html = write.mock.calls[0][0] as string
    expect(html).toContain('⚠ PENDING')
    expect(html).toContain('Awaiting Payment')
    expect(html).toContain('status-pending')
  })

  it('falls back to the text PDF when the canvas gives broken JPEG data', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,!!!')

    const text = await createReceiptPdfBlob(SAMPLE_RECEIPT).text()
    expect(text).toContain(SAMPLE_RECEIPT.receiptNo)
    expect(text).not.toContain('/DCTDecode')
  })

  it('fits a tall receipt image by page height', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,/9j/4AAQ')
    vi.spyOn(HTMLCanvasElement.prototype, 'width', 'get').mockReturnValue(100)
    vi.spyOn(HTMLCanvasElement.prototype, 'height', 'get').mockReturnValue(1000)

    const text = new TextDecoder('latin1').decode(new Uint8Array(await createReceiptPdfBlob(SAMPLE_RECEIPT).arrayBuffer()))
    const draw = text.match(/q\n([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/)
    expect(draw).not.toBeNull()
    // ใบเสร็จเว้นขอบบนล่างรวม 40pt ภาพสูงจึงสูงเต็มพื้นที่ 801.89 แล้วกว้างตามสัดส่วน 1:10
    expect(Number(draw![2])).toBeCloseTo(801.89, 1)
    expect(Number(draw![1])).toBeCloseTo(80.19, 1)
  })
})

describe('empty names', () => {
  it('asks for the supply and reminder name first', async () => {
    const { validateSupplyItem, validateReminder } = await import('./maintenanceBoard')
    expect(
      validateSupplyItem({ id: 1, name: '', sku: 'EL-001', category: 'Electrical', stock: 1, minStock: 0, maxStock: 5 }),
    ).toBe('Please enter the item name')
    expect(
      validateReminder({ id: 1, name: '', frequency: 'Monthly', startDate: '2026-09-01', unit: '', time: '09:00', priority: 'Medium', notes: '', active: true }),
    ).toBe('Please enter the reminder name')
  })

  it('asks which supply was used before checking the quantity', async () => {
    const { usageError } = await import('./supplyUsage')
    expect(usageError('', '2', [], 0)).toBe('Please choose the item')
  })
})
