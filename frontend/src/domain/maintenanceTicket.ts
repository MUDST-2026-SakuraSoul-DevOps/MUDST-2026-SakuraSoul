/**
 * กฎของป็อปอัป Create Maintenance ที่ไม่เกี่ยวกับการวาดหน้าจอ
 *
 * แยกออกมาเป็น pure function ด้วยเหตุผลเดียวกับ domain ตัวอื่นในโปรเจกต์ คือ
 * เงื่อนไขว่าอะไรกรอกได้บ้างเป็นส่วนที่พังเงียบที่สุด และเทสได้โดยไม่ต้อง
 * เรนเดอร์ฟอร์มทั้งใบ
 */

export const MAINTENANCE_TYPES = [
  'Air Conditioning',
  'Plumbing',
  'Electrical',
  'Appliance',
  'Furniture',
  'Other',
] as const

export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number]

/** ห้องยังให้เช่าได้ระหว่างซ่อม หรือต้องปิดห้อง */
export type RoomAvailability = 'AVAILABLE' | 'OUT_OF_SERVICE'

/**
 * รอบที่เลือกได้ในช่อง Repeat every ตัด Every 6 months ออกใน SSK-20 เพราะรอบแจ้งเตือนของ backend
 * มีแค่รายเดือน รายไตรมาส และรายปี ถ้าเก็บไว้จะเลือกได้แต่บันทึกไม่ได้
 */
export const REPEAT_INTERVALS = ['Monthly', 'Quarterly', 'Annual'] as const

export type RepeatInterval = (typeof REPEAT_INTERVALS)[number]

/** ความยาวสูงสุดของช่องหมายเหตุ ดีไซน์เขียนตัวนับไว้ว่า 0/500 */
export const NOTES_MAX_LENGTH = 500

export interface CreateMaintenanceDraft {
  roomNumber: string
  maintenanceType: string
  availability: RoomAvailability
  /** ผลักค่าซ่อมเข้าบิลผู้เช่าหรือไม่ ดีไซน์ให้เป็นตัวเลือก */
  billToTenant: boolean
  /** จำนวนเงินที่จะขึ้นบิล ใช้เมื่อ billToTenant เป็น true */
  amount: number
  recurring: boolean
  /** วันซ่อมครั้งถัดไป ใช้เมื่อ recurring เป็น true */
  nextDate: string
  /** รอบการซ่อมซ้ำ ใช้เมื่อ recurring เป็น true */
  repeatEvery: string
  notes: string
}

/**
 * today (YYYY-MM-DD ตามเวลาไทย) ใช้ตรวจว่าวันซ่อมครั้งถัดไปอยู่หลังวันนี้ ป็อปอัปส่งมาเสมอ ส่วนที่ไม่ส่ง
 * ข้ามข้อนั้นไป กฎข้ออื่นจะได้เทสได้โดยไม่ต้องตรึงวัน
 */
export function validateCreateMaintenance(draft: CreateMaintenanceDraft, today?: string): string | null {
  if (draft.roomNumber === '') {
    return 'Please select a room'
  }
  if (draft.maintenanceType === '') {
    return 'Please choose what needs to be fixed'
  }
  /*
    ช่องเงินกับช่องรอบซ่อมซ้ำเป็นตัวเลือก แต่ถ้าติ๊กเปิดแล้วต้องกรอกให้ครบ
    ไม่งั้นจะได้ใบแจ้งที่บอกว่าจะขึ้นบิลผู้เช่าแต่ไม่มียอด หรือบอกว่าซ่อมซ้ำ
    แต่ไม่รู้ว่าครั้งถัดไปเมื่อไหร่ ซึ่งอ่านแล้วไม่มีความหมาย
  */
  if (draft.billToTenant) {
    if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
      return 'The amount billed to the tenant must be greater than 0'
    }
  }
  if (draft.recurring) {
    if (draft.nextDate === '') {
      return 'Please choose the next maintenance date'
    }
    if (draft.repeatEvery === '') {
      return 'Please choose how often this repeats'
    }
    /*
      SSK-20 ใบแจ้งซ่อมที่กำลังสร้างคืองานของรอบนี้อยู่แล้ว รอบแจ้งเตือนจึงต้องเริ่มครั้งถัดไป ถ้าให้เริ่ม
      วันนี้หรือย้อนหลัง งานประจำวันจะสร้างใบของรอบเดียวกันซ้ำอีกใบในเช้าวันถัดไป
    */
    if (today !== undefined && draft.nextDate <= today) {
      return 'The next maintenance date must be after today'
    }
  }
  if (draft.notes.length > NOTES_MAX_LENGTH) {
    return `Notes cannot be longer than ${NOTES_MAX_LENGTH} characters`
  }
  return null
}
