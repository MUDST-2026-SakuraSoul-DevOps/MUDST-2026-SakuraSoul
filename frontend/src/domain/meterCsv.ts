import type { MeterImportReport, MeterImportRow } from '../api/types'
import { MONTH_PATTERN } from './roomRate'

/**
 * นำเข้าค่าน้ำค่าไฟจากไฟล์ CSV (SSK-166)
 *
 * รูปแบบไฟล์ตามการ์ด: หัวตาราง room_number,month,electric_units,water_units แถวละหนึ่งห้องต่อหนึ่งเดือน
 * UTF-8 (มี BOM ได้) คั่นด้วยจุลภาค จุดทศนิยม เดือนเป็น YYYY-MM หน่วยเป็นตัวเลขไม่ติดลบ
 * หน่วยไฟเป็น kWh หน่วยน้ำเป็น m³ ตามที่ใบเสร็จใช้ และเป็นยอดใช้ของเดือนนั้น ไม่ใช่เลขมิเตอร์สะสม
 *
 * backend จริงอ่านด้วยไลบรารี (commons-csv) ตัวนี้ใช้ใน backend จำลองกับเทส กฎทุกข้อต้องตรงกัน
 */

export const METER_CSV_HEADER = ['room_number', 'month', 'electric_units', 'water_units'] as const
export const METER_CSV_TEMPLATE =
  'room_number,month,electric_units,water_units\n101,2026-11,142.5,12\n102,2026-11,98,9.5\n'
/** ขีดจำกัดที่ตกลงไว้ในการ์ด ไฟล์ใหญ่กว่านี้หน้าเว็บไม่ส่งเลย */
export const METER_CSV_MAX_BYTES = 1_000_000
export const METER_CSV_MAX_ROWS = 5_000

/** แยกบรรทัดและช่องแบบ RFC 4180 รองรับเครื่องหมายคำพูด จุลภาคในคำพูด และบรรทัดว่าง */
export function readCsv(text: string): { line: number; cells: string[] }[] {
  const source = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n')
  const records: { line: number; cells: string[] }[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let recordLine = 1
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (c === '"') {
        quoted = false
      } else {
        if (c === '\n') line += 1
        cell += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      cells.push(cell)
      cell = ''
    } else if (c === '\n') {
      cells.push(cell)
      if (cells.some((v) => v.trim() !== '')) records.push({ line: recordLine, cells })
      cells = []
      cell = ''
      line += 1
      recordLine = line
    } else {
      cell += c
    }
  }
  if (quoted) {
    throw new Error('The file has a quote that is never closed. Check the file and try again.')
  }
  cells.push(cell)
  if (cells.some((v) => v.trim() !== '')) records.push({ line: recordLine, cells })
  return records
}

const NUMBER = /^\d+(\.\d+)?$/

/**
 * ตรวจไฟล์ทั้งไฟล์ ได้รายงานแบบเดียวกับ dry-run ของ server
 * ข้อผิดพลาดระดับไฟล์ (หัวตารางผิด ไฟล์ว่าง ยาวเกิน) โยน Error ส่วนข้อผิดพลาดรายแถวอยู่ใน errors
 */
export function checkMeterCsv(
  text: string,
  roomNumbers: ReadonlySet<string>,
  existing: ReadonlySet<string>,
): Pick<MeterImportReport, 'rows' | 'errors'> {
  const records = readCsv(text)
  const header = records.shift()
  if (!header || header.cells.map((h) => h.trim().toLowerCase()).join(',') !== METER_CSV_HEADER.join(',')) {
    throw new Error(`The first line must be the header ${METER_CSV_HEADER.join(',')}. Download the template to see the format.`)
  }
  if (records.length === 0) {
    throw new Error('The file has no data rows.')
  }
  if (records.length > METER_CSV_MAX_ROWS) {
    throw new Error(`The file has more than ${METER_CSV_MAX_ROWS.toLocaleString('en-US')} rows. Split it into smaller files.`)
  }

  const rows: MeterImportRow[] = []
  const errors: MeterImportReport['errors'] = []
  const seen = new Set<string>()
  for (const { line, cells } of records) {
    if (cells.length !== METER_CSV_HEADER.length) {
      errors.push({ line, message: `Expected ${METER_CSV_HEADER.length} columns but found ${cells.length}` })
      continue
    }
    const [roomNumber, month, electricRaw, waterRaw] = cells.map((v) => v.trim())
    if (!roomNumbers.has(roomNumber)) {
      errors.push({ line, message: `Unit ${roomNumber || '(blank)'} does not exist` })
      continue
    }
    if (!MONTH_PATTERN.test(month)) {
      errors.push({ line, message: `Month "${month}" must be YYYY-MM` })
      continue
    }
    if (!NUMBER.test(electricRaw) || !NUMBER.test(waterRaw)) {
      errors.push({ line, message: 'Units must be numbers that are zero or more' })
      continue
    }
    const key = `${roomNumber}|${month}`
    if (seen.has(key)) {
      errors.push({ line, message: `Unit ${roomNumber} for ${month} appears more than once in the file` })
      continue
    }
    seen.add(key)
    rows.push({
      line,
      roomNumber,
      month,
      electricUnits: Number(electricRaw),
      waterUnits: Number(waterRaw),
      alreadyExists: existing.has(key),
    })
  }
  return { rows, errors }
}

export function meterKey(roomNumber: string, month: string): string {
  return `${roomNumber}|${month}`
}
