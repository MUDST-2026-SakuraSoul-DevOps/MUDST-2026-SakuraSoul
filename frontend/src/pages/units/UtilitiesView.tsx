import { useState } from 'react'
import { Upload } from 'lucide-react'
import { fetchMeterReadings } from '../../api/client'
import type { MeterReading } from '../../api/types'
import { useLoader } from '../../hooks/useLoader'
import { DataTable } from '../../components/DataTable'
import { PrimaryButton } from '../../components/Button'
import { LoadingState, ErrorState } from '../../components/PageState'
import { Panel, ToneBadge } from '../../components/Callout'
import { ImportUsageDialog } from '../../dialogs/ImportUsageDialog'
import { displayDateTime, todayInBangkok } from '../../format'
import { displayMonth } from '../../domain/roomRate'

/**
 * แท็บ Water & Electricity ของหน้า Units ตามดีไซน์ SSK-177
 * SSK-166: ปุ่มนำเข้า CSV กับตารางหน่วยที่บันทึกไว้ของเดือนที่เลือก (ข้อมูลดิบ ตรวจตัวเลขได้)
 */
export function UtilitiesView() {
  const [month, setMonth] = useState(todayInBangkok().slice(0, 7))
  const [importing, setImporting] = useState(false)
  const readings = useLoader(() => fetchMeterReadings(month), 'Could not load the meter readings', [month])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <PrimaryButton onClick={() => setImporting(true)}>
          <Upload className="ui-icon size-icon-inline" aria-hidden="true" />
          Import usage CSV
        </PrimaryButton>
      </div>

      <Panel
        title="Meter readings"
        description={`Units used per room · ${displayMonth(month)}`}
        actions={
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="min-h-11 rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
        }
      >
        <div className="overflow-x-auto px-6 pb-6">
          {readings.error && <ErrorState message={readings.error} />}
          {readings.loading && !readings.data && <LoadingState label="Loading readings..." />}
          {readings.data && (
            <DataTable<MeterReading>
              rows={readings.data}
              rowKey={(r) => r.id}
              minWidth={640}
              headCellClass="border-b border-card-border px-4 py-4 text-xs font-semibold tracking-[0.6px] text-table-label uppercase"
              rowClass="border-t border-row-border"
              cellClass="px-4 py-4 text-sm text-table-label"
              empty={
                <p className="py-6 text-center text-sm text-body-muted">
                  No readings for {displayMonth(month)}. Import a CSV file to add them.
                </p>
              }
              columns={[
                { key: 'unit', header: 'UNIT', cellClass: 'font-medium text-heading', cell: (r) => r.roomNumber },
                { key: 'electric', header: 'ELECTRICITY (kWh)', cell: (r) => r.electricUnits },
                { key: 'water', header: 'WATER (m³)', cell: (r) => r.waterUnits },
                { key: 'source', header: 'SOURCE', cell: (r) => <ToneBadge>{r.source === 'CSV' ? 'CSV import' : 'Manual'}</ToneBadge> },
                { key: 'when', header: 'SAVED', cell: (r) => displayDateTime(r.importedAt) },
              ]}
            />
          )}
        </div>
      </Panel>

      {importing && <ImportUsageDialog onClose={() => setImporting(false)} onImported={readings.reload} />}
    </div>
  )
}
