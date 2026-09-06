/**
 * รูปร่างข้อมูลที่รับส่งกับ backend
 *
 * ส่วนของห้องกับผู้เช่าตรงกับ endpoint ที่มีอยู่จริงแล้ว ส่วนของสัญญาเช่า (lease)
 * กับงานซ่อม (maintenance) เป็นสัญญาที่ตกลงกันไว้ล่วงหน้า ฝั่ง backend ยังไม่ได้
 * ทำ (README หัวข้อ "ที่ยังไม่มี" ข้อ 1) ฝั่งหน้าเว็บเขียนตามสัญญานี้ไปก่อนแล้ว
 * รันด้วย mock ระหว่างรอ ดู src/api/mockApi.ts และ docs/api-contract-lease.md
 */

/** สถานะห้องที่เอาไปลงสีในแดชบอร์ด */
export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE'

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
  baseRent: number
  status: RoomStatus
  currentLease: LeaseBrief | null
  /** จำนวนใบแจ้งซ่อมที่ยังไม่ปิดของห้องนี้ ใช้ติดป้ายเตือนบนการ์ด */
  openMaintenanceCount: number
}

export interface RoomDetail extends RoomSummary {
  note: string | null
}

export interface Tenant {
  id: number
  fullName: string
  /** บังคับตาม US-03 ใช้ส่งใบเสร็จกับเอกสารสัญญาให้ผู้เช่า */
  email: string
  phone: string
  /** ไม่บังคับ ผู้เช่าบางคนยื่นทีหลังตอนเซ็นสัญญา */
  nationalId: string | null
}

export interface CreateTenantRequest {
  fullName: string
  email: string
  phone: string
  nationalId?: string
}

export interface Lease {
  id: number
  roomId: number
  roomNumber: string
  tenantId: number
  tenantName: string
  startDate: string
  endDate: string | null
  monthlyRent: number
  billingCycle: BillingCycle
  status: LeaseStatus
}

export interface LeaseRequest {
  roomId: number
  tenantId: number
  startDate: string
  endDate: string | null
  monthlyRent: number
  billingCycle: BillingCycle
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
}
