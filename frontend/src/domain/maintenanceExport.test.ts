import { describe, expect, it } from 'vitest'
import type { MaintenanceTicket } from '../api/types'
import { maintenanceCsvFilename, toMaintenanceCsv } from './maintenanceExport'

/**
 * ส่วนที่พังง่ายที่สุดของการ export ไม่ใช่ปุ่ม แต่เป็นการ escape ข้อความ
 * ถ้ารายละเอียดงานซ่อมมีคอมมาแล้วไม่ escape ไฟล์จะเพี้ยนทั้งคอลัมน์โดยไม่มีใครรู้
 * จนกว่าจะเปิดดู เทสชุดนี้จึงเน้นเคสตัวอักษรพิเศษเป็นหลัก
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
  it('มีหัวตารางเป็นบรรทัดแรก', () => {
    const csv = toMaintenanceCsv([ticket()]) ?? ''
    const firstLine = csv.replace('﻿', '').split('\r\n')[0]
    expect(firstLine).toBe('Unit,Issue,Details,Status,Reported')
  })

  it('แปลงสถานะเป็นภาษาไทย ไม่ใช่ค่าดิบจาก API', () => {
    const csv = toMaintenanceCsv([ticket({ status: 'OPEN' })]) ?? ''
    expect(csv).toContain('Open')
    expect(csv).not.toContain('OPEN')
  })

  it('หนึ่งรายการหนึ่งบรรทัด', () => {
    const csv = toMaintenanceCsv([ticket({ id: 1 }), ticket({ id: 2 }), ticket({ id: 3 })]) ?? ''
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(4)
  })

  it('ขึ้นต้นด้วย BOM ไม่งั้น Excel บน Windows อ่านภาษาไทยเป็นตัวขยะ', () => {
    const csv = toMaintenanceCsv([ticket()]) ?? ''
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('ข้อความที่มีคอมมาต้องถูกครอบด้วยเครื่องหมายคำพูด', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'AC cleaning, filter swap' })]) ?? ''
    expect(csv).toContain('"AC cleaning, filter swap"')
  })

  it('เครื่องหมายคำพูดในข้อความต้องถูกซ้ำเป็นสองตัว', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'Tech said "waiting on parts"' })]) ?? ''
    expect(csv).toContain('"Tech said ""waiting on parts"""')
  })

  it('ข้อความที่ขึ้นบรรทัดใหม่ต้องไม่ทำให้ไฟล์มีบรรทัดเกิน', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'Day one\nDay two' })]) ?? ''
    // ครอบด้วยเครื่องหมายคำพูดแล้ว ตัวขึ้นบรรทัดใหม่จึงอยู่ในช่องเดียวกัน
    expect(csv).toContain('"Day one\nDay two"')
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(2)
  })

  it('รายละเอียดที่เป็น null ออกมาเป็นช่องว่าง ไม่ใช่คำว่า null', () => {
    const csv = toMaintenanceCsv([ticket({ detail: null })]) ?? ''
    expect(csv).not.toContain('null')
  })

  // US-18-S3
  it('ไม่มีรายการเลย ต้องคืน null เพื่อไม่ให้สร้างไฟล์เปล่า', () => {
    expect(toMaintenanceCsv([])).toBeNull()
  })
})

describe('maintenanceCsvFilename', () => {
  it('มีวันที่กำกับ เพราะ export ซ้ำหลายรอบแล้วไฟล์จะทับกันเอง', () => {
    expect(maintenanceCsvFilename(new Date('2026-09-06T10:00:00Z'))).toBe(
      'maintenance-log-2026-09-06.csv',
    )
  })

  /**
   * QA ชี้ว่าเทสเดิมจับบั๊ก timezone ไม่ได้ เพราะเลือกเวลา 10:00Z ซึ่งตกวัน
   * เดียวกันทั้ง UTC และไทย เคสนี้จึงใช้ 18:00Z ที่สองโซนคนละวันกัน ถ้าโค้ด
   * กลับไปใช้ toISOString เมื่อไหร่ เคสนี้จะแดงทันที
   */
  it('export ตอนตีหนึ่งตามเวลาไทย ต้องได้ชื่อไฟล์เป็นวันนี้ ไม่ใช่เมื่อวาน', () => {
    // 2026-09-06T18:00:00Z ตรงกับ 2026-09-07 01:00 ตามเวลาไทย
    expect(maintenanceCsvFilename(new Date('2026-09-06T18:00:00Z'))).toBe(
      'maintenance-log-2026-09-07.csv',
    )
  })
})

/**
 * QA เจอว่า Excel ตีความช่องที่ขึ้นต้นด้วย = + - @ ว่าเป็นสูตร ไม่ใช่ข้อความ
 * เรื่องที่แอดมินแจ้งเข้ามาจริงขึ้นต้นแบบนี้ได้ เช่น "-AC broken" แล้วพอเปิดใน
 * Excel จะเห็น #NAME? แทนข้อความที่พิมพ์ไว้
 */
describe('กัน Excel ตีความข้อความเป็นสูตร', () => {
  function cellsOf(csv: string): string[] {
    return csv.replace('\ufeff', '').split('\r\n')[1].split(',')
  }

  it('ข้อความขึ้นต้นด้วยขีดกลางถูกเติมเครื่องหมายคำพูดเดี่ยวนำหน้า', () => {
    const csv = toMaintenanceCsv([ticket({ title: '-AC broken' })])
    expect(csv).not.toBeNull()
    expect(cellsOf(csv as string)[1]).toBe("'-AC broken")
  })

  it('ขึ้นต้นด้วยเท่ากับก็เหมือนกัน', () => {
    const csv = toMaintenanceCsv([ticket({ title: '=Bathroom leaking' })])
    expect(cellsOf(csv as string)[1]).toBe("'=Bathroom leaking")
  })

  it('ขึ้นต้นด้วยบวกและแอทก็เหมือนกัน', () => {
    expect(cellsOf(toMaintenanceCsv([ticket({ title: '+Extra work' })]) as string)[1]).toBe(
      "'+Extra work",
    )
    expect(cellsOf(toMaintenanceCsv([ticket({ title: '@Outside tech' })]) as string)[1]).toBe(
      "'@Outside tech",
    )
  })

  it('ข้อความปกติไม่ถูกแตะ', () => {
    const csv = toMaintenanceCsv([ticket({ title: 'Air conditioner not cooling' })])
    expect(cellsOf(csv as string)[1]).toBe('Air conditioner not cooling')
  })

  it('ขึ้นต้นด้วยขีดกลางและมีคอมมาด้วย ต้องได้ทั้งเครื่องหมายเดี่ยวและการครอบ', () => {
    const csv = toMaintenanceCsv([ticket({ title: '-AC broken, room is hot' })])
    const line = (csv as string).replace('\ufeff', '').split('\r\n')[1]
    expect(line).toContain('"\'-AC broken, room is hot"')
  })
})
