import type { CreateRoomRequest, RoomType } from '../api/types'

/**
 * กฎของห้องที่ไม่ผูกกับหน้าจอ แยกออกมาเพื่อให้เทสได้โดยไม่ต้องเรนเดอร์ฟอร์ม
 * และให้ mock กับหน้าเว็บใช้กฎชุดเดียวกัน ไม่ต้องเขียนเงื่อนไขซ้ำสองที่
 */

/**
 * ข้อความที่โชว์ในคอลัมน์ TYPE ตามที่เขียนไว้ในเฟรม Unit Page และ Tenant
 * Directory ของ Figma เก็บเป็น map แทนการ format ชื่อ enum เอง เพราะดีไซน์
 * เขียนว่า "Single Bedroom" ไม่ใช่ "Single"
 */
export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  SINGLE: 'Single Bedroom',
  DOUBLE: 'Double Bedroom',
}

export const ROOM_TYPES = Object.keys(ROOM_TYPE_LABEL) as RoomType[]

/** ค่าที่ backend ยังไม่ส่งมาให้ก็ยังต้องมีอะไรโชว์ ไม่ใช่ปล่อยช่องว่าง */
export function roomTypeLabel(type: RoomType | null | undefined): string {
  return type ? ROOM_TYPE_LABEL[type] : '-'
}

/** เลขห้องสามหลักแบบเดียวกับที่ใช้ในงานซ่อม ทั้งตึกใช้เลข 101 ถึง 212 */
const ROOM_NUMBER = /^\d{3}$/

/** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อกรอกถูกครบ */
export function validateRoom(room: CreateRoomRequest): string | null {
  if (room.roomNumber.trim() === '') {
    return 'Please enter the unit number'
  }
  if (!ROOM_NUMBER.test(room.roomNumber.trim())) {
    return 'The unit number must be three digits, for example 101'
  }
  if (!Number.isFinite(room.floor)) {
    return 'Please enter the floor'
  }
  if (!Number.isInteger(room.floor) || room.floor < 1) {
    return 'The floor must be a whole number of 1 or more'
  }
  return null
}
