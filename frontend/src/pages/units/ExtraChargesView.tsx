import { useState } from 'react'
import { Plus } from 'lucide-react'
import { errorMessage, fetchExtraCharges, updateExtraCharge } from '../../api/client'
import type { RoomExtraCharge, RoomSummary } from '../../api/types'
import { RECURRENCE_LABEL } from '../../domain/extraCharge'
import { displayMonth } from '../../domain/roomRate'
import { useLoader } from '../../hooks/useLoader'
import { DataTable } from '../../components/DataTable'
import { PrimaryButton, SecondaryButton } from '../../components/Button'
import { LoadingState, ErrorState } from '../../components/PageState'
import { Panel, ToneBadge } from '../../components/Callout'
import { ExtraChargeDialog } from '../../dialogs/ExtraChargeDialog'
import { bahtAmount } from '../../format'

/**
 * แท็บ Extra charges ของหน้า Units (SSK-165) ตามดีไซน์ SSK-177 การ์ด "Room-specific charges"
 * เพิ่มคอลัมน์ PERIOD กับปุ่มปิด/เปิดรายการ เพราะการ์ดต้องการช่วงเดือนและการปิดรายการ
 * ไม่มีปุ่มแก้ยอด เพราะยอดที่ตกลงในสัญญาต้องไม่เปลี่ยน (SSK-180) ถ้ายอดเปลี่ยนให้ปิดอันเดิมแล้วเพิ่มใหม่
 */
export function ExtraChargesView({ rooms }: { rooms: RoomSummary[] }) {
  const charges = useLoader(fetchExtraCharges, 'Could not load the extra charges')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const numberOf = (roomId: number) => rooms.find((r) => r.id === roomId)?.roomNumber ?? '-'

  async function toggle(charge: RoomExtraCharge) {
    setActionError(null)
    setBusyId(charge.id)
    try {
      await updateExtraCharge(charge.roomId, charge.id, {
        label: charge.label,
        amount: charge.amount,
        recurrence: charge.recurrence,
        startMonth: charge.startMonth,
        endMonth: charge.endMonth,
        active: !charge.active,
      })
      charges.reload()
    } catch (error) {
      setActionError(errorMessage(error, 'Could not update the charge'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Panel
        title="Room-specific charges"
        description="Optional charges appear as separate invoice line items."
        actions={
          <PrimaryButton onClick={() => setAdding(true)}>
            <Plus className="ui-icon size-icon-inline" aria-hidden="true" />
            Add charge
          </PrimaryButton>
        }
      >
        <div className="overflow-x-auto px-6 pb-6">
          {actionError && <ErrorState message={actionError} />}
          {charges.error && <ErrorState message={charges.error} />}
          {charges.loading && !charges.data && <LoadingState label="Loading extra charges..." />}
          {charges.data && (
            <DataTable<RoomExtraCharge>
              rows={charges.data}
              rowKey={(charge) => charge.id}
              minWidth={768}
              headCellClass="border-b border-card-border px-4 py-4 text-xs font-semibold tracking-[0.6px] text-table-label uppercase"
              rowClass="border-t border-row-border"
              cellClass="px-4 py-5 text-sm text-table-label"
              empty={<p className="py-6 text-center text-sm text-body-muted">No extra charges yet.</p>}
              columns={[
                { key: 'unit', header: 'UNIT', cellClass: 'font-medium text-heading', cell: (c) => numberOf(c.roomId) },
                { key: 'label', header: 'DESCRIPTION', cell: (c) => c.label },
                { key: 'amount', header: 'AMOUNT', cell: (c) => bahtAmount(c.amount) },
                { key: 'frequency', header: 'FREQUENCY', cell: (c) => RECURRENCE_LABEL[c.recurrence] },
                {
                  key: 'period',
                  header: 'PERIOD',
                  cell: (c) =>
                    c.recurrence === 'ONE_TIME'
                      ? `From ${displayMonth(c.startMonth)}`
                      : `${displayMonth(c.startMonth)} – ${c.endMonth ? displayMonth(c.endMonth) : 'ongoing'}`,
                },
                {
                  key: 'status',
                  header: 'STATUS',
                  cell: (c) => <ToneBadge tone={c.active ? 'green' : 'neutral'}>{c.active ? 'Active' : 'Inactive'}</ToneBadge>,
                },
                {
                  key: 'action',
                  header: 'ACTION',
                  cell: (c) => (
                    <SecondaryButton
                      onClick={() => toggle(c)}
                      disabled={busyId === c.id}
                      aria-label={`${c.active ? 'Deactivate' : 'Reactivate'} ${c.label} for unit ${numberOf(c.roomId)}`}
                    >
                      {c.active ? 'Deactivate' : 'Reactivate'}
                    </SecondaryButton>
                  ),
                },
              ]}
            />
          )}
        </div>
      </Panel>

      {adding && (
        <ExtraChargeDialog rooms={rooms} roomId={rooms[0].id} onClose={() => setAdding(false)} onSaved={charges.reload} />
      )}
    </>
  )
}
