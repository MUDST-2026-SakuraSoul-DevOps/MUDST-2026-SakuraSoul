import type { MaintenanceTicket, MaintenanceStatus } from '../api/types'

/**
 * แปลงประวัติงานซ่อมเป็นไฟล์ CSV ตาม US-18
 *
 * แยกออกมาเป็น pure function เพราะส่วนที่พังง่ายที่สุดของการ export ไม่ใช่ปุ่ม
 * แต่เป็นการ escape ข้อความ ถ้ารายละเอียดงานซ่อมมีคอมมาหรือขึ้นบรรทัดใหม่แล้ว
 * ไม่ escape ไฟล์จะเพี้ยนทั้งคอลัมน์โดยไม่มีใครรู้จนกว่าจะเปิดดู
 *
 * เลือก CSV ไม่ใช่ PDF เพราะ story บอกว่าเอาไปทำรายงานต่อ ซึ่งแปลว่าต้องเปิดใน
 * Excel แล้วแก้ได้ ส่วน PDF เป็นของ epic เอกสาร (CR-04) คนละเรื่องกัน
 */

const HEADERS = ['เลขห้อง', 'เรื่องที่แจ้ง', 'รายละเอียด', 'สถานะ', 'วันที่แจ้ง'] as const

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังซ่อม',
  DONE: 'ซ่อมเสร็จแล้ว',
}

/**
 * Excel บน Windows เดาว่าไฟล์เป็น TIS-620 ถ้าไม่มี BOM ทำให้ภาษาไทยกลายเป็น
 * ตัวขยะทั้งไฟล์ ใส่ BOM นำหน้าแล้วมันจะอ่านเป็น UTF-8 ถูกต้อง
 */
const BOM = '﻿'

/** ใส่เครื่องหมายคำพูดครอบเฉพาะช่องที่มีตัวคั่น ตามกฎของ RFC 4180 */
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toRow(ticket: MaintenanceTicket): string {
  return [
    ticket.roomNumber,
    ticket.title,
    ticket.detail ?? '',
    STATUS_LABEL[ticket.status],
    ticket.reportedAt,
  ]
    .map(escapeCell)
    .join(',')
}

/**
 * คืน null เมื่อไม่มีรายการเลย ตาม US-18-S3 ที่ระบุว่าห้ามสร้างไฟล์เปล่า
 * ให้ฝั่งที่เรียกเอาไปแจ้งผู้ใช้แทน
 */
export function toMaintenanceCsv(tickets: MaintenanceTicket[]): string | null {
  if (tickets.length === 0) {
    return null
  }
  return BOM + [HEADERS.join(','), ...tickets.map(toRow)].join('\r\n')
}

/** ชื่อไฟล์มีวันที่กำกับ เพราะแอดมิน export ซ้ำหลายรอบแล้วไฟล์จะทับกันเอง */
export function maintenanceCsvFilename(today = new Date()): string {
  return `maintenance-log-${today.toISOString().slice(0, 10)}.csv`
}
