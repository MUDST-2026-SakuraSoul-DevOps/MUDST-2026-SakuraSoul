import {
  Building,
  Users,
  AddressBookTabs,
  type Icon,
} from '@phosphor-icons/react'

/**
 * รายการเมนูหลักของ sidebar — เฉพาะหน้าที่เกี่ยวกับ SSK-10 (Tenant Room Lease)
 * หน้าอื่น ๆ (Dashboard, Payments, Maintenance, Appliances) จะเพิ่มเข้ามา
 * ตาม feature branch ของแต่ละคน
 *
 * ไอคอนใช้ชุด Phosphor (@phosphor-icons/react) เพราะดีไซน์ต้นทางใช้ icon set นี้จริง
 */
export interface NavItem {
  label: string
  path: string
  /** ใช้เทียบ prefix กับ location.pathname เพื่อ highlight เมนูตอน active */
  matchPrefix?: boolean
  icon: Icon
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Units', path: '/', icon: Building },
  { label: 'Tenants', path: '/tenants', matchPrefix: true, icon: Users },
  { label: 'Contracts', path: '/contracts', matchPrefix: true, icon: AddressBookTabs },
]
