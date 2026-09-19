import type { MaintenanceTicket, MaintenanceStatus } from '../api/types'
import { todayInBangkok } from '../format'

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

const HEADERS = ['Unit', 'Issue', 'Details', 'Status', 'Reported'] as const

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}

/**
 * Excel บน Windows เดาว่าไฟล์เป็น TIS-620 ถ้าไม่มี BOM ทำให้ภาษาไทยกลายเป็น
 * ตัวขยะทั้งไฟล์ ใส่ BOM นำหน้าแล้วมันจะอ่านเป็น UTF-8 ถูกต้อง
 */
const BOM = '﻿'

/**
 * Excel ตีความช่องที่ขึ้นต้นด้วย = + - @ ว่าเป็นสูตร ไม่ใช่ข้อความ
 *
 * เรื่องที่แอดมินแจ้งเข้ามาจริงขึ้นต้นแบบนี้ได้ เช่น "-แอร์เสีย" พอเปิดไฟล์ใน
 * Excel จะเห็น #NAME? แทนข้อความที่พิมพ์ไว้ เติมเครื่องหมายคำพูดเดี่ยวนำหน้า
 * เพื่อบังคับให้อ่านเป็นข้อความ ซึ่งเป็นวิธีที่ QA เสนอมาตอนรีวิว
 *
 * ต้องทำก่อนครอบด้วยเครื่องหมายคำพูดของ RFC 4180 เพราะเครื่องหมายเดี่ยวนี้เป็น
 * ส่วนหนึ่งของเนื้อช่อง ไม่ใช่ตัวคั่นของไฟล์
 */
const FORMULA_START = /^[=+\-@]/

/** ใส่เครื่องหมายคำพูดครอบเฉพาะช่องที่มีตัวคั่น ตามกฎของ RFC 4180 */
function escapeCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
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

/**
 * ชื่อไฟล์มีวันที่กำกับ เพราะแอดมิน export ซ้ำหลายรอบแล้วไฟล์จะทับกันเอง
 *
 * วันที่ต้องเป็นวันตามเวลาไทย ไม่ใช่ UTC ไม่งั้น export ช่วงตีหนึ่งถึงเกือบ
 * เจ็ดโมงเช้าจะได้ชื่อไฟล์เป็นเมื่อวาน แล้วไฟล์ของสองวันจะชนกันเอง
 */
export function maintenanceCsvFilename(today = new Date()): string {
  return `maintenance-log-${todayInBangkok(today)}.csv`
}
