import { useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet } from 'lucide-react'
import { errorMessage, importMeterReadings } from '../api/client'
import type { MeterImportReport } from '../api/types'
import { METER_CSV_MAX_BYTES, METER_CSV_TEMPLATE } from '../domain/meterCsv'
import { displayMonth } from '../domain/roomRate'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { Note, ToneBadge } from '../components/Callout'
import { downloadBlob } from '../lib/downloadFile'

type Step = 1 | 2 | 3
const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: '1. Select file' },
  { step: 2, label: '2. Review rows' },
  { step: 3, label: '3. Complete' },
]

/**
 * นำเข้าค่าน้ำค่าไฟจาก CSV (SSK-166) สามขั้นตามดีไซน์ "Import water & electricity usage" ของ SSK-177
 *
 * ต่างจาก preview ตรงที่การตรวจไฟล์ทำที่ server (dry-run) ไม่ใช่ในเบราว์เซอร์ หน้าจอจะได้เห็นผลตรวจ
 * ชุดเดียวกับที่ server ใช้ตอนบันทึกจริง และแถวที่ผิดแสดงเลขบรรทัดกับเหตุผล ไม่หยุดทั้งไฟล์ที่แถวแรกที่ผิด
 */
export function ImportUsageDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<MeterImportReport | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function chooseFile(chosen: File | null) {
    setError(null)
    setReport(null)
    if (chosen && chosen.size > METER_CSV_MAX_BYTES) {
      setFile(null)
      setError('Choose a CSV file smaller than 1 MB.')
      return
    }
    setFile(chosen)
  }

  async function review() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      setReport(await importMeterReadings(file, true))
      setStep(2)
    } catch (err) {
      setError(errorMessage(err, 'Could not read the file'))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      setReport(await importMeterReadings(file, false, overwrite))
      setStep(3)
      onImported()
    } catch (err) {
      setError(errorMessage(err, 'Could not import the file'))
    } finally {
      setBusy(false)
    }
  }

  const toImport = report ? report.rows.filter((row) => overwrite || !row.alreadyExists).length : 0
  const existing = report ? report.rows.filter((row) => row.alreadyExists).length : 0

  return (
    <Modal
      title="Import water & electricity usage"
      subtitle="Monthly consumption per unit, not cumulative meter readings"
      onClose={onClose}
      width="wide"
    >
      <div className="flex flex-col gap-4 text-sm">
        <ol className="flex">
          {STEPS.map(({ step: s, label }) => (
            <li
              key={s}
              aria-current={s === step ? 'step' : undefined}
              className={`flex-1 border-b-2 pb-2 text-center ${s === step ? 'border-brand font-semibold text-brand' : 'border-card-border text-body-muted'}`}
            >
              {label}
            </li>
          ))}
        </ol>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            {error}
          </p>
        )}

        {step === 1 && (
          <>
            <Note>
              One row per unit and billing month: room_number, month (YYYY-MM), electric_units (kWh), water_units (m³).
              Download the template for the exact column format.
            </Note>
            <div>
              <SecondaryButton
                onClick={() =>
                  downloadBlob('meter-readings-template.csv', new Blob([METER_CSV_TEMPLATE], { type: 'text/csv' }))
                }
              >
                <Download className="ui-icon size-icon-inline" aria-hidden="true" />
                Download template
              </SecondaryButton>
            </div>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink-muted">Choose CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                className="rounded-lg border border-card-border bg-white px-3 py-2.5 text-sm"
              />
              <span className="text-xs text-body-muted">CSV up to 1 MB and 5,000 rows</span>
            </label>
            {file && (
              <p className="flex items-center gap-2 text-ink">
                <FileSpreadsheet className="ui-icon size-icon-inline text-brand" aria-hidden="true" />
                {file.name}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
              <PrimaryButton onClick={review} disabled={!file || busy}>
                {busy ? 'Checking...' : 'Review rows'}
              </PrimaryButton>
            </div>
          </>
        )}

        {step === 2 && report && (
          <>
            <div className="flex flex-wrap gap-2">
              <ToneBadge tone="green">{report.rows.length} valid rows · nothing saved yet</ToneBadge>
              {report.errors.length > 0 && <ToneBadge tone="rose">{report.errors.length} rows with problems</ToneBadge>}
              {existing > 0 && <ToneBadge tone="amber">{existing} already have readings</ToneBadge>}
            </div>
            {report.errors.length > 0 && (
              <ul aria-label="Rows with problems" className="flex flex-col gap-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                {report.errors.map((e) => (
                  <li key={e.line}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="max-h-72 overflow-auto">
              <DataTable
                rows={report.rows}
                rowKey={(row) => row.line}
                headCellClass="border-b border-card-border px-3 py-3 text-xs font-semibold tracking-[0.6px] text-table-label uppercase"
                rowClass="border-t border-row-border"
                cellClass="px-3 py-2.5 text-table-label"
                empty={<p className="py-4 text-center text-body-muted">No valid rows to import.</p>}
                columns={[
                  { key: 'line', header: 'LINE', cell: (row) => row.line },
                  { key: 'room', header: 'UNIT', cell: (row) => row.roomNumber },
                  { key: 'month', header: 'MONTH', cell: (row) => displayMonth(row.month) },
                  { key: 'electric', header: 'ELECTRICITY (kWh)', cell: (row) => row.electricUnits },
                  { key: 'water', header: 'WATER (m³)', cell: (row) => row.waterUnits },
                  {
                    key: 'state',
                    header: 'STATUS',
                    cell: (row) =>
                      row.alreadyExists ? (
                        <ToneBadge tone="amber">{overwrite ? 'Will replace' : 'Will skip'}</ToneBadge>
                      ) : (
                        <ToneBadge tone="green">New</ToneBadge>
                      ),
                  },
                ]}
              />
            </div>
            {existing > 0 && (
              <label className="flex items-center gap-2 text-ink">
                <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                Replace readings that already exist
              </label>
            )}
            <Note>Only the valid rows are saved. Issued invoices are never changed by an import.</Note>
            <div className="flex justify-end gap-3">
              <SecondaryButton onClick={() => setStep(1)} disabled={busy}>
                Back
              </SecondaryButton>
              <PrimaryButton onClick={confirm} disabled={busy || toImport === 0}>
                {busy ? 'Importing...' : `Import ${toImport} rows`}
              </PrimaryButton>
            </div>
          </>
        )}

        {step === 3 && report && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={40} className="text-moss-545" aria-hidden="true" />
            <h3 className="font-heading text-lg text-heading">Import complete</h3>
            <p className="text-body-muted">
              {report.imported} rows saved
              {report.skipped > 0 ? `, ${report.skipped} skipped because readings already existed` : ''}
              {report.errors.length > 0 ? `, ${report.errors.length} rows with problems were not saved` : ''}.
            </p>
            <PrimaryButton onClick={onClose}>View usage</PrimaryButton>
          </div>
        )}
      </div>
    </Modal>
  )
}
