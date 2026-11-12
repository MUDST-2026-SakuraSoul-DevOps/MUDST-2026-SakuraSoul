import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import type { MeterImportReport } from '../api/types'
import { METER_CSV_MAX_BYTES, METER_CSV_TEMPLATE } from '../domain/meterCsv'
import { ImportUsageDialog } from './ImportUsageDialog'

/*
  เทสตรงของหน้าต่างนำเข้าค่าน้ำค่าไฟจาก CSV (SSK-166)
  E2E unitUsageImport เดินทางสายหลักไปแล้ว ตรงนี้คุมทางแยก: ไฟล์ใหญ่เกิน server ตอบผิดพลาด
  ทั้งตอนตรวจและตอนบันทึก แถวที่มีค่าเดิมอยู่แล้ว (ข้ามหรือทับ) และปุ่มย้อนกลับ
*/

const importMeterReadings = vi.fn()
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  importMeterReadings: (...args: unknown[]) => importMeterReadings(...args),
}))

const downloadBlob = vi.fn()
vi.mock('../lib/downloadFile', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}))

function report(overrides: Partial<MeterImportReport> = {}): MeterImportReport {
  return {
    dryRun: true,
    rows: [
      { line: 2, roomNumber: '101', month: '2026-10', electricUnits: 120, waterUnits: 8, alreadyExists: false },
      { line: 3, roomNumber: '102', month: '2026-10', electricUnits: 95, waterUnits: 6, alreadyExists: true },
    ],
    errors: [{ line: 4, message: 'Unit 999 does not exist' }],
    imported: 0,
    skipped: 0,
    ...overrides,
  } as MeterImportReport
}

const csv = () => new File(['room_number,month,electric_units,water_units\n101,2026-10,120,8\n'], 'october.csv', { type: 'text/csv' })

function setup() {
  const onClose = vi.fn()
  const onImported = vi.fn()
  const user = userEvent.setup()
  const view = render(<ImportUsageDialog onClose={onClose} onImported={onImported} />)
  const fileInput = view.container.querySelector('input[type=file]') as HTMLInputElement
  return { user, onClose, onImported, fileInput }
}

beforeEach(() => {
  importMeterReadings.mockReset()
  downloadBlob.mockReset()
})

describe('ImportUsageDialog', () => {
  it('downloads the CSV template with the exact header', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: /Download template/ }))

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [name, blob] = downloadBlob.mock.calls[0] as [string, Blob]
    expect(name).toBe('meter-readings-template.csv')
    expect(blob.type).toBe('text/csv')
    expect(await blob.text()).toBe(METER_CSV_TEMPLATE)
  })

  it('refuses a file over 1 MB before sending it anywhere', async () => {
    const { user, fileInput } = setup()
    const big = new File(['x'], 'huge.csv', { type: 'text/csv' })
    Object.defineProperty(big, 'size', { value: METER_CSV_MAX_BYTES + 1 })

    await user.upload(fileInput, big)

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a CSV file smaller than 1 MB.')
    expect(screen.queryByText('huge.csv')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review rows' })).toBeDisabled()
    expect(importMeterReadings).not.toHaveBeenCalled()
  })

  it('shows the server message when the dry run fails and stays on step 1', async () => {
    importMeterReadings.mockRejectedValue(new ApiError(400, 'The CSV header is missing water_units'))
    const { user, fileInput } = setup()

    await user.upload(fileInput, csv())
    await user.click(screen.getByRole('button', { name: 'Review rows' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The CSV header is missing water_units')
    expect(importMeterReadings).toHaveBeenCalledWith(expect.any(File), true)
    expect(screen.getByText('1. Select file')).toHaveAttribute('aria-current', 'step')
  })

  it('reviews rows, lists problems by line and skips existing readings by default', async () => {
    importMeterReadings.mockResolvedValueOnce(report())
    importMeterReadings.mockResolvedValueOnce(report({ dryRun: false, imported: 1, skipped: 1 }))
    const { user, fileInput, onImported } = setup()

    await user.upload(fileInput, csv())
    expect(screen.getByText('october.csv')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review rows' }))

    expect(await screen.findByText('2 valid rows · nothing saved yet')).toBeInTheDocument()
    expect(screen.getByText('1 rows with problems')).toBeInTheDocument()
    expect(screen.getByText('1 already have readings')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Rows with problems' })).toHaveTextContent('Line 4: Unit 999 does not exist')
    expect(screen.getByText('Will skip')).toBeInTheDocument()

    // ไม่ติ๊กทับ แถวที่มีค่าเดิมไม่นับ เหลือนำเข้า 1 แถว
    await user.click(screen.getByRole('button', { name: 'Import 1 rows' }))

    expect(await screen.findByText('Import complete')).toBeInTheDocument()
    expect(importMeterReadings).toHaveBeenLastCalledWith(expect.any(File), false, false)
    expect(screen.getByText(/1 rows saved, 1 skipped because readings already existed, 1 rows with problems were not saved\./)).toBeInTheDocument()
    expect(onImported).toHaveBeenCalledTimes(1)
  })

  it('replaces existing readings when the box is ticked', async () => {
    importMeterReadings.mockResolvedValueOnce(report({ errors: [] }))
    importMeterReadings.mockResolvedValueOnce(report({ dryRun: false, errors: [], imported: 2 }))
    const { user, fileInput, onClose } = setup()

    await user.upload(fileInput, csv())
    await user.click(screen.getByRole('button', { name: 'Review rows' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Replace readings that already exist' }))

    expect(screen.getByText('Will replace')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Import 2 rows' }))

    expect(await screen.findByText('Import complete')).toBeInTheDocument()
    expect(importMeterReadings).toHaveBeenLastCalledWith(expect.any(File), false, true)
    expect(screen.getByText(/^2 rows saved\.$/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View usage' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the review open with a plain message when saving fails without a server reason', async () => {
    // error ที่ไม่ใช่ ApiError (เช่นเน็ตหลุด) ไม่โชว์ข้อความดิบของเบราว์เซอร์ ใช้ข้อความกลางแทน
    importMeterReadings.mockResolvedValueOnce(report({ errors: [] }))
    importMeterReadings.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { user, fileInput, onImported } = setup()

    await user.upload(fileInput, csv())
    await user.click(screen.getByRole('button', { name: 'Review rows' }))
    await user.click(await screen.findByRole('button', { name: 'Import 1 rows' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not import the file')
    expect(screen.getByText('2. Review rows')).toHaveAttribute('aria-current', 'step')
    expect(onImported).not.toHaveBeenCalled()
  })

  it('cannot import when every valid row already exists and nothing is replaced', async () => {
    importMeterReadings.mockResolvedValueOnce(
      report({
        errors: [],
        rows: [{ line: 2, roomNumber: '101', month: '2026-10', electricUnits: 1, waterUnits: 1, alreadyExists: true }],
      } as Partial<MeterImportReport>),
    )
    const { user, fileInput } = setup()

    await user.upload(fileInput, csv())
    await user.click(screen.getByRole('button', { name: 'Review rows' }))

    expect(await screen.findByRole('button', { name: 'Import 0 rows' })).toBeDisabled()
  })

  it('goes back to choosing a file', async () => {
    importMeterReadings.mockResolvedValueOnce(report())
    const { user, fileInput } = setup()

    await user.upload(fileInput, csv())
    await user.click(screen.getByRole('button', { name: 'Review rows' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))

    await waitFor(() => expect(screen.getByText('1. Select file')).toHaveAttribute('aria-current', 'step'))
    expect(screen.getByText('october.csv')).toBeInTheDocument()
  })
})
