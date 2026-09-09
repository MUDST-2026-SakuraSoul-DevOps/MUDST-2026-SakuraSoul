import { describe, expect, it } from 'vitest'
import type { MaintenanceTicket } from '../api/types'
import { maintenanceCsvFilename, toMaintenanceCsv } from './maintenanceExport'

/**
 * Unit tests for SSK-24 / Export Maintenance Log.
 *
 * The riskiest part of CSV export is not the button click itself, but escaping
 * text safely. If maintenance details contain commas, quotes, or line breaks,
 * the exported CSV can silently shift columns until somebody opens the file.
 * These tests focus on those high-risk text cases.
 */

function ticket(overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket {
  return {
    id: 1,
    roomId: 6,
    roomNumber: '106',
    title: 'เปลี่ยนคอมเพรสเซอร์แอร์',
    detail: 'แอร์ไม่เย็น',
    status: 'IN_PROGRESS',
    reportedAt: '2026-09-01',
    ...overrides,
  }
}

describe('toMaintenanceCsv', () => {
  it('writes the CSV header as the first row', () => {
    const csv = toMaintenanceCsv([ticket()]) ?? ''
    const firstLine = csv.replace('﻿', '').split('\r\n')[0]
    expect(firstLine).toBe('เลขห้อง,เรื่องที่แจ้ง,รายละเอียด,สถานะ,วันที่แจ้ง')
  })

  it('maps raw API statuses to readable Thai labels', () => {
    const csv = toMaintenanceCsv([ticket({ status: 'OPEN' })]) ?? ''
    expect(csv).toContain('รอดำเนินการ')
    expect(csv).not.toContain('OPEN')
  })

  it('writes one CSV row per maintenance ticket', () => {
    const csv = toMaintenanceCsv([ticket({ id: 1 }), ticket({ id: 2 }), ticket({ id: 3 })]) ?? ''
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(4)
  })

  it('starts with a BOM so Windows Excel opens Thai text correctly', () => {
    const csv = toMaintenanceCsv([ticket()]) ?? ''
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('wraps text containing commas in double quotes', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'ล้างแอร์, เปลี่ยนฟิลเตอร์' })]) ?? ''
    expect(csv).toContain('"ล้างแอร์, เปลี่ยนฟิลเตอร์"')
  })

  it('escapes double quotes by doubling them', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'ช่างบอกว่า "รออะไหล่"' })]) ?? ''
    expect(csv).toContain('"ช่างบอกว่า ""รออะไหล่"""')
  })

  it('keeps line breaks inside a single escaped CSV cell', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'วันแรก\nวันที่สอง' })]) ?? ''
    // The newline stays inside one field because the value is wrapped in quotes.
    expect(csv).toContain('"วันแรก\nวันที่สอง"')
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(2)
  })

  it('exports null detail as an empty cell instead of the word null', () => {
    const csv = toMaintenanceCsv([ticket({ detail: null })]) ?? ''
    expect(csv).not.toContain('null')
  })

  // US-18-S3
  it('returns null for an empty ticket list so the app does not create an empty file', () => {
    expect(toMaintenanceCsv([])).toBeNull()
  })
})

describe('maintenanceCsvFilename', () => {
  it('includes the export date in the filename to avoid overwriting repeated exports', () => {
    expect(maintenanceCsvFilename(new Date('2026-09-06T10:00:00Z'))).toBe(
      'maintenance-log-2026-09-06.csv',
    )
  })

  /**
   * This catches timezone regressions. 18:00Z is already the next day in
   * Thailand, so this test fails if the filename falls back to UTC formatting.
   */
  it('uses the Bangkok date instead of the UTC date for early-morning exports', () => {
    // 2026-09-06T18:00:00Z is 2026-09-07 01:00 in Bangkok.
    expect(maintenanceCsvFilename(new Date('2026-09-06T18:00:00Z'))).toBe(
      'maintenance-log-2026-09-07.csv',
    )
  })
})

/**
 * Spreadsheet apps can treat cells starting with =, +, -, or @ as formulas.
 * Maintenance titles can naturally start with those characters, so the export
 * must force them to stay as text.
 */
describe('CSV formula injection protection', () => {
  function cellsOf(csv: string): string[] {
    return csv.replace('\ufeff', '').split('\r\n')[1].split(',')
  }

  it('prefixes text starting with a minus sign with a single quote', () => {
    const csv = toMaintenanceCsv([ticket({ title: '-แอร์เสีย' })])
    expect(csv).not.toBeNull()
    expect(cellsOf(csv as string)[1]).toBe("'-แอร์เสีย")
  })

  it('prefixes text starting with an equals sign with a single quote', () => {
    const csv = toMaintenanceCsv([ticket({ title: '=ห้องน้ำรั่ว' })])
    expect(cellsOf(csv as string)[1]).toBe("'=ห้องน้ำรั่ว")
  })

  it('prefixes text starting with plus and at signs with a single quote', () => {
    expect(cellsOf(toMaintenanceCsv([ticket({ title: '+เพิ่มงาน' })]) as string)[1]).toBe(
      "'+เพิ่มงาน",
    )
    expect(cellsOf(toMaintenanceCsv([ticket({ title: '@ช่างนอก' })]) as string)[1]).toBe(
      "'@ช่างนอก",
    )
  })

  it('does not modify normal text values', () => {
    const csv = toMaintenanceCsv([ticket({ title: 'แอร์ไม่เย็น' })])
    expect(cellsOf(csv as string)[1]).toBe('แอร์ไม่เย็น')
  })

  it('applies both formula protection and comma escaping to risky text', () => {
    const csv = toMaintenanceCsv([ticket({ title: '-แอร์เสีย, ห้องร้อน' })])
    const line = (csv as string).replace('\ufeff', '').split('\r\n')[1]
    expect(line).toContain('"\'-แอร์เสีย, ห้องร้อน"')
  })
})
