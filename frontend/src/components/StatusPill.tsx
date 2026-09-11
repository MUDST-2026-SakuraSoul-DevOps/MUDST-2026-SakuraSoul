/**
 * badge สถานะแบบมีขอบ (ต่างจาก RoomStatusBadge ที่เป็นพื้นทึบ) ก๊อปจาก Tenant
 * Directory (node 1:716 เขียว, 384:1613 ส้ม, 384:1647 แดง) ใช้กับสถานะสัญญา/
 * การจ่ายเงิน: Active (เขียว), Pending (ส้ม), Overdue (แดง)
 */
export type TenantStatus = 'Active' | 'Pending' | 'Overdue'

const STYLES: Record<TenantStatus, string> = {
  Active: 'bg-[#e8f5e9] border-[#c8e6c9] text-[#2e7d32]',
  Pending: 'bg-[#fff3e0] border-[#ffe0b2] text-[#e65100]',
  Overdue: 'bg-[#ffdad6] border-[rgba(212,194,195,0.5)] text-[#93000a]',
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
