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

export interface Tenant {
  id: number
  fullName: string
  /** บังคับตาม US-03 ใช้ส่งใบเสร็จกับเอกสารสัญญาให้ผู้เช่า */
  email: string
  phone: string
  /** ไม่บังคับ ผู้เช่าบางคนยื่นทีหลังตอนเซ็นสัญญา */
  nationalId: string | null
  lineId?: string | null
  startDate?: string | null
  endDate?: string | null
  roomType?: string | null
}

export interface CreateTenantRequest {
  fullName: string
  email: string
  phone: string
  nationalId?: string
  lineId?: string
  startDate?: string
  endDate?: string
  roomType?: string
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
  reportedAt: string
  /**
   * ช่างที่รับงาน และคนที่แจ้งซ่อม ใส่เป็น optional เพราะ backend ยังไม่มี
   * endpoint งานซ่อมเลย ถ้าวันหลังของจริงยังไม่ส่งสองฟิลด์นี้ หน้าจอจะขึ้นขีดแทน
   * ไม่พัง ส่วนงานที่ยังไม่มีคนรับ (OPEN) ค่าเป็น null
   */
  assignedTo?: string | null
  reportedBy?: string | null
}
