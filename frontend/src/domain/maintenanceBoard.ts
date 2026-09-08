/**
 * กฎของหน้า Maintenance Management ที่ไม่เกี่ยวกับการวาดหน้าจอ
 *
 * แยกออกมาเป็น pure function ด้วยเหตุผลเดียวกับ apartmentConfig กับ tenant คือ
 * ส่วนที่พังเงียบที่สุดของฟอร์มไม่ใช่ปุ่ม แต่เป็นเงื่อนไขว่าอะไรกรอกได้บ้าง
 * ถ้าเขียนเงื่อนไขไว้ในตัว component มันจะเทสได้เฉพาะผ่านการคลิกจริง และพอมี
 * ป็อปอัปสองใบที่ใช้เงื่อนไขเดียวกัน (Create กับ Edit) เงื่อนไขก็จะเริ่มเพี้ยน
 * จากกันโดยไม่มีใครรู้
 *
 * ทั้งไฟล์นี้ยังไม่ผูกกับ backend เพราะ epic CR-05 ยังไม่มี endpoint สักตัว
 * (README หัวข้อ "ที่ยังไม่มี" ข้อ 5) ข้อมูลจึงเก็บอยู่ใน state ของหน้าเท่านั้น
 * พอมี endpoint จริงค่อยเปลี่ยนที่หน้าให้ยิง API แทน โดยไม่ต้องแตะกฎในไฟล์นี้
 */

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent'

export const PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent']

export type TaskStatus = 'In Progress' | 'Pending' | 'Wait for Assign'

export interface MaintenanceTask {
  id: number
  task: string
  detail: string
  maintenanceType: string
  unit: string
  priority: TaskPriority
  assignTo: string
  reportBy: string
  /** วันที่นัดซ่อม รูปแบบ YYYY-MM-DD ว่างได้ ดีไซน์ไม่ได้บังคับ */
  date: string
  status: TaskStatus
}

export interface SupplyItem {
  id: number
  name: string
  sku: string
  category: string
  stock: number
  minStock: number
}

export type ReminderFrequency = 'One-time' | 'Monthly' | 'Quarterly' | 'Annual'

export const FREQUENCIES: ReminderFrequency[] = ['One-time', 'Monthly', 'Quarterly', 'Annual']

export interface Reminder {
  id: number
  name: string
  frequency: ReminderFrequency
  startDate: string
  unit: string
  /** เวลาแจ้งเตือน รูปแบบ HH:MM */
  time: string
  priority: TaskPriority
  notes: string
  active: boolean
  /**
   * ข้อความ "ครั้งถัดไป" ที่ดีไซน์เขียนไว้เป็นคำอ่านของคน เช่น "1st of Month"
   * ซึ่งคำนวณจาก startDate ตรง ๆ ไม่ได้ ใบที่ผู้ใช้เพิ่มเองจะไม่มีค่านี้แล้ว
   * ไปคำนวณจากวันเริ่มแทน
   */
  nextLabel?: string
}

/** เลขห้องต้องเป็นตัวเลขล้วน เพราะทั้งอพาร์ตเมนต์ใช้เลขห้องแบบ 101 ถึง 212 */
const ROOM_NUMBER = /^\d{3}$/

export function validateMaintenanceTask(task: MaintenanceTask): string | null {
  if (task.task === '') {
    return 'ต้องกรอกชื่องานซ่อม'
  }
  if (task.unit === '') {
    return 'ต้องกรอกเลขห้อง'
  }
  if (!ROOM_NUMBER.test(task.unit)) {
    return 'เลขห้องต้องเป็นตัวเลขสามหลัก เช่น 101'
  }
  return null
}

export function validateSupplyItem(item: SupplyItem): string | null {
  if (item.name === '') {
    return 'ต้องกรอกชื่ออุปกรณ์'
  }
  if (item.category === '') {
    return 'ต้องกรอกหมวดหมู่'
  }
  if (!Number.isFinite(item.stock) || item.stock < 0) {
    return 'จำนวนคงเหลือต้องไม่ติดลบ'
  }
  if (!Number.isFinite(item.minStock) || item.minStock < 0) {
    return 'จำนวนขั้นต่ำต้องไม่ติดลบ'
  }
  return null
}

export function validateReminder(reminder: Reminder): string | null {
  if (reminder.name === '') {
    return 'ต้องกรอกชื่อการแจ้งเตือน'
  }
  if (reminder.startDate === '') {
    return 'ต้องเลือกวันเริ่ม'
  }
  return null
}

/**
 * สถานะสต็อกคำนวณจากจำนวน ไม่ได้เก็บไว้ตรง ๆ ถ้าเก็บเป็นฟิลด์แยกแล้วมีคนแก้
 * จำนวนโดยลืมแก้สถานะ ตารางจะโชว์ว่าของพอทั้งที่จริงต่ำกว่าขั้นต่ำแล้ว
 */
export function supplyStatus(item: SupplyItem): 'In Stock' | 'Low Stock' {
  return item.stock < item.minStock ? 'Low Stock' : 'In Stock'
}

/* ---------------------------- ปฏิทินรายสัปดาห์ ---------------------------- */

/** ชั่วโมงแรกและชั่วโมงสุดท้ายที่ปฏิทินแสดง ตรงกับดีไซน์ที่เริ่ม 08:00 จบ 18:00 */
export const DAY_START_HOUR = 8
export const DAY_END_HOUR = 18

export interface ScheduleEvent {
  id: number
  /** 0 = วันแรกของสัปดาห์ที่แสดง ถึง 4 = วันสุดท้าย ดีไซน์แสดงจันทร์ถึงศุกร์ */
  dayIndex: number
  /** เวลาเริ่มและจบ รูปแบบ HH:MM */
  start: string
  end: string
  title: string
  meta: string
  tone: 'neutral' | 'rose' | 'sand'
}

export function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

/**
 * แปลงเวลาเป็นตำแหน่งบนแกนตั้งของปฏิทิน คืนค่าเป็นเปอร์เซ็นต์เพื่อให้บล็อกงาน
 * ขยับตามความสูงจริงของตารางเอง ไม่ต้องผูกกับความสูงเป็น px ค่าใดค่าหนึ่ง
 * ซึ่งจะพังทันทีที่จอแคบลงแล้วตารางเตี้ยลง
 */
export function verticalPercent(time: string): number {
  const spanMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60
  const offset = toMinutes(time) - DAY_START_HOUR * 60
  const clamped = Math.min(Math.max(offset, 0), spanMinutes)
  return (clamped / spanMinutes) * 100
}

/** ความสูงของบล็อกงานเป็นเปอร์เซ็นต์ ใช้คู่กับ verticalPercent */
export function heightPercent(start: string, end: string): number {
  return Math.max(verticalPercent(end) - verticalPercent(start), 0)
}

/** ข้อความครั้งถัดไปที่โชว์บนการ์ด ใช้คำที่ดีไซน์เขียนไว้ก่อน ถ้าไม่มีค่อยใช้วันเริ่ม */
export function reminderNextLabel(reminder: Reminder): string {
  return reminder.nextLabel ?? `Next: ${reminder.startDate}`
}
