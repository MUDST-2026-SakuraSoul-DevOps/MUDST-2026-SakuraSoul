import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '../api/client'
import type { SummaryReportResponse, SummaryReportRow } from '../api/types'
import * as files from '../lib/downloadFile'
import { SummaryReportsTab } from './SummaryReportsTab'

const row: SummaryReportRow = { key: '101', label: '101', billed: 9500, received: 5500, outstanding: 4000, rent: 9500, electricAmount: 0, waterAmount: 0, commonAreaFee: 0, internetFee: 0, extraCharges: 0, lateInterest: 0 }
const report: SummaryReportResponse = { groupBy: 'unit', from: '2026-01', to: '2026-12', rows: [row, { ...row, key: '102', label: '102', outstanding: 2000 }], total: row }
afterEach(() => vi.restoreAllMocks())

it('uses the server closing balance instead of adding snapshots across periods', async () => {
  vi.spyOn(api, 'fetchSummaryReport').mockResolvedValue(report)
  render(<SummaryReportsTab />)
  await screen.findByText('Unit 101')
  const label = screen.getAllByText('CLOSING BALANCE').find(element => element.tagName === 'P')!
  expect(within(label.parentElement!).getByText('\u0e3f4,000.00')).toBeInTheDocument()
  expect(within(label.parentElement!).queryByText('\u0e3f6,000.00')).not.toBeInTheDocument()
})

it('requests a fresh server report when the grouping or period changes', async () => {
  const load = vi.spyOn(api, 'fetchSummaryReport').mockResolvedValue(report)
  render(<SummaryReportsTab />)
  await screen.findByText('Unit 101')
  fireEvent.click(screen.getByRole('button', { name: 'Group by Month' }))
  fireEvent.change(screen.getByLabelText('From month'), { target: { value: '2026-05' } })
  await waitFor(() => expect(load).toHaveBeenLastCalledWith({ groupBy: 'month', from: '2026-05', to: expect.any(String) }))
})

/*
  ช่วงตั้งต้นคือทั้งปีตามเวลาไทย ตรึงนาฬิกาไว้ที่ 13 พ.ย. 2026 ช่วงจึงเป็น 2026-01 ถึง 2026-12 ทุกครั้งที่รัน
  ตรึงแค่ Date ตัวจับเวลาของ waitFor ยังเดินตามจริง
*/
describe('SummaryReportsTab periods, empty results and slow requests', () => {
  const zero: SummaryReportRow = { ...row, key: 'total', label: 'Total', billed: 0, received: 0, outstanding: 0, rent: 0 }
  const tenantReport: SummaryReportResponse = {
    groupBy: 'tenant', from: '2026-01', to: '2026-12',
    rows: [{ ...row, key: '3', label: 'Yuki Tanaka' }], total: row,
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-13T03:00:00Z') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says the period has no data when the server returns no rows', async () => {
    const load = vi.spyOn(api, 'fetchSummaryReport').mockResolvedValue({ ...report, rows: [], total: zero })
    render(<SummaryReportsTab />)

    expect(await screen.findByText('No summary data matches the selected period.')).toBeInTheDocument()
    expect(screen.getAllByText('฿0.00')).toHaveLength(3)
    expect(screen.getByText('Period: 2026-01 to 2026-12')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(load.mock.calls).toEqual([[{ groupBy: 'unit', from: '2026-01', to: '2026-12' }]])
  })

  it('asks the server again for the new To month and shows that period', async () => {
    const load = vi.spyOn(api, 'fetchSummaryReport').mockResolvedValue(report)
    render(<SummaryReportsTab />)
    await screen.findByText('Unit 101')

    fireEvent.change(screen.getByLabelText('To month'), { target: { value: '2026-06' } })

    expect(await screen.findByText('Period: 2026-01 to 2026-06')).toBeInTheDocument()
    expect(load.mock.calls).toEqual([
      [{ groupBy: 'unit', from: '2026-01', to: '2026-12' }],
      [{ groupBy: 'unit', from: '2026-01', to: '2026-06' }],
    ])
  })

  it('ignores a failure from a query the admin already replaced with a newer one', async () => {
    let failUnitReport!: (error: Error) => void
    const load = vi.spyOn(api, 'fetchSummaryReport')
      .mockImplementationOnce(() => new Promise((_, reject) => { failUnitReport = reject }))
      .mockResolvedValueOnce(tenantReport)
    render(<SummaryReportsTab />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading summary report...')

    // รายงานแยกห้องยังไม่กลับมา แอดมินสลับไปแยกผู้เช่าแล้ว
    fireEvent.click(screen.getByRole('button', { name: 'Group by Tenant' }))
    expect(await screen.findByText('Yuki Tanaka')).toBeInTheDocument()
    await act(async () => failUnitReport(new Error('Report service unavailable')))

    // ความผิดพลาดของคำขอเก่าห้ามมาทับรายงานที่โชว์อยู่
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Summary by tenant')).toBeInTheDocument()
    expect(load.mock.calls).toEqual([
      [{ groupBy: 'unit', from: '2026-01', to: '2026-12' }],
      [{ groupBy: 'tenant', from: '2026-01', to: '2026-12' }],
    ])
  })

  it('locks Export while the CSV is being prepared, then saves it under the grouping and period', async () => {
    vi.spyOn(api, 'fetchSummaryReport').mockResolvedValue(report)
    const csv = new Blob(['unit,billed'], { type: 'text/csv' })
    let finishExport!: (file: Blob) => void
    const exportCsv = vi.spyOn(api, 'downloadSummaryReportCsv')
      .mockImplementation(() => new Promise((resolve) => { finishExport = resolve }))
    const download = vi.spyOn(files, 'downloadBlob').mockImplementation(() => {})
    const notify = vi.fn()
    render(<SummaryReportsTab onNotify={notify} />)
    await screen.findByText('Unit 101')

    fireEvent.click(screen.getByRole('button', { name: 'Export report' }))
    const exportButton = screen.getByRole('button', { name: 'Export report' })
    expect(exportButton).toHaveTextContent('Exporting...')
    expect(exportButton).toBeDisabled()
    fireEvent.click(exportButton)
    expect(exportCsv).toHaveBeenCalledTimes(1)
    expect(download).not.toHaveBeenCalled()

    await act(async () => finishExport(csv))

    expect(exportButton).toHaveTextContent('Export report')
    expect(exportButton).toBeEnabled()
    expect(exportCsv.mock.calls).toEqual([[{ groupBy: 'unit', from: '2026-01', to: '2026-12' }]])
    expect(download.mock.calls).toEqual([['summary-unit-2026-01-2026-12.csv', csv]])
    expect(notify.mock.calls).toEqual([['Report exported by unit with current filters']])
  })
})
