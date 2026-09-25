import type {
  CreateMaintenanceTicketRequest,
  MaintenancePriority,
  MaintenanceReminder,
  MaintenanceStatus,
  MaintenanceTicket,
  ReminderFrequencyCode,
  ReminderRequest,
  Supply,
  SupplyRequest,
  UpdateMaintenanceTicketRequest,
} from './types'
import type {
  MaintenanceTask,
  Reminder,
  ReminderFrequency,
  ReminderView,
  SupplyItem,
  SupplyRow,
  TaskPriority,
  TaskStatus,
} from '../domain/maintenanceBoard'
import { DEFAULT_REMIND_TIME } from '../domain/maintenanceBoard'
import type { CreateMaintenanceDraft } from '../domain/maintenanceTicket'

/**
 * ตัวแปลงระหว่างใบแจ้งซ่อมของ API กับโมเดลของหน้าจอ (SSK-131)
 *
 * สัญญา API (docs/api-contract-maintenance.md หัวข้อ "สิ่งที่หน้าเว็บต้องเปลี่ยน") ให้เขียน
 * ตัวแปลงไว้ใน src/api/ ที่เดียว ฟอร์มกับตารางของแท็บ Maintenance Tasks ยังใช้
 * MaintenanceTask เป็นโมเดลของหน้าจอเหมือนเดิม จึงไม่ต้องรื้อ dialog ทั้งชุด
 */

const PRIORITY_TO_API: Record<TaskPriority, MaintenancePriority> = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
  Urgent: 'URGENT',
}

const PRIORITY_FROM_API: Record<MaintenancePriority, TaskPriority> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

export function priorityToApi(priority: TaskPriority): MaintenancePriority {
  return PRIORITY_TO_API[priority]
}

export function priorityLabel(priority: MaintenancePriority): TaskPriority {
  return PRIORITY_FROM_API[priority]
}

/**
 * ป้ายสถานะตามตารางในสัญญา API OPEN แยกเป็นสองป้ายตามว่ามีช่างรับงานหรือยัง
 * จึงคำนวณจาก status + assignedTo ไม่เก็บป้ายแยกไว้ ป้ายกับข้อมูลจะได้ไม่เพี้ยนจากกัน
 */
export function taskStatusOf(ticket: Pick<MaintenanceTicket, 'status' | 'assignedTo'>): TaskStatus {
  if (ticket.status === 'DONE') {
    return 'Done'
  }
  if (ticket.status === 'IN_PROGRESS') {
    return 'In Progress'
  }
  return ticket.assignedTo ? 'Pending' : 'Wait for Assign'
}

/** ป้ายกลับเป็นสถานะของ API Pending กับ Wait for Assign เป็น OPEN ทั้งคู่ */
export function taskStatusToApi(status: TaskStatus): MaintenanceStatus {
  if (status === 'Done') {
    return 'DONE'
  }
  if (status === 'In Progress') {
    return 'IN_PROGRESS'
  }
  return 'OPEN'
}

/**
 * Bill to tenant / Amount (SSK-134) ไม่มีคอลัมน์แยกใน API ใช้ cost ช่องเดียว
 * ช่อง Amount กรอกได้เฉพาะตอนติ๊ก Bill to tenant และต้องมากกว่าศูนย์ สองช่องนี้จึง
 * เทียบเท่ากับ cost > 0 พอดี ไม่มีค่าไหนหายระหว่างแปลงไปกลับ
 */
export function ticketToTask(ticket: MaintenanceTicket): MaintenanceTask {
  const cost = ticket.cost ?? 0
  return {
    id: ticket.id,
    roomId: ticket.roomId,
    task: ticket.title,
    detail: ticket.detail ?? '',
    maintenanceType: ticket.maintenanceType ?? '',
    unit: ticket.roomNumber,
    priority: priorityLabel(ticket.priority),
    assignTo: ticket.assignedTo ?? '',
    reportBy: ticket.reportedBy ?? '',
    date: ticket.scheduledDate ?? '',
    status: taskStatusOf(ticket),
    billToTenant: cost > 0,
    amount: cost,
  }
}

/** body ของ POST /api/maintenance จากฟอร์ม Create Task ช่องว่างส่งเป็น null */
export function createTicketRequest(task: MaintenanceTask): CreateMaintenanceTicketRequest {
  return {
    roomId: task.roomId,
    title: task.task,
    detail: task.detail || null,
    maintenanceType: task.maintenanceType || null,
    priority: priorityToApi(task.priority),
    assignedTo: task.assignTo || null,
    reportedBy: task.reportBy || null,
    scheduledDate: task.date || null,
    cost: task.billToTenant ? task.amount : null,
  }
}

