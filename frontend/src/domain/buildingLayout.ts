import type { BuildingConfigRequest, RoomType } from '../api/types'

/**
 * กฎโครงสร้างอาคาร จำนวนชั้นกับจำนวนห้องต่อชั้น (SSK-160)
 *
 * แยกเป็น pure function แบบเดียวกับ apartmentConfig.ts เพราะใช้สองที่ ฟอร์มใช้เตือนและสรุปว่า
 * จะเพิ่ม/ลดห้องไหน ส่วน backend จำลองใช้ตัดสินว่าจะตอบ 400/409 ไหม ให้ทั้งสองฝั่งคิดตรงกัน
 *
 * เลขห้องคือเลขชั้นตามด้วยลำดับห้องสองหลัก (ชั้น 3 ห้องที่ 7 = 307) ตามแบบเดิมของ V2__seed_rooms.sql
 * ห้องต่อชั้นจึงเกิน 99 ไม่ได้ ไม่งั้นห้อง 1 ชั้น 2 กับห้อง 100 ชั้น 1 จะได้เลข 201 ซ้ำกัน
 */

/** กันพิมพ์ผิด ไม่ใช่กฎธุรกิจ หอนี้มีสองชั้น เพดาน 50 ชั้นจึงเผื่อไว้มากแล้ว */
export const MAX_FLOORS = 50
/** ลำดับห้องมีสองหลัก */
export const MAX_ROOMS_PER_FLOOR = 99

const ROOM_TYPES: RoomType[] = ['SINGLE', 'DOUBLE']

/** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อกรอกถูกทุกช่อง ข้อความตรงกับที่ backend ต้องตอบ 400 */
export function validateBuildingLayout(layout: BuildingConfigRequest): string | null {
  if (!Number.isInteger(layout.floors) || layout.floors < 1 || layout.floors > MAX_FLOORS) {
    return `Number of floors must be a whole number from 1 to ${MAX_FLOORS}`
  }
  if (
    !Number.isInteger(layout.roomsPerFloor) ||
    layout.roomsPerFloor < 1 ||
    layout.roomsPerFloor > MAX_ROOMS_PER_FLOOR
  ) {
    return `Rooms per floor must be a whole number from 1 to ${MAX_ROOMS_PER_FLOOR}`
  }
  if (!ROOM_TYPES.includes(layout.newRoomType)) {
    return 'Room type for new units must be SINGLE or DOUBLE'
  }
  return null
}

export function layoutRoomNumber(floor: number, index: number): string {
  return String(floor * 100 + index)
}

/** เลขห้องทั้งหมดของผัง เรียงชั้นแล้วตามลำดับห้อง */
export function layoutRoomNumbers(floors: number, roomsPerFloor: number): { roomNumber: string; floor: number }[] {
  const rooms: { roomNumber: string; floor: number }[] = []
  for (let floor = 1; floor <= floors; floor += 1) {
    for (let index = 1; index <= roomsPerFloor; index += 1) {
      rooms.push({ roomNumber: layoutRoomNumber(floor, index), floor })
    }
  }
  return rooms
}

/**
 * เทียบห้องที่มีอยู่กับผังใหม่ ได้ห้องที่ต้องเพิ่ม (มีในผังแต่ยังไม่มีจริง) กับห้องที่ต้องลบ
 * (มีจริงแต่อยู่นอกผัง) ห้องที่อยู่ทั้งสองฝั่งไม่ถูกแตะเลย เลขห้อง ชั้น ประเภท และสัญญาคงเดิม
 */
export function planLayoutChange<R extends { roomNumber: string }>(
  rooms: R[],
  floors: number,
  roomsPerFloor: number,
): { add: { roomNumber: string; floor: number }[]; remove: R[] } {
  const target = layoutRoomNumbers(floors, roomsPerFloor)
  const existing = new Set(rooms.map((room) => room.roomNumber))
  const wanted = new Set(target.map((room) => room.roomNumber))
  return {
    add: target.filter((room) => !existing.has(room.roomNumber)),
    remove: rooms.filter((room) => !wanted.has(room.roomNumber)),
  }
}

/** ข้อความ 409 เมื่อห้องที่ต้องลบยังมีประวัติ ใช้ทั้ง backend จำลองและเอกสารสัญญา API */
export function blockedRemovalMessage(roomNumbers: string[]): string {
  const units = roomNumbers.length === 1 ? `Unit ${roomNumbers[0]} has` : `Units ${roomNumbers.join(', ')} have`
  return `${units} lease or maintenance history and cannot be removed. Nothing was changed.`
}

/** "101, 102, 103 and 5 more" ไว้สรุปในฟอร์ม รายการยาวทั้งตึกอ่านไม่ไหว */
export function summarizeRoomNumbers(roomNumbers: string[], limit = 6): string {
  if (roomNumbers.length <= limit) {
    return roomNumbers.join(', ')
  }
  return `${roomNumbers.slice(0, limit).join(', ')} and ${roomNumbers.length - limit} more`
}
