import { CalendarPlus } from 'lucide-react'
import { fetchMaintenancePredictions } from '../../api/client'
import type { MaintenancePrediction, PredictionConfidence } from '../../api/types'
import { CONFIDENCE_LABEL, MIN_OCCURRENCES } from '../../domain/maintenancePrediction'
import { useLoader } from '../../hooks/useLoader'
import { DataTable } from '../../components/DataTable'
import { LoadingState, ErrorState } from '../../components/PageState'
import { daysUntil, displayDate } from '../../format'

const CONFIDENCE_CLASS: Record<PredictionConfidence, string> = {
  HIGH: 'bg-moss-50 text-moss-545',
  MEDIUM: 'bg-honey-20 text-honey-615',
  LOW: 'bg-blush-50 text-wine-630',
}

/** ภายในกี่วันถึงนับว่าใกล้ถึงกำหนด ตามการ์ด DUE SOON ของดีไซน์ SSK-177 */
const DUE_SOON_DAYS = 14

/**
 * คำแนะนำรอบซ่อมครั้งถัดไป (SSK-173 โบนัส) ในแท็บ Schedule & Reminder ตามดีไซน์ SSK-177
 *
 * เป็นข้อเสนอเท่านั้น ไม่เปิดใบแจ้งซ่อมเอง ปุ่มในแต่ละแถวเปิดฟอร์ม Add Reminder ที่เติมค่าให้ แอดมินยืนยันเอง
 * ป้ายความมั่นใจมี title บอกวิธีคิด ชี้แล้วเห็นว่ามาจากกี่ครั้งและห่างกันกี่วัน
 */
export function SuggestedMaintenance({ onUse }: { onUse: (prediction: MaintenancePrediction) => void }) {
  const predictions = useLoader(fetchMaintenancePredictions, 'Could not load the maintenance suggestions')
  const rows = predictions.data ?? []
  const dueSoon = rows.filter((p) => daysUntil(p.predictedDate) <= DUE_SOON_DAYS).length

  return (
    <section aria-label="Suggested maintenance" className="flex flex-col gap-4">
      <p className="rounded-[7px] border border-sidebar-border bg-sidebar px-4 py-3 text-xs leading-[1.7] text-body-muted">
        Bonus · Offline rule-based forecast: last completed job + the median gap between earlier jobs of the same type in
        the same unit. No AI or external service. Suggestions need your review before a reminder is created.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'DUE SOON', value: String(dueSoon), hint: `Within the next ${DUE_SOON_DAYS} days` },
          { label: 'SUGGESTIONS', value: String(rows.length), hint: `Units with ${MIN_OCCURRENCES}+ completed jobs of a type` },
          { label: 'FORECAST METHOD', value: 'Median interval', hint: 'Same history always gives the same date' },
        ].map((card) => (
          <div key={card.label} className="flex flex-col gap-1 rounded-lg border border-honey-140/50 bg-white p-5">
            <p className="text-xs font-medium tracking-[0.6px] text-body-muted">{card.label}</p>
            <p className="font-heading text-2xl text-heading">{card.value}</p>
            <p className="text-xs text-body-muted">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-honey-140/50 bg-white">
        <div className="border-b border-honey-140/30 bg-sidebar px-6 py-5">
          <h3 className="font-heading text-2xl text-ink">Suggested maintenance</h3>
          <p className="text-xs text-body-muted">Based on completed work history</p>
        </div>
        {predictions.loading && !predictions.data && <LoadingState label="Loading suggestions..." />}
        {predictions.error && <ErrorState message={predictions.error} />}
        {predictions.data && (
          <div className="overflow-x-auto">
            <DataTable<MaintenancePrediction>
              rows={rows}
              rowKey={(p) => `${p.roomId}-${p.maintenanceType}`}
              minWidth={860}
              headCellClass="px-6 py-4 text-xs font-medium tracking-[1.2px] text-ink-muted uppercase"
              rowClass="border-t border-honey-140/30"
              cellClass="px-6 py-4 text-sm text-ink-muted"
              empty={
                <p className="px-6 py-6 text-center text-sm text-body-muted">
                  Not enough history yet. A suggestion appears once a unit has the same type of job closed at least{' '}
                  {MIN_OCCURRENCES} times.
                </p>
              }
              columns={[
                {
                  key: 'asset',
                  header: 'JOB / UNIT',
                  cell: (p) => (
                    <span className="font-medium text-ink">
                      {p.maintenanceType} · Unit {p.roomNumber}
                    </span>
                  ),
                },
                { key: 'last', header: 'LAST COMPLETED', cell: (p) => displayDate(p.lastDate) },
                { key: 'interval', header: 'INTERVAL', cell: (p) => `${p.medianIntervalDays} days` },
                {
                  key: 'date',
                  header: 'SUGGESTED DATE',
                  cell: (p) => (
                    <span className="inline-flex items-center gap-2">
                      <span className="rounded-sm border border-dashed border-brand px-2 py-0.5 text-brand">
                        {displayDate(p.predictedDate)}
                      </span>
                      {daysUntil(p.predictedDate) <= DUE_SOON_DAYS && (
                        <span className="rounded-sm bg-honey-20 px-2 py-0.5 text-xs text-honey-615">Due soon</span>
                      )}
                    </span>
                  ),
                },
                {
                  key: 'confidence',
                  header: 'CONFIDENCE',
                  cell: (p) => (
                    <span
                      title={`Median of ${p.sampleSize - 1} gaps between ${p.sampleSize} completed jobs. Confidence comes from how much the gaps vary.`}
                      className={`rounded-sm px-2 py-1 text-xs font-medium ${CONFIDENCE_CLASS[p.confidence]}`}
                    >
                      {CONFIDENCE_LABEL[p.confidence]} · {p.sampleSize} jobs
                    </span>
                  ),
                },
                {
                  key: 'action',
                  header: 'ACTION',
                  cell: (p) => (
                    <button
                      type="button"
                      onClick={() => onUse(p)}
                      aria-label={`Create reminder from suggestion for ${p.maintenanceType} in unit ${p.roomNumber}`}
                      className="icon-button text-ink-muted hover:text-ink"
                    >
                      <CalendarPlus aria-hidden="true" className="ui-icon size-icon-control" />
                    </button>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    </section>
  )
}
