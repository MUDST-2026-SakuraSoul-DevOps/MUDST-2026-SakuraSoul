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
}

/** เลขห้องต้องเป็นตัวเลขล้วน เพราะทั้งอพาร์ตเมนต์ใช้เลขห้องแบบ 101 ถึง 212 */
const ROOM_NUMBER = /^\d{3}$/

export function validateMaintenanceTask(task: MaintenanceTask): string | null {
  if (task.task === '') {
    return 'Please enter the task title'
  }
  if (task.unit === '') {
    return 'Please enter the unit number'
  }
  if (!ROOM_NUMBER.test(task.unit)) {
    return 'The unit number must be three digits, for example 101'
  }
  return null
}

export function validateSupplyItem(item: SupplyItem): string | null {
  if (item.name === '') {
    return 'Please enter the item name'
  }
  if (item.category === '') {
    return 'Please enter the category'
  }
  if (!Number.isFinite(item.stock) || item.stock < 0) {
    return 'Quantity cannot be negative'
  }
  if (!Number.isFinite(item.minStock) || item.minStock < 0) {
    return 'Minimum stock cannot be negative'
  }
  return null
}

export function validateReminder(reminder: Reminder): string | null {
  if (reminder.name === '') {
    return 'Please enter the reminder name'
  }
  if (reminder.startDate === '') {
    return 'Please choose a start date'
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

/**
 * US-17-S2 คือ "กด restock แล้วกรอกจำนวนที่เติมเข้าไป" ไม่ใช่ตั้งจำนวนใหม่ทั้งก้อน
 * แยกออกจาก validateSupplyItem เพราะกฎคนละเรื่องกัน ฟอร์มแก้ไขอนุญาตให้ตั้ง
 * จำนวนเป็นศูนย์ได้ (ของหมดสต็อกจริง) แต่ฟอร์ม restock ต้องเติมมากกว่าศูนย์เสมอ
 * เติมศูนย์ไม่มีความหมายและน่าจะเป็นเพราะผู้ใช้ลืมกรอก
 */
export function validateRestockQuantity(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'The restock amount must be greater than 0'
  }
  if (!Number.isInteger(amount)) {
    return 'The restock amount must be a whole number'
  }
  return null
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

/* ---------------------------- รอบแจ้งเตือนซ่อมบำรุง ---------------------------- */

/**
 * ทั้งบล็อกนี้มาจากที่ QA ทักว่าการ์ด Roofing Inspection โชว์ว่าครั้งถัดไปคือ
 * ก.ย. 2024 ซึ่งผ่านมาสองปีแล้ว แต่หน้าจอแสดงเฉย ๆ ไม่มีสถานะเลยกำหนด
 *
 * ต้นเหตุคือข้อความ "ครั้งถัดไป" ถูกฝังไว้ตายตัวในข้อมูล พอเวลาเดินผ่านไปมัน
 * ก็ไม่ขยับตาม รอบนี้เปลี่ยนมาคำนวณจากวันเริ่มกับความถี่แทน ข้อความบนการ์ดจึง
 * ต่างจากในดีไซน์ที่เขียนว่า "1st of Month" เพราะของจริงต้องเป็นวันที่ที่ถึง
 * จริง ไม่ใช่คำบรรยายรอบ
 */

const MONTHS_PER_STEP: Record<ReminderFrequency, number> = {
  'One-time': 0,
  Monthly: 1,
  Quarterly: 3,
  Annual: 12,
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isoOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/**
 * บวกเดือนแบบหนีบวันสิ้นเดือน วันที่ 31 บวกหนึ่งเดือนไปเจอเดือนที่มี 30 วัน
 * ต้องได้วันที่ 30 ไม่ใช่ล้นไปเป็นวันที่ 1 ของเดือนถัดไป
 */
function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return isoOf(target)
}

/**
 * วันที่ครั้งถัดไปของการแจ้งเตือน
 *
 * ใบที่ปิดอยู่ถือว่าตารางหยุดเดิน ครั้งถัดไปจึงค้างอยู่ที่วันเริ่ม ซึ่งทำให้
 * ใบที่ปิดค้างไว้นานกลายเป็นเลยกำหนด และนั่นคือสิ่งที่ควรเห็นบนหน้าจอ
 */
export function nextOccurrence(reminder: Reminder, today: string): string {
  const step = MONTHS_PER_STEP[reminder.frequency]
  if (step === 0 || !reminder.active) {
    return reminder.startDate
  }
  let next = reminder.startDate
  // กันวนไม่รู้จบถ้าข้อมูลเพี้ยน 400 รอบครอบคลุมเกินสามสิบปีสำหรับรอบรายเดือน
  for (let i = 0; i < 400 && next < today; i += 1) {
    next = addMonths(next, step)
  }
  return next
}

export function isReminderOverdue(reminder: Reminder, today: string): boolean {
  return nextOccurrence(reminder, today) < today
}

/** ข้อความครั้งถัดไปที่โชว์บนการ์ด */
export function reminderNextLabel(reminder: Reminder, today: string): string {
  return `Next: ${nextOccurrence(reminder, today)}`
}

/* ---------------------------- สัปดาห์ที่ปฏิทินแสดง ---------------------------- */

const WEEKDAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface WeekDay {
  /** ป้ายหัวคอลัมน์ เช่น "Mon 8" */
  label: string
  /** วันที่จริงรูปแบบ YYYY-MM-DD ใช้เทียบว่าคอลัมน์ไหนคือวันนี้ */
  date: string
}

/**
 * วันจันทร์ถึงศุกร์ของสัปดาห์ที่ครอบวันที่ให้มา
 *
 * QA ทักว่าปฏิทินเดิมตรึงตายไว้ที่ Mon 14 ถึง Fri 18 เปิดวันไหนก็เห็นสัปดาห์
 * เดิม ซึ่งทำให้เส้นบอกเวลาปัจจุบันไม่มีความหมาย เพราะไม่รู้ว่าอยู่คอลัมน์ไหน
 */
export function workWeekOf(today: string): WeekDay[] {
  const [year, month, day] = today.split('-').map(Number)
  const monday = new Date(Date.UTC(year, month - 1, day))
  // getUTCDay ให้ 0 เป็นวันอาทิตย์ เลื่อนกลับไปหาวันจันทร์ของสัปดาห์นั้น
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday)
    date.setUTCDate(monday.getUTCDate() + index)
    return {
      label: `${WEEKDAY_LABEL[date.getUTCDay()]} ${date.getUTCDate()}`,
      date: isoOf(date),
    }
  })
}
