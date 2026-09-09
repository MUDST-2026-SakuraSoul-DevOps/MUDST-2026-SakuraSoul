/**
 * badge สถานะห้อง ก๊อปสีจาก Figma (component "RoomStatus" ใน Unit Page,
 * node 125:2337): เขียว #21c45d = Available, แดง #ef4343 = Occupied
 *
 * backend ยังไม่มีฟิลด์สถานะห้อง (ต้องมีตาราง lease ก่อน — README หัวข้อ
 * "ที่ยังไม่มี" ข้อ 1) เลยรับ status เป็น optional ถ้าไม่ส่งมาจะโชว์ "-" แทน
 */
export type RoomStatus = 'Available' | 'Occupied'

export function RoomStatusBadge({ status }: { status?: RoomStatus }) {
  if (!status) {
    return <span className="text-sm text-ink-muted">-</span>
  }
  const isAvailable = status === 'Available'
  return (
    <span
      className={`inline-flex h-6 items-center justify-center rounded-full px-3 text-xs font-medium text-[#fafae9] ${
        isAvailable ? 'bg-status-available' : 'bg-status-occupied'
      }`}
    >
      {status}
    </span>
  )
}
