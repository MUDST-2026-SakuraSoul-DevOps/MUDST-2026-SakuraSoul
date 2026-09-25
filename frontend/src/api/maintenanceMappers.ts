import type {
  CreateMaintenanceTicketRequest,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceTicket,
  UpdateMaintenanceTicketRequest,
} from './types'
import type { MaintenanceTask, TaskPriority, TaskStatus } from '../domain/maintenanceBoard'
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
 * ช่อง Recurring ปิดไว้ในฟอร์มจนกว่าแท็บ Schedule & Reminder จะต่อ API จึงไม่ได้ส่งต่อ
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
