/**
 * รูปร่างข้อมูลที่รับส่งกับ backend
 *
 * ส่วนของห้องกับผู้เช่าตรงกับ endpoint ที่มีอยู่จริงแล้ว ส่วนของสัญญาเช่า (lease)
 * กับงานซ่อม (maintenance) เป็นสัญญาที่ตกลงกันไว้ล่วงหน้า ฝั่ง backend ยังไม่ได้
 * ทำ (README หัวข้อ "ที่ยังไม่มี" ข้อ 1) ฝั่งหน้าเว็บเขียนตามสัญญานี้ไปก่อนแล้ว
 * รันด้วย mock ระหว่างรอ ดู src/api/mockApi.ts และ docs/api-contract-lease.md
 */

/** ผู้ใช้ที่ล็อกอินอยู่ POST /auth/login กับ GET /auth/me ตอบก้อนเดียวกัน (US-01) */
export interface AuthUser {
  username: string
  displayName: string
  /** เป็น null ได้ แอดมินที่ตั้งจาก environment variable ยังไม่มีข้อมูลติดต่อ */
  email: string | null
  phone: string | null
}

/** body ของ POST /api/auth/login (US-01) */
export interface LoginRequest {
  username: string
  password: string
}

/** สถานะห้องที่เอาไปลงสีในแดชบอร์ด */
export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE'

/**
 * ประเภทห้อง โชว์ในคอลัมน์ TYPE ของหน้า Units และ ROOM TYPE ของหน้า Tenants
 *
 * ฟิลด์นี้ยังไม่มีในตาราง room ฝั่ง backend เพิ่งเพิ่มเข้าสัญญาตามดีไซน์รอบล่าสุด
 * ดูรายละเอียดที่ docs/api-contract-lease.md หัวข้อ Room type ระหว่างที่ backend
 * ยังไม่ทำ ฝั่ง mock ตอบค่านี้ให้แล้ว
 */
export type RoomType = 'SINGLE' | 'DOUBLE'

/** รอบบิลตาม requirement ใน README (รายเดือน / รายปี) */
export type BillingCycle = 'MONTHLY' | 'YEARLY'

export type LeaseStatus = 'ACTIVE' | 'ENDED'

/**
 * สถานะที่แอดมินตั้งเองได้ตาม US-15 ไม่มี OCCUPIED เพราะสถานะมีผู้เช่าเกิดจาก
 * การมีสัญญา active อยู่ ไม่ใช่สิ่งที่กดตั้งได้ตรง ๆ
 */
export type SettableRoomStatus = Extract<RoomStatus, 'AVAILABLE' | 'MAINTENANCE'>

export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE'

/** สัญญาที่กำลัง active ของห้องหนึ่ง เอามาโชว์บนการ์ดห้องโดยไม่ต้องยิง API ซ้ำ */
export interface LeaseBrief {
  id: number
  tenantId: number
  tenantName: string
  startDate: string
  /** null คือสัญญาที่ยังไม่กำหนดวันจบ */
  endDate: string | null
  monthlyRent: number
  billingCycle: BillingCycle
}

export interface RoomSummary {
  id: number
  roomNumber: string
  floor: number
  roomType: RoomType
  baseRent: number
  status: RoomStatus
  currentLease: LeaseBrief | null
  /** จำนวนใบแจ้งซ่อมที่ยังไม่ปิดของห้องนี้ ใช้ติดป้ายเตือนบนการ์ด */
  openMaintenanceCount: number
  /**
   * ชื่อเรื่องของใบแจ้งซ่อมที่ยังไม่ปิดและเก่าที่สุดของห้องนี้ Figma โชว์ข้อความนี้
   * บนการ์ดแทนตัวเลขจำนวนใบ (เฟรม Dashboard Page ห้อง 104 กับ 201) เป็น null
   * ได้ทั้งกรณีไม่มีงานซ่อมค้าง และกรณี backend ยังไม่ส่งฟิลด์นี้มา
   */
  openMaintenanceTitle: string | null
}

export interface RoomDetail extends RoomSummary {
  note: string | null
  /** ที่อยู่ของตึกที่ห้องอยู่ ฟอร์ม Add Unit ใน Figma มีช่องนี้ */
  address: string | null
}

