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
    title: 'เปลี่ยนคอมเพรสเซอร์แอร์',
    detail: 'แอร์ไม่เย็น',
    status: 'IN_PROGRESS',
    reportedAt: '2026-09-01',
    ...overrides,
  }
}

describe('toMaintenanceCsv', () => {
  it('มีหัวตารางเป็นบรรทัดแรก', () => {
    const csv = toMaintenanceCsv([ticket()]) ?? ''
    const firstLine = csv.replace('﻿', '').split('\r\n')[0]
    expect(firstLine).toBe('เลขห้อง,เรื่องที่แจ้ง,รายละเอียด,สถานะ,วันที่แจ้ง')
  })

  it('แปลงสถานะเป็นภาษาไทย ไม่ใช่ค่าดิบจาก API', () => {
    const csv = toMaintenanceCsv([ticket({ status: 'OPEN' })]) ?? ''
    expect(csv).toContain('รอดำเนินการ')
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
    const csv = toMaintenanceCsv([ticket({ detail: 'ล้างแอร์, เปลี่ยนฟิลเตอร์' })]) ?? ''
    expect(csv).toContain('"ล้างแอร์, เปลี่ยนฟิลเตอร์"')
  })

  it('เครื่องหมายคำพูดในข้อความต้องถูกซ้ำเป็นสองตัว', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'ช่างบอกว่า "รออะไหล่"' })]) ?? ''
    expect(csv).toContain('"ช่างบอกว่า ""รออะไหล่"""')
  })

  it('ข้อความที่ขึ้นบรรทัดใหม่ต้องไม่ทำให้ไฟล์มีบรรทัดเกิน', () => {
    const csv = toMaintenanceCsv([ticket({ detail: 'วันแรก\nวันที่สอง' })]) ?? ''
    // ครอบด้วยเครื่องหมายคำพูดแล้ว ตัวขึ้นบรรทัดใหม่จึงอยู่ในช่องเดียวกัน
    expect(csv).toContain('"วันแรก\nวันที่สอง"')
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
})
