import { describe, expect, it } from 'vitest'
import type { MaintenanceTicket } from '../api/types'
import { maintenanceCsvFilename, toMaintenanceCsv } from './maintenanceExport'

/**
 * The most fragile part of export is not the button, but text escaping. If a
 * maintenance detail contains a comma and is not escaped, the CSV columns drift
 * silently until someone opens the file. These tests focus on special text cases.
 */

function ticket(overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket {
  return {
    id: 1,
    roomId: 6,
    roomNumber: '106',
    title: 'AC compressor replacement',
    detail: 'Air conditioner not cooling',
    status: 'IN_PROGRESS',
    reportedAt: '2026-09-01',
    ...overrides,
  }
}

describe('toMaintenanceCsv', () => {
  it('writes the header as the first row', () => {
    const csv = toMaintenanceCsv([ticket()]) ?? ''
    const firstLine = csv.replace('﻿', '').split('\r\n')[0]
    expect(firstLine).toBe('Unit,Issue,Details,Status,Reported')
  })

  it('formats status labels instead of writing raw API values', () => {
    const csv = toMaintenanceCsv([ticket({ status: 'OPEN' })]) ?? ''
    expect(csv).toContain('Open')
    expect(csv).not.toContain('OPEN')
  })

  it('writes one row per ticket', () => {
    const csv = toMaintenanceCsv([ticket({ id: 1 }), ticket({ id: 2 }), ticket({ id: 3 })]) ?? ''
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(4)
  })

  it('starts with a BOM so Windows Excel reads text correctly', () => {
    const csv = toMaintenanceCsv([ticket()]) ?? ''
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('quotes text that contains commas', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'AC cleaning, filter swap' })]) ?? ''
    expect(csv).toContain('"AC cleaning, filter swap"')
  })

  it('escapes quotes by doubling them', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'Tech said "waiting on parts"' })]) ?? ''
    expect(csv).toContain('"Tech said ""waiting on parts"""')
  })

  it('keeps multiline text inside one CSV row', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'Day one\nDay two' })]) ?? ''
    // Quoting keeps the newline inside the same field.
    expect(csv).toContain('"Day one\nDay two"')
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(2)
  })

  it('writes null details as an empty field instead of the word null', () => {
    const csv = toMaintenanceCsv([ticket({ detail: null })]) ?? ''
    expect(csv).not.toContain('null')
  })

  // US-18-S3
  it('returns null for empty input to avoid creating blank files', () => {
    expect(toMaintenanceCsv([])).toBeNull()
  })
})

describe('maintenanceCsvFilename', () => {
  it('includes the date so repeated exports do not overwrite each other', () => {
    expect(maintenanceCsvFilename(new Date('2026-09-06T10:00:00Z'))).toBe(
      'maintenance-log-2026-09-06.csv',
    )
  })

  /**
   * QA pointed out that the old timezone test missed the bug because 10:00Z
   * lands on the same date in both UTC and Bangkok. This case uses 18:00Z,
   * where the two zones differ, so reverting to toISOString will fail.
   */
  it('uses the Bangkok date for exports created at 1 AM local time', () => {
    // 2026-09-06T18:00:00Z is 2026-09-07 01:00 in Bangkok.
    expect(maintenanceCsvFilename(new Date('2026-09-06T18:00:00Z'))).toBe(
      'maintenance-log-2026-09-07.csv',
    )
  })
})

/**
 * QA found that Excel interprets fields starting with = + - @ as formulas
 * instead of text. Real maintenance reports can begin this way, such as
 * "-AC broken", which Excel would otherwise display as #NAME?.
 */
describe('Excel formula injection protection', () => {
  function cellsOf(csv: string): string[] {
    return csv.replace('\ufeff', '').split('\r\n')[1].split(',')
  }

  it('prefixes text that starts with a hyphen with an apostrophe', () => {
    const csv = toMaintenanceCsv([ticket({ title: '-AC broken' })])
    expect(csv).not.toBeNull()
    expect(cellsOf(csv as string)[1]).toBe("'-AC broken")
  })

  it('also protects text that starts with equals', () => {
    const csv = toMaintenanceCsv([ticket({ title: '=Bathroom leaking' })])
    expect(cellsOf(csv as string)[1]).toBe("'=Bathroom leaking")
  })

  it('also protects text that starts with plus or at-sign', () => {
    expect(cellsOf(toMaintenanceCsv([ticket({ title: '+Extra work' })]) as string)[1]).toBe(
      "'+Extra work",
    )
    expect(cellsOf(toMaintenanceCsv([ticket({ title: '@Outside tech' })]) as string)[1]).toBe(
      "'@Outside tech",
    )
  })

  it('leaves normal text unchanged', () => {
    const csv = toMaintenanceCsv([ticket({ title: 'Air conditioner not cooling' })])
    expect(cellsOf(csv as string)[1]).toBe('Air conditioner not cooling')
  })

  it('protects and quotes text that starts with a hyphen and contains a comma', () => {
    const csv = toMaintenanceCsv([ticket({ title: '-AC broken, room is hot' })])
    const line = (csv as string).replace('\ufeff', '').split('\r\n')[1]
    expect(line).toContain('"\'-AC broken, room is hot"')
  })
})
