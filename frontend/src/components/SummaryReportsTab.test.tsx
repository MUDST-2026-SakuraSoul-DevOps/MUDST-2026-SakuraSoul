import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '../api/client'
import type { SummaryReportResponse, SummaryReportRow } from '../api/types'
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