/** ตัวที่ฟอร์ม Add Unit ส่งไป POST /api/rooms */
export interface CreateRoomRequest {
  roomNumber: string
  floor: number
  roomType: RoomType
  address?: string
}

/**
 * ผู้เช่าเก็บแค่ห้าช่องตาม US-03 (docs/api-contract-lease.md) ช่วงสัญญากับประเภทห้องเป็นของ
 * สัญญา ไม่ใช่ของผู้เช่า เดิมเคยมีสามช่องนั้นในนี้ ซึ่ง backend ไม่เคยเก็บ (SSK-136)
 */
export interface Tenant {
  id: number
  fullName: string
  /** ไม่บังคับตามคำตัดสินอาจารย์ 11 ก.ย. ไม่มีอีเมล backend ส่ง null มา */
  email: string | null
  phone: string
  /** บังคับตั้งแต่ 11 ก.ย. แต่ข้อมูลเก่าบางคนยังเป็น null */
  nationalId: string | null
  lineId?: string | null
}

/**
 * body ของ POST และ PUT /api/tenants ใช้ก้อนเดียวกัน
 * PUT แทนทั้งก้อน ช่องไม่บังคับที่ไม่ส่งมาจะถูกล้างเป็น null จึงต้องส่งค่าเดิมกลับไปทุกครั้ง
 */
export interface CreateTenantRequest {
  fullName: string
  phone: string
  nationalId?: string | null
  lineId?: string | null
  email?: string | null
}

export interface Lease {
  id: number
  roomId: number
  roomNumber: string
  tenantId: number
  tenantName: string
  startDate: string
  endDate: string | null
  /** ค่าเช่าที่ backend ล็อกไว้ตอนสร้างสัญญาจากประเภทห้อง (SSK-127) หน้าเว็บแก้ไม่ได้ */
  monthlyRent: number
  billingCycle: BillingCycle
  status: LeaseStatus
  /** เงินมัดจำของสัญญานี้ เป็น undefined ได้ถ้า backend รุ่นเก่ายังไม่ส่งมา */
  securityDeposit?: number
  /**
   * อัตราค่าไฟ/น้ำต่อหน่วยที่ล็อกไว้ตอนเซ็นสัญญา ไม่เปลี่ยนตาม Apartment Config
   * ที่แก้ทีหลัง เป็น undefined ได้สำหรับสัญญาที่เซ็นก่อนมีฟิลด์นี้ ตกไปใช้อัตรา
   * ปัจจุบันใน Config แทน (ดู fallback ใน CreatePaymentDialog)
   *
   * ชื่อต้องตรงกับ LeaseResponse ของ backend เดิมตั้งเป็น electricRate/waterRate
   * ซึ่ง backend ไม่มี บน backend จริงค่านี้จึงเป็น undefined ตลอด
   */
  electricRatePerUnit?: number
  waterRatePerUnit?: number
  /** ค่าส่วนกลางกับค่าอินเทอร์เน็ตที่ล็อกไว้ตอนเซ็น ใบเสร็จคิดจากสองค่านี้ ไม่ใช่จาก Config */
  commonAreaFee?: number
  internetFee?: number
}

/**
 * ไม่มี monthlyRent แล้ว เพราะ backend เอาค่าเช่าจากประเภทห้องเองและมองข้ามค่าที่ส่งมา
 * (SSK-127, LeaseDtos.LeaseRequest) ช่องที่เหลือชื่อตรงกับ backend ทุกตัว
 */
export interface LeaseRequest {
  roomId: number
  tenantId: number
  startDate: string
  endDate: string | null
  billingCycle: BillingCycle
  securityDeposit?: number
  electricRatePerUnit?: number
  waterRatePerUnit?: number
  /** ไม่ส่ง = backend คัดลอกจาก Apartment Config ตอนสร้าง หรือคงค่าที่ล็อกไว้ตอนแก้ */
  commonAreaFee?: number
  internetFee?: number
}

export interface LeaseQuery {
  status?: LeaseStatus
  roomId?: number
  tenantId?: number
}