/**
 * body ของ PATCH จากฟอร์ม Edit Task ส่งเฉพาะช่องที่เปลี่ยน
 *
 * ส่งเฉพาะที่เปลี่ยนตามเหตุผลในสัญญา API คือถ้าส่งใบทั้งก้อนกลับไป จะเขียนทับช่องที่คนอื่น
 * เพิ่งแก้ไปโดยไม่ได้ตั้งใจ ช่องที่ล้างได้ (ช่าง ประเภท ผู้แจ้ง) ส่ง "" ไปแปลว่าล้างค่า
 * ส่วนวันนัดล้างไม่ได้ในสัญญานี้ เลยส่งเฉพาะตอนมีค่า และค่าซ่อมที่เลิกเก็บผู้เช่าส่งเป็น 0
 * เพราะ PATCH ล้างเป็น null ไม่ได้
 */
export function ticketPatch(next: MaintenanceTask, original: MaintenanceTask): UpdateMaintenanceTicketRequest {
  const patch: UpdateMaintenanceTicketRequest = {}
  const nextStatus = taskStatusToApi(next.status)
  if (nextStatus !== taskStatusToApi(original.status)) {
    patch.status = nextStatus
  }
  if (next.task !== original.task) {
    patch.title = next.task
  }
  if (next.detail !== original.detail) {
    patch.detail = next.detail
  }
  if (next.maintenanceType !== original.maintenanceType) {
    patch.maintenanceType = next.maintenanceType
  }
  if (next.priority !== original.priority) {
    patch.priority = priorityToApi(next.priority)
  }
  if (next.assignTo !== original.assignTo) {
    patch.assignedTo = next.assignTo
  }
  if (next.reportBy !== original.reportBy) {
    patch.reportedBy = next.reportBy
  }
  if (next.date !== original.date && next.date !== '') {
    patch.scheduledDate = next.date
  }
  const nextCost = next.billToTenant ? next.amount : 0
  const originalCost = original.billToTenant ? original.amount : 0
  if (nextCost !== originalCost) {
    patch.cost = nextCost
  }
  return patch
}

/**
 * body ของ POST จากป็อปอัป Create Maintenance บน Dashboard (SSK-131)
 *
 * ฟอร์มนี้ไม่มีช่องชื่องาน ใช้ประเภทงานเป็นชื่อ เพราะชื่อจะไปขึ้นบนการ์ดของห้องนั้นเอง
 * (openMaintenanceTitle) จึงไม่ต้องต่อเลขห้อง แก้ชื่อทีหลังได้ที่แท็บ Maintenance Tasks
 * ช่อง Recurring ไม่ได้อยู่ในใบแจ้งซ่อม แต่สร้างเป็นรอบแจ้งเตือนแยกด้วย dashboardReminderRequest (SSK-20)
 */
export function dashboardCreateRequest(
  draft: CreateMaintenanceDraft,
  roomId: number,
): CreateMaintenanceTicketRequest {
  return {
    roomId,
    title: draft.maintenanceType,
    maintenanceType: draft.maintenanceType,
    detail: draft.notes || null,
    cost: draft.billToTenant ? draft.amount : null,
  }
}

/**
 * ของในคลังจาก API เป็นแถวของตารางแท็บ Supplies & Inventory (SSK-23)
 *
 * ป้าย In Stock / Low Stock ใช้ status ที่ backend คิดให้ตามข้อ 4 ของสัญญา API ไม่ได้คำนวณซ้ำ
 * รหัสที่เป็น null (ของเก่าที่เพิ่มตรงผ่าน API ก่อน server ออกรหัสให้) เป็นสตริงว่าง ช่องค้นหากับ
 * ฟอร์มใช้ sku เป็นสตริงเสมอ
 */
export function supplyToRow(supply: Supply): SupplyRow {
  return {
    id: supply.id,
    name: supply.name,
    sku: supply.sku ?? '',
    category: supply.category,
    stock: supply.stock,
    minStock: supply.minStock,
    maxStock: supply.maxStock,
    status: supply.status === 'LOW_STOCK' ? 'Low Stock' : 'In Stock',
  }
}

