import { initialsFrom } from '../format'

/**
 * รูปโปรไฟล์วงกลม/มน ที่ยังไม่มีรูปจริง (ไม่มีระบบอัปโหลดรูปผู้เช่า) เลยโชว์
 * ตัวอักษรย่อจากชื่อแทน ใช้ทั้งใน Tenants table และที่อื่นที่ต้องการ avatar
 * placeholder
 */
export function InitialsAvatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = initialsFrom(name)

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[10px] border border-[rgba(238,217,196,0.5)] bg-accent-soft/40 text-xs font-semibold text-brand"
      style={{ width: size, height: size }}
    >
      {initials || '?'}
    </div>
  )
}
