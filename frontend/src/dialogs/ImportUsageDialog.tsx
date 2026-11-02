import { useState, type ChangeEvent } from 'react'
import { Download, FileSpreadsheet, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import {
  parseUsageCsv,
  sampleUsageCsv,
  downloadCsvFile,
  saveImportedUsage,
  getImportedUsage,
  type UsageRow,
} from '../domain/unitsPhase2'

interface ImportUsageDialogProps {
  isOpen: boolean
  onClose: () => void
  onImported?: (count: number) => void
}

export function ImportUsageDialog({ isOpen, onClose, onImported }: ImportUsageDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [csvContent, setCsvContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<UsageRow[]>([])

  if (!isOpen) return null

  function handleDownloadTemplate() {
    downloadCsvFile('utility-template.csv', sampleUsageCsv)
  }

  function handleUseSampleFile() {
    setCsvContent(sampleUsageCsv)
    setFileName('sample-usage.csv')
    setError(null)
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setError('Choose a CSV smaller than 2 MB.')
      setCsvContent('')
      return
    }

    try {
      const text = await file.text()
      setFileName(file.name)
      setCsvContent(text)
    } catch {
      setError('Could not read the selected file. Please choose it again.')
    }
  }

  function handleReviewRows() {
    if (!csvContent) {
      setError('Please choose a CSV file or load sample data first.')
      return
    }

    try {
      const parsed = parseUsageCsv(csvContent)
      setPreviewRows(parsed)
      setStep(2)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid CSV format.')
    }
  }

  function handleConfirmImport() {
    const existing = getImportedUsage()
    // Merge: replace existing rows for same room and month
    const updated = [
      ...existing.filter(
        (e) => !previewRows.some((p) => p.room === e.room && p.month === e.month),
      ),
      ...previewRows,
    ]
    saveImportedUsage(updated)
    setStep(3)
    onImported?.(previewRows.length)
  }

  return (
    <Modal
      title="Import water & electricity usage"
      subtitle="Monthly consumption for utility billing and trend tracking"
      onClose={onClose}
      width="wide"
    >
      <div className="flex flex-col gap-4 text-xs font-sans">
        {/* Step progress pills */}
        <div className="flex items-center gap-2 border-b border-sand-80 pb-3">
          <span
            className={`rounded-full px-3 py-1 font-semibold text-[11px] ${
              step === 1 ? 'bg-accent-soft text-brand' : 'bg-sand-60 text-body-muted'
            }`}
          >
            1. Select file
          </span>
          <span className="text-body-muted/60">›</span>
          <span
            className={`rounded-full px-3 py-1 font-semibold text-[11px] ${
              step === 2 ? 'bg-accent-soft text-brand' : 'bg-sand-60 text-body-muted'
            }`}
          >
            2. Review rows
          </span>
          <span className="text-body-muted/60">›</span>
          <span
            className={`rounded-full px-3 py-1 font-semibold text-[11px] ${
              step === 3 ? 'bg-accent-soft text-brand' : 'bg-sand-60 text-body-muted'
            }`}
          >
            3. Complete
          </span>
        </div>

        {/* Step 1: Select file */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-avatar-ring/60 bg-sand-60/40 p-3.5 text-xs text-ink flex items-start gap-2.5">
              <Info size={16} className="text-brand shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                One row per room and billing month. Water consumption in m³, electricity in kWh. Download the template below for the exact four-column format.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 rounded-lg border border-avatar-ring bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-sand-60 transition"
              >
                <Download size={14} />
                Download template
              </button>
              <button
                type="button"
                onClick={handleUseSampleFile}
                className="flex items-center gap-1.5 rounded-lg border border-sand-80 bg-sand-60/60 px-3 py-2 text-xs font-semibold text-ink hover:bg-sand-60 transition"
              >
                Use sample file
              </button>
            </div>

            <div>
              <label className="block font-medium text-ink mb-1.5">
                Choose CSV file
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="Choose CSV file"
                onChange={handleFileChange}
                className="w-full rounded-lg border border-sand-80 bg-white p-2 text-xs text-ink file:mr-3 file:rounded-md file:border-0 file:bg-sand-60 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-brand"
              />
              <p className="text-[10px] text-body-muted mt-1">
                CSV up to 2 MB. Supported rooms: 101–112, 201–212 for the year 2026.
              </p>
            </div>

            {fileName && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200/60 p-2.5 text-emerald-800 text-xs font-medium">
                <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
                <span>Selected: <strong>{fileName}</strong></span>
              </div>
            )}

            {error && (
              <p className="text-rose-600 text-xs flex items-center gap-1" role="alert">
                <AlertCircle size={14} />
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-sand-80">
              <SecondaryButton type="button" onClick={onClose}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                type="button"
                disabled={!csvContent}
                onClick={handleReviewRows}
              >
                Review rows
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* Step 2: Review rows */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                {previewRows.length} valid rows · Ready to import
              </span>
              <span className="text-[11px] text-body-muted">
                No rows saved yet
              </span>
            </div>

            <div className="max-h-60 overflow-auto rounded-xl border border-avatar-ring/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-sand-60 sticky top-0 border-b border-sand-80">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold text-ink">ROOM</th>
                    <th className="py-2.5 px-3 font-semibold text-ink">BILLING MONTH</th>
                    <th className="py-2.5 px-3 font-semibold text-ink">WATER (m³)</th>
                    <th className="py-2.5 px-3 font-semibold text-ink">ELECTRICITY (kWh)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-80/60 bg-white">
                  {previewRows.map((row, idx) => (
                    <tr key={`${row.room}-${row.month}-${idx}`} className="hover:bg-sand-60/30">
                      <td className="py-2 px-3 font-medium text-ink">Unit {row.room}</td>
                      <td className="py-2 px-3 text-body-muted">{row.month}</td>
                      <td className="py-2 px-3 font-semibold text-sky-700">{row.water} m³</td>
                      <td className="py-2 px-3 font-semibold text-amber-700">{row.electricity} kWh</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-body-muted">
              Note: Existing records for the same room and billing month will be updated. Previously issued invoices remain unchanged.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-sand-80">
              <SecondaryButton type="button" onClick={() => setStep(1)}>
                Back
              </SecondaryButton>
              <PrimaryButton type="button" onClick={handleConfirmImport}>
                Import {previewRows.length} rows
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-ink">Import Complete</h3>
              <p className="text-xs text-body-muted mt-1">
                Successfully processed <strong>{previewRows.length}</strong> usage records into the system.
              </p>
            </div>
            <div className="pt-2">
              <PrimaryButton type="button" onClick={onClose}>
                View usage charts
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
