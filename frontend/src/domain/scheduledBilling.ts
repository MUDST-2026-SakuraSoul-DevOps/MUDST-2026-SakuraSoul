/**
 * ค่าตั้งเวลาออกบิลของหน้า Payments (SSK-130) ตอนนี้เป็นแบบจำลองที่เก็บในเบราว์เซอร์
 * ยังไม่มีงานฝั่ง backend รันตามค่านี้ (งานต่อคือ SSK-143)
 *
 * แยกออกมาจาก ScheduledBillingDialog เพราะไฟล์ component ที่ export ค่าคงที่ด้วย
 * ทำให้ fast refresh ของ Vite ใช้ไม่ได้ (eslint react-refresh/only-export-components)
 */
export interface ScheduledBillingConfig {
  enabled: boolean
  scheduleType: 'MONTHLY_RECURRING' | 'ONE_TIME'
  dayOfMonth: number
  dispatchTime: string
  targetAudience: 'ALL_ACTIVE' | 'PENDING_ONLY'
  sendEmail: boolean
  sendLine?: boolean
  sendSms: boolean
  attachPdf: boolean
  advanceNoticeDays: number
}

/*
  SSK-141 ค่าเริ่มต้นต้องปิดไว้ เดิมเป็น true เครื่องที่เปิดครั้งแรกจะขึ้น Auto-Billing Active
  ทั้งที่ไม่มีอะไรส่งเลย ทั้ง dialog และหน้า Payments ใช้ค่าชุดนี้ชุดเดียว ไม่ต้องประกาศซ้ำอีกที่
*/
export const DEFAULT_SCHEDULE_CONFIG: ScheduledBillingConfig = {
  enabled: false,
  scheduleType: 'MONTHLY_RECURRING',
  dayOfMonth: 25,
  dispatchTime: '09:00',
  targetAudience: 'ALL_ACTIVE',
  sendEmail: true,
  sendLine: false,
  sendSms: false,
  attachPdf: true,
  advanceNoticeDays: 5,
}
