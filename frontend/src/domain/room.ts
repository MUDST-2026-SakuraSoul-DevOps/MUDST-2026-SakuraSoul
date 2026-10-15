import type { RoomType } from '../api/types'

/**
 * ป้ายของห้องที่ไม่ผูกกับหน้าจอ ใช้ร่วมกันหลายหน้าและในเอกสารสัญญา
 *
 * เดิมไฟล์นี้มี validateRoom ของฟอร์ม Add Unit ด้วย แต่ทีมถอดฟอร์มนั้นไปแล้ว
 * และ backend ไม่มี POST /api/rooms จึงถอดกฎชุดนั้นออก (SSK-140)
 * ถ้าจะเอาฟอร์มกลับมา ต้องเพิ่มใน docs/api-contract-lease.md ก่อนแล้วทำพร้อมกันทั้งสองฝั่ง
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

/** ค่าที่ backend ยังไม่ส่งมาให้ก็ยังต้องมีอะไรโชว์ ไม่ใช่ปล่อยช่องว่าง */
export function roomTypeLabel(type: RoomType | null | undefined): string {
  return type ? ROOM_TYPE_LABEL[type] : '-'
}
