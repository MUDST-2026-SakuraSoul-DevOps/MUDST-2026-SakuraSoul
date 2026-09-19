import {
  SquaresFour,
  Building,
  Users,
  MoneyWavy,
  Wrench,
  AddressBookTabs,
  AppWindow,
  type Icon,
} from '@phosphor-icons/react'

/**
 * รายการเมนูหลักของ sidebar — ก๊อปมาจากดีไซน์ Figma ตรง ๆ (node 119:2395,
 * component "SideNavBar/Default/Default") ทั้ง label และลำดับ ห้ามแปลเป็นไทย
 * เพราะดีไซน์ตั้งใจใช้ label ภาษาอังกฤษ
 *
 * ไอคอนใช้ชุด Phosphor (@phosphor-icons/react) เพราะดีไซน์ต้นทางใช้ icon set
 * นี้จริง (ชื่อ node ตรงกับชื่อไอคอนใน Phosphor: SquaresFour, Building, Users,
 * MoneyWavy, Wrench, AddressBookTabs, AppWindow) แก้เมนู/เพิ่มหน้าใหม่ที่ไฟล์นี้
 * ที่เดียว
 */
export interface NavItem {
  label: string
  path: string
  /** ใช้เทียบ prefix กับ location.pathname เพื่อ highlight เมนูตอน active */
  matchPrefix?: boolean
  icon: Icon
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: SquaresFour },
  { label: 'Units', path: '/units', matchPrefix: true, icon: Building },
  { label: 'Tenants', path: '/tenants', matchPrefix: true, icon: Users },
  { label: 'Payments', path: '/payments', matchPrefix: true, icon: MoneyWavy },
  { label: 'Maintenance', path: '/maintenance', matchPrefix: true, icon: Wrench },
  { label: 'Contracts', path: '/contracts', matchPrefix: true, icon: AddressBookTabs },
  { label: 'Appliances', path: '/appliances', matchPrefix: true, icon: AppWindow },
]
