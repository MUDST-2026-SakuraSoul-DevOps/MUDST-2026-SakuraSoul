/**
 * badge สถานะแบบมีขอบ (ต่างจาก RoomStatusBadge ที่เป็นพื้นทึบ) ก๊อปจาก Tenant
 * Directory (node 1:716 เขียว, 384:1613 ส้ม, 384:1647 แดง) ใช้กับสถานะสัญญา/
 * การจ่ายเงิน: Active (เขียว), Pending (ส้ม), Overdue (แดง)
 */
export type TenantStatus = 'Active' | 'Pending' | 'Overdue'

const STYLES: Record<TenantStatus, string> = {
  Active: 'bg-moss-50 border-moss-120 text-moss-545',
  Pending: 'bg-honey-40 border-honey-95 text-alert-455',
  Overdue: 'bg-blush-100 border-avatar-ring/50 text-wine-700',
}

export function StatusPill({ status }: { status?: TenantStatus }) {
  if (!status) {
    return <span className="text-sm text-ink-muted">-</span>
  }
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium ${STYLES[status]}`}>
      {status}
    </span>
  )
}