/**
 * อัตราค่าสาธารณูปโภคของตึก ใช้คำนวณใบเสร็จ (US-16)
 *
 * เก็บชุดเดียวทั้งตึก ไม่ได้แยกรายห้อง เพราะ requirement ใน README พูดถึงอัตรา
 * ระดับอพาร์ตเมนต์ ถ้าวันหลังต้องแยกรายห้องค่อยเพิ่มตารางทับ ไม่ต้องรื้ออันนี้
 */
export interface ApartmentConfig {
  /** บาทต่อหน่วยไฟ */
  electricRatePerUnit: number
  /** บาทต่อหน่วยน้ำ */
  waterRatePerUnit: number
  /** ค่าส่วนกลางต่อเดือน */
  commonAreaFee: number
  /** ค่าอินเทอร์เน็ตต่อเดือน */
  internetFee: number
  /** เวลาที่แก้ล่าสุด เอาไว้โชว์ว่าอัตราชุดนี้ตั้งไว้เมื่อไหร่ */
  updatedAt: string
}

export type ApartmentConfigRequest = Omit<ApartmentConfig, 'updatedAt'>

export interface MaintenanceTicket {
  id: number
  roomId: number
  roomNumber: string
  title: string
  detail: string | null
  status: MaintenanceStatus
  /**
   * เวลาที่แจ้ง backend ส่งเป็น ISO-8601 เต็ม (2026-09-25T03:12:00Z) ไม่ใช่วันที่ล้วน
   * จะนับว่าแจ้ง "วันนี้" ไหมต้องแปลงเป็นวันตามเวลาไทยด้วย dateInBangkok ใน format.ts
   */
  reportedAt: string
  /** ช่างที่รับงาน ยังไม่มีคนรับเป็น null (ขึ้นป้าย Wait for Assign) */
  assignedTo: string | null
  reportedBy: string | null
  /*
    ช่องที่เหลือของสัญญา (docs/api-contract-maintenance.md) ใช้ตั้งแต่ SSK-131
    ที่แท็บ Maintenance Tasks ต่อ API จริง
  */
  maintenanceType: string | null
  priority: MaintenancePriority
  /** วันนัดซ่อม YYYY-MM-DD ว่างได้ */
  scheduledDate: string | null
  /** ค่าซ่อมที่เก็บผู้เช่า ใช้แทน Bill to tenant / Amount ของฟอร์ม (SSK-134) */
  cost: number | null
  /** MANUAL คือแอดมินสร้างเอง RECURRING คือระบบสร้างจากรอบแจ้งเตือน */
  source: MaintenanceSource
  closedAt: string | null
  suppliesUsed: MaintenanceSupplyUsed[]
}

export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export type MaintenanceSource = 'MANUAL' | 'RECURRING'

export interface MaintenanceSupplyUsed {
  supplyId: number
  name: string
  quantity: number
}

/** body ของ POST /api/maintenance บังคับแค่ roomId กับ title */
export interface CreateMaintenanceTicketRequest {
  roomId: number
  title: string
  detail?: string | null
  maintenanceType?: string | null
  priority?: MaintenancePriority
  assignedTo?: string | null
  reportedBy?: string | null
  scheduledDate?: string | null
  cost?: number | null
}

/**
 * body ของ PATCH /api/maintenance/{id} ช่องที่ไม่ส่งแปลว่าไม่แก้
 * assignedTo, maintenanceType, reportedBy ส่ง "" มาแปลว่าล้างค่า ห้องแก้ไม่ได้
 */
export interface UpdateMaintenanceTicketRequest {
  status?: MaintenanceStatus
  assignedTo?: string
  priority?: MaintenancePriority
  scheduledDate?: string
  cost?: number
  detail?: string
  title?: string
  maintenanceType?: string
  reportedBy?: string
}

/** ป้ายสต็อกที่ backend คำนวณจาก stock < minStock ไม่ได้เก็บเป็นคอลัมน์ (US-17-S3) */
export type SupplyStatusCode = 'IN_STOCK' | 'LOW_STOCK'

