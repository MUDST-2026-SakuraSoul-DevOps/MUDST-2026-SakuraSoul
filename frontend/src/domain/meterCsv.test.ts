import { describe, expect, it } from 'vitest'
import { METER_CSV_MAX_ROWS, checkMeterCsv, readCsv } from './meterCsv'

const ROOMS = new Set(['101', '102', '201'])
const HEADER = 'room_number,month,electric_units,water_units'

describe('readCsv', () => {
  it('strips a BOM, keeps quoted commas, and skips blank lines', () => {
    const text = '﻿' + 'a,b\r\n\r\n"x, y","say ""hi"""\n'
    expect(readCsv(text)).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 3, cells: ['x, y', 'say "hi"'] },
    ])
  })

  it('throws on an unclosed quote', () => {
    expect(() => readCsv('a,"b\n')).toThrow(/quote/)
  })
})

describe('checkMeterCsv', () => {
  it('accepts decimals and trims spaces around unit numbers', () => {
    const report = checkMeterCsv(`${HEADER}\n 101 ,2026-11,142.5,12\n102,2026-11,98,9.5\n`, ROOMS, new Set())
    expect(report.errors).toEqual([])
    expect(report.rows).toEqual([
      { line: 2, roomNumber: '101', month: '2026-11', electricUnits: 142.5, waterUnits: 12, alreadyExists: false },
      { line: 3, roomNumber: '102', month: '2026-11', electricUnits: 98, waterUnits: 9.5, alreadyExists: false },
    ])
  })

  // AC 2: each bad row reports its line number and reason
  it('reports every bad row with its line and reason', () => {
    const text = [HEADER, '999,2026-11,1,1', '101,11/2026,1,1', '102,2026-11,-5,1', '201,2026-11,1,1', '201,2026-11,2,2'].join('\n')
    const report = checkMeterCsv(text, ROOMS, new Set())
    expect(report.rows.map((r) => r.line)).toEqual([5])
    expect(report.errors).toEqual([
      { line: 2, message: 'Unit 999 does not exist' },
      { line: 3, message: 'Month "11/2026" must be YYYY-MM' },
      { line: 4, message: 'Units must be numbers that are zero or more' },
      { line: 6, message: 'Unit 201 for 2026-11 appears more than once in the file' },
    ])
  })

  it('marks rows that already have a reading', () => {
    const report = checkMeterCsv(`${HEADER}\n101,2026-11,1,1\n`, ROOMS, new Set(['101|2026-11']))
    expect(report.rows[0].alreadyExists).toBe(true)
  })

  // AC 3: a wrong header or a file that is not CSV is refused with a readable message
  it.each(['room,month,kwh,m3\n101,2026-11,1,1', 'just some text', ''])('rejects %j', (text) => {
    expect(() => checkMeterCsv(text, ROOMS, new Set())).toThrow(/header|no data/)
  })

  it('refuses a file that has the header but no rows', () => {
    expect(() => checkMeterCsv(`${HEADER}\n`, ROOMS, new Set())).toThrow('The file has no data rows.')
  })

  // นับแถวก่อนตรวจทีละแถว ไฟล์ใหญ่เกินจึงถูกปฏิเสธทั้งไฟล์ ไม่ใช่ตรวจไปห้าพันกว่าแถวแล้วค่อยบอก
  it('refuses a file with more rows than the limit, and accepts exactly the limit', () => {
    const rows = (count: number) => [HEADER, ...Array.from({ length: count }, () => '101,2026-11,1,1')].join('\n')
    expect(() => checkMeterCsv(rows(METER_CSV_MAX_ROWS + 1), ROOMS, new Set())).toThrow(
      'The file has more than 5,000 rows. Split it into smaller files.',
    )
    // พอดีเพดานยังตรวจครบทุกแถว: แถวแรกผ่าน ที่เหลือซ้ำห้องกับเดือนเดียวกัน
    const atLimit = checkMeterCsv(rows(METER_CSV_MAX_ROWS), ROOMS, new Set())
    expect(atLimit.rows).toHaveLength(1)
    expect(atLimit.errors).toHaveLength(METER_CSV_MAX_ROWS - 1)
  })

  it('names a blank unit cell as blank instead of an empty unit number', () => {
    expect(checkMeterCsv(`${HEADER}\n ,2026-11,1,1\n`, ROOMS, new Set()).errors).toEqual([
      { line: 2, message: 'Unit (blank) does not exist' },
    ])
  })

  it('handles a Thai unit label only when such a unit exists', () => {
    const thai = new Set(['ห้อง 1'])
    expect(checkMeterCsv(`${HEADER}\nห้อง 1 ,2026-11,1,1\n`, thai, new Set()).rows).toHaveLength(1)
  })
})