/**
 * body ของ POST และ PUT /api/supplies จากฟอร์ม (SSK-23)
 *
 * ฟอร์มไม่มีช่อง SKU ของใหม่จึงส่ง null ให้ server ออกรหัสให้ ส่วนของเดิมต้องส่งรหัสเดิมกลับไป
 * เพราะ PUT แก้ทั้งก้อน ถ้าไม่ส่งรหัสจะหายไปจากแถว
 */
export function supplyRequest(item: SupplyItem): SupplyRequest {
  return {
    name: item.name,
    sku: item.sku || null,
    category: item.category,
    stock: item.stock,
    minStock: item.minStock,
    maxStock: item.maxStock,
  }
}

/* ---------------------------- รอบแจ้งเตือน (SSK-20) ---------------------------- */

const FREQUENCY_TO_API: Record<ReminderFrequency, ReminderFrequencyCode> = {
  'One-time': 'ONE_TIME',
  Monthly: 'MONTHLY',
  Quarterly: 'QUARTERLY',
  Annual: 'ANNUAL',
}

const FREQUENCY_FROM_API: Record<ReminderFrequencyCode, ReminderFrequency> = {
  ONE_TIME: 'One-time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
}

/** รอบบนหน้าจอเป็นค่าของ API ตามข้อ 3 ของสัญญา API ตัวแปลงคู่เดียวที่ทุกหน้าใช้ร่วมกัน */
export function frequencyToApi(frequency: ReminderFrequency): ReminderFrequencyCode {
  return FREQUENCY_TO_API[frequency]
}

export function frequencyLabel(frequency: ReminderFrequencyCode): ReminderFrequency {
  return FREQUENCY_FROM_API[frequency]
}

/**
 * ใบแจ้งเตือนจาก API เป็นโมเดลของหน้าจอ
 *
 * ห้องที่เป็น null คืองานของทั้งตึก (All units) เก็บเป็น null ต่อ ไม่แปลงเป็นสตริงว่าง เพราะสตริงว่าง
 * แปลว่ายังไม่ได้เลือกห้อง ซึ่งฟอร์มต้องเตือน เวลาที่ไม่ได้ตั้งใช้ 09:00 แบบเดียวกับที่ปฏิทินใช้วางบล็อก
 */
export function reminderToView(reminder: MaintenanceReminder): ReminderView {
  return {
    id: reminder.id,
    name: reminder.name,
    frequency: frequencyLabel(reminder.frequency),
    startDate: reminder.startDate,
    unit: reminder.roomNumber,
    roomId: reminder.roomId,
    time: reminder.remindTime ?? DEFAULT_REMIND_TIME,
    priority: priorityLabel(reminder.priority),
    notes: reminder.notes ?? '',
    active: reminder.active,
    nextDueDate: reminder.nextDueDate,
    overdue: reminder.overdue,
    lastTriggeredAt: reminder.lastTriggeredAt,
  }
}

/** body ของ POST/PUT จากฟอร์ม roomId หาจากรายการห้องก่อนส่ง null คืองานของทั้งตึก */
export function reminderRequest(form: Reminder, roomId: number | null): ReminderRequest {
  return {
    name: form.name,
    frequency: frequencyToApi(form.frequency),
    startDate: form.startDate,
    roomId,
    remindTime: form.time || null,
    priority: priorityToApi(form.priority),
    notes: form.notes || null,
  }
}

/**
 * รอบแจ้งเตือนจากช่อง Recurring ของป็อปอัป Create Maintenance บน Dashboard (SSK-20)
 *
 * ชื่อใช้ประเภทงานแบบเดียวกับชื่อใบแจ้งซ่อม (dashboardCreateRequest) รอบเริ่มที่ Next maintenance date
 * ซึ่งต้องอยู่หลังวันนี้ (validateCreateMaintenance) ใบที่เพิ่งสร้างจึงไม่ถูกสร้างซ้ำโดยงานประจำวัน
 * ไม่ส่งเวลากับความสำคัญ backend ใช้ค่าตั้งต้น (ไม่ตั้งเวลา / MEDIUM) เพราะฟอร์มนี้ไม่มีสองช่องนั้น
 */
export function dashboardReminderRequest(draft: CreateMaintenanceDraft, roomId: number): ReminderRequest {
  return {
    name: draft.maintenanceType,
    frequency: frequencyToApi(draft.repeatEvery as ReminderFrequency),
    startDate: draft.nextDate,
    roomId,
    remindTime: null,
    notes: draft.notes || null,
  }
}