/** ของหนึ่งรายการในคลังอุปกรณ์ ชื่อช่องตรงกับ SupplyDtos ฝั่ง backend (SSK-23) */
export interface Supply {
  id: number
  name: string
  /** ของที่เพิ่มผ่านหน้าเว็บได้รหัสจาก server เสมอ null ได้เฉพาะของเก่าที่เพิ่มตรงผ่าน API */
  sku: string | null
  category: string
  stock: number
  minStock: number
  /** เพดานที่ควรมีของในคลัง บังคับกรอกตั้งแต่ SSK-23 (V13) */
  maxStock: number
  status: SupplyStatusCode
  createdAt: string
}

/** body ของ POST และ PUT /api/supplies ส่ง sku เป็น null ให้ server ออกรหัสให้ */
export interface SupplyRequest {
  name: string
  sku: string | null
  category: string
  stock: number
  minStock: number
  maxStock: number
}

/** ตัวเลขสามตัวบนหัวแท็บคลังอุปกรณ์ restockedThisWeek คือจำนวนชิ้นที่เติมในเจ็ดวัน ไม่ใช่จำนวนครั้ง */
export interface SupplySummary {
  totalItems: number
  lowStockItems: number
  restockedThisWeek: number
}

/** รอบของใบแจ้งเตือน ตัวพิมพ์ใหญ่ตาม backend ต่างจาก 'One-time' / 'Monthly' ฝั่งหน้าจอ (SSK-20) */
export type ReminderFrequencyCode = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'

/** ใบแจ้งเตือนตามรอบ ชื่อช่องตรงกับ ReminderDtos.ReminderResponse ฝั่ง backend (SSK-20) */
export interface MaintenanceReminder {
  id: number
  name: string
  frequency: ReminderFrequencyCode
  startDate: string
  /** ครั้งถัดไปที่ server คิดให้ ใบที่พักอยู่ค้างที่ค่าเดิมจนกว่าจะเปิดกลับ */
  nextDueDate: string
  /** nextDueDate < วันนี้ตามเวลาไทย server คิดให้ ไม่ขึ้นกับว่าพักอยู่หรือไม่ */
  overdue: boolean
  /** null คืองานของทั้งตึก ถึงกำหนดแล้วไม่สร้างใบแจ้งซ่อม เพราะใบแจ้งซ่อมต้องมีห้อง */
  roomId: number | null
  roomNumber: string | null
  /** HH:MM หรือ null */
  remindTime: string | null
  priority: MaintenancePriority
  notes: string | null
  active: boolean
  lastTriggeredAt: string | null
}

/** body ของ POST และ PUT /api/reminders บังคับ name, frequency, startDate */
export interface ReminderRequest {
  name: string
  frequency: ReminderFrequencyCode
  startDate: string
  roomId: number | null
  remindTime: string | null
  /** ไม่ส่งมา backend ใช้ MEDIUM */
  priority?: MaintenancePriority
  notes: string | null
}

/** ผลของ POST /api/reminders/run-due */
export interface RunDueResponse {
  createdTickets: number
}

/** ใบเสร็จ ชื่อช่องตรงกับ ReceiptDtos ฝั่ง backend และ docs/api-contract-billing.md */
export type ReceiptStatus = 'PENDING' | 'PAID'

/** usageValue, usageUnit, rate เป็น null สำหรับบรรทัดเหมาจ่าย (ค่าเช่า ค่าส่วนกลาง อินเทอร์เน็ต) */
export interface ReceiptItem {
  item: string
  detail: string | null
  usageValue: number | null
  usageUnit: string | null
  rate: number | null
  amount: number
}

export interface Receipt {
  id: number
  receiptNo: string
  leaseId: number
  roomNumber: string
  tenantName: string
  /** "YYYY-MM" */
  billingMonth: string
  issuedAt: string
  dueDate: string
  status: ReceiptStatus
  items: ReceiptItem[]
  totalAmount: number
  paidAt: string | null
  paymentMethod: string | null
}

/** dueDate ไม่ส่งมา backend ตั้งเป็นวันที่ 5 ของเดือนถัดจาก billingMonth ให้ */
export interface CreateReceiptRequest {
  leaseId: number
  billingMonth: string
  electricUnits: number
  waterUnits: number
  dueDate?: string | null
}

export interface ReceiptQuery {
  leaseId?: number
  status?: ReceiptStatus
  /** "YYYY-MM" */
  month?: string
}
