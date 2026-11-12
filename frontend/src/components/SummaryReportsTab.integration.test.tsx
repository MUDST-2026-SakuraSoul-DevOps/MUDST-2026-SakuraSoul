import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as api from '../api/client'
import * as files from '../lib/downloadFile'
import type { SummaryReportResponse, SummaryReportRow } from '../api/types'
import { SummaryReportsTab } from './SummaryReportsTab'

const row: SummaryReportRow = { key: '101', label: 'Live tenant', billed: 500, received: 100, outstanding: 400, rent: 500, electricAmount: 0, waterAmount: 0, commonAreaFee: 0, internetFee: 0, extraCharges: 0, lateInterest: 0 }
const report: SummaryReportResponse = { groupBy: 'unit', from: '2026-01', to: '2026-12', rows: [row], total: row }
afterEach(() => vi.restoreAllMocks())

describe('summary report server integration', () => {
  it('hides stale data after an invalid range and clears the error after recovery', async () => {
    const load = vi.spyOn(api, 'fetchSummaryReport').mockResolvedValueOnce(report).mockRejectedValueOnce(new Error('Invalid range')).mockResolvedValue(report)
    render(<SummaryReportsTab />)
    await screen.findByText('Unit Live tenant')
    fireEvent.change(screen.getByLabelText('From month'), { target: { value: '2027-01' } })
    expect(screen.queryByText('Unit Live tenant')).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid range')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('From month'), { target: { value: '2026-02' } })
    await screen.findByText('Unit Live tenant')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(load).toHaveBeenLastCalledWith({ groupBy: 'unit', from: '2026-02', to: expect.any(String) })
  })

  it('downloads exactly one server CSV with the currently selected grouping', async () => {
    vi.spyOn(api, 'fetchSummaryReport').mockResolvedValue(report)
    const csv = new Blob(['server csv'], { type: 'text/csv' })
    const exportCsv = vi.spyOn(api, 'downloadSummaryReportCsv').mockResolvedValue(csv)
    const download = vi.spyOn(files, 'downloadBlob').mockImplementation(() => {})
    const notify = vi.fn()
    render(<SummaryReportsTab onNotify={notify} />)
    await screen.findByText('Unit Live tenant')
    fireEvent.click(screen.getByRole('button', { name: 'Group by Tenant' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export report' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Export report' }))
    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(exportCsv).toHaveBeenCalledWith({ groupBy: 'tenant', from: expect.any(String), to: expect.any(String) })
    expect(download).toHaveBeenCalledWith(expect.stringMatching(/^summary-tenant-.*\.csv$/), csv)
    expect(notify).toHaveBeenCalledOnce()
  })

  it('does not announce a successful export when the server rejects it', async () => {
    vi.spyOn(api, 'fetchSummaryReport').mockResolvedValue(report)
    vi.spyOn(api, 'downloadSummaryReportCsv').mockRejectedValue(new Error('Export failed'))
    const notify = vi.fn()
    render(<SummaryReportsTab onNotify={notify} />)
    await screen.findByText('Unit Live tenant')
    fireEvent.click(screen.getByRole('button', { name: 'Export report' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed')
    expect(notify).not.toHaveBeenCalled()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export report' })).toBeEnabled()
  })
})
