import { fetchStockMovements } from '../api/client'
import type { StockMovement } from '../api/types'
import { MOVEMENT_LABEL } from '../domain/supplyStock'
import { useLoader } from '../hooks/useLoader'
import { Modal } from '../components/Modal'
import { DataTable } from '../components/DataTable'
import { LoadingState, ErrorState } from '../components/PageState'
import { SecondaryButton } from '../components/Button'
import { displayDateTime } from '../format'

/**
 * ประวัติความเคลื่อนไหวของของในคลังหนึ่งชิ้น (SSK-171) เติม เบิกเข้าใบแจ้งซ่อม และปรับยอดด้วยมือ
 * เรียงเก่าไปใหม่ ยอดคงเหลือต่อกันทุกบรรทัด และบรรทัดสุดท้ายเท่ากับยอดปัจจุบันในตาราง
 */
export function StockHistoryDialog({
  item,
  onClose,
}: {
  item: { id: number; name: string; sku: string; stock: number }
  onClose: () => void
}) {
  const movements = useLoader(() => fetchStockMovements(item.id), 'Could not load the stock history', [item.id])

  return (
    <Modal
      title="Stock history"
      subtitle={`${item.name} · ${item.sku}`}
      onClose={onClose}
      width="wide"
      footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}
    >
      {movements.loading && !movements.data && <LoadingState label="Loading history..." />}
      {movements.error && <ErrorState message={movements.error} />}
      {movements.data && (
        <DataTable<StockMovement>
          rows={movements.data}
          rowKey={(m) => `${m.at}-${m.kind}-${m.balanceAfter}`}
          headCellClass="border-b border-card-border px-3 py-3 text-xs font-semibold tracking-[0.6px] text-table-label uppercase"
          rowClass="border-t border-row-border"
          cellClass="px-3 py-2.5 text-sm text-table-label"
          columns={[
            { key: 'when', header: 'DATE', cell: (m) => displayDateTime(m.at) },
            { key: 'kind', header: 'MOVEMENT', cell: (m) => MOVEMENT_LABEL[m.kind] },
            {
              key: 'qty',
              header: 'QUANTITY',
              cell: (m) =>
                m.kind === 'OPENING' ? (
                  m.quantity
                ) : (
                  <span className={m.quantity < 0 ? 'text-alert-600' : 'text-moss-545'}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </span>
                ),
            },
            { key: 'balance', header: 'BALANCE', cellClass: 'font-medium text-ink', cell: (m) => m.balanceAfter },
            { key: 'note', header: 'NOTE', cell: (m) => m.note ?? '-' },
          ]}
        />
      )}
    </Modal>
  )
}
