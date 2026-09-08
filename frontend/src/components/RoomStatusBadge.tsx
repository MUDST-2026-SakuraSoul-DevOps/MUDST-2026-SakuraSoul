import type { RoomStatus } from '../api/types'

/**
 * badge สถานะห้อง ก๊อปสีจาก Figma (component "RoomStatus" ใน Unit Page,
 * node 125:2337): เขียว #21c45d = Available, แดง #ef4343 = Occupied
 *
 * ดีไซน์มีแค่สองสี แต่ requirement มีสามสถานะ (README ระบุ ว่าง / มีผู้เช่า /
 * ซ่อมบำรุง) เลยเติมสีส้มของ Maintenance เอง ให้ล้อกับสีเดียวกับที่ใช้ในกริด
 * แดชบอร์ด จะได้ไม่ต้องจำสองชุด
 */
const STYLE: Record<RoomStatus, { label: string; className: string }> = {
  AVAILABLE: { label: 'Available', className: 'bg-status-available' },
  OCCUPIED: { label: 'Occupied', className: 'bg-status-occupied' },
  MAINTENANCE: { label: 'Maintenance', className: 'bg-[#b5533c]' },
}

export function RoomStatusBadge({ status }: { status?: RoomStatus }) {
  if (!status) {
    return <span className="text-sm text-ink-muted">-</span>
  }
  const { label, className } = STYLE[status]
  return (
    <span
      className={`inline-flex h-6 items-center justify-center rounded-full px-3 text-xs font-medium text-[#fafae9] ${className}`}
    >
      {label}
    </span>
  )
}
