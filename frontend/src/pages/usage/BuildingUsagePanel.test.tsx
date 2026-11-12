import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../../api/client'
import * as files from '../../lib/downloadFile'
import { monthsBetween } from '../../domain/usage'
import type { BuildingUsageChange, BuildingUsagePoint, BuildingUsageReport, BuildingUsageRequest } from '../../api/types'
import { BuildingUsagePanel } from './BuildingUsagePanel'

/**
 * SSK-181: ภาพรวมการใช้น้ำไฟทั้งตึก (หน้า Usage โหมดทั้งตึก)
 *
 * ล็อกวันที่ไว้ที่ 13 พ.ย. 2026 ช่วงตั้งต้น (12 เดือนล่าสุด) จึงเป็น พ.ย. 2025 ถึง ต.ค. 2026
 * ข้อมูลตัวอย่าง: มี.ค. 2026 ไม่มีข้อมูลเลย เม.ย. 2026 มีข้อมูล 17 จาก 18 ห้องที่มีผู้เช่า
 * ผลรวมไฟ 12,300 kWh จาก 11 เดือน (เฉลี่ย 1,118.18) สูงสุด ก.ค. 2026 1,400 · ผลรวมน้ำ 949 m³
 */
const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const ELECTRIC = [1200, 1100, 1000, 900, null, 950, 1000, 1300, 1400, 1250, 1150, 1050]
const WATER = [90, 85, 80, 75, null, 78, 82, 95, 100, 92, 88, 84]
const NONE: BuildingUsageChange = { previous: null, difference: null, percent: null }

function monthPoint(period: string): BuildingUsagePoint {
  const i = MONTHS.indexOf(period)
  const electric = i >= 0 ? ELECTRIC[i] : null
  const water = i >= 0 ? WATER[i] : null
  const nov = period === '2025-11'
  return {
    period,
    electricUnits: electric,
    waterUnits: water,
    electricAmount: electric === null ? null : electric * 8,
    waterAmount: water === null ? null : water * 20,
    occupiedRooms: i >= 0 ? 18 : 0,
    roomsWithData: period === '2026-04' ? 17 : electric === null ? 0 : 18,
    roomsWithAmount: electric === null ? 0 : 18,
    monthsWithData: electric === null ? 0 : 1,
    months: 1,
    yoy: {
      previousPeriod: `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`,
      previousMonthsWithData: nov ? 1 : 0,
      comparedMonths: nov ? 1 : 0,
      electricUnits: nov ? { previous: 1000, difference: 200, percent: 20 } : NONE,
      waterUnits: nov ? { previous: 100, difference: -10, percent: -10 } : NONE,
      electricAmount: NONE,
      waterAmount: NONE,
    },
  }
}

function summaryOf(points: BuildingUsagePoint[], months: number): BuildingUsageReport['summary'] {
  const sum = (pick: (p: BuildingUsagePoint) => number | null) => {
    const values = points.map(pick).filter((v): v is number => v !== null)
    return values.length ? values.reduce((a, b) => a + b, 0) : null
  }
  const withData = points.filter((p) => p.electricUnits !== null)
  const monthsWithData = withData.reduce((n, p) => n + p.monthsWithData, 0)
  const peak = (pick: (p: BuildingUsagePoint) => number | null) =>
    withData.reduce<{ period: string; units: number } | null>((best, p) => {
      const units = pick(p) as number
      return best === null || units > best.units ? { period: p.period, units } : best
    }, null)
  const electric = sum((p) => p.electricUnits)
  const water = sum((p) => p.waterUnits)
  return {
    electricUnits: electric,
    waterUnits: water,
    electricAmount: sum((p) => p.electricAmount),
    waterAmount: sum((p) => p.waterAmount),
    monthsWithData,
    months,
    averageElectricUnitsPerMonth: electric === null ? null : Math.round((electric / monthsWithData) * 100) / 100,
    averageWaterUnitsPerMonth: water === null ? null : Math.round((water / monthsWithData) * 100) / 100,
    peakElectric: peak((p) => p.electricUnits),
    peakWater: peak((p) => p.waterUnits),
  }
}

function report(query: BuildingUsageRequest): BuildingUsageReport {
  const months = monthsBetween(query.from, query.to)
  const monthly = months.map(monthPoint)
  const points: BuildingUsagePoint[] =
    query.granularity === 'year'
      ? [...new Set(months.map((m) => m.slice(0, 4)))].map((year) => {
          const ofYear = monthly.filter((p) => p.period.startsWith(year))
          const s = summaryOf(ofYear, ofYear.length)
          return {
            period: year,
            electricUnits: s.electricUnits,
            waterUnits: s.waterUnits,
            electricAmount: s.electricAmount,
            waterAmount: s.waterAmount,
            occupiedRooms: 18,
            roomsWithData: 18,
            roomsWithAmount: 18,
            monthsWithData: s.monthsWithData,
            months: ofYear.length,
            yoy: null,
          }
        })
      : monthly
  return {
    from: query.from,
    to: query.to,
    metric: 'both',
    granularity: query.granularity ?? 'month',
    compare: query.compare ? 'yoy' : null,
    totalRooms: 24,
    points,
    summary: summaryOf(points, months.length),
  }
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <BuildingUsagePanel />
    </MemoryRouter>,
  )
}

function bodyRows(): string[][] {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
  return rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent ?? ''))
}

function card(label: string): HTMLElement {
  return screen.getByText(label, { selector: 'p' }).parentElement as HTMLElement
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-13T05:00:00Z') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('BuildingUsagePanel', () => {
  it('loads the last 12 months by month with last year to compare, and shows the totals, the table and the incomplete month', async () => {
    const load = vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => report(q))
    renderPanel()

    expect(await within(await waitFor(() => card('Electricity usage'))).findByText('12,300 kWh')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith({ from: '2025-11', to: '2026-10', granularity: 'month', compare: true })
    expect(screen.getByRole('button', { name: 'Last 12 months' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(card('Electricity usage')).getByText('฿98,400.00 billed · Nov 2025 – Oct 2026')).toBeInTheDocument()
    expect(within(card('Monthly average')).getByText('1,118.18 kWh')).toBeInTheDocument()
    expect(within(card('Monthly average')).getByText('11 of 12 months have data')).toBeInTheDocument()
    expect(within(card('Peak month')).getByText('Jul 2026')).toBeInTheDocument()
    expect(within(card('Peak month')).getByText('1,400 kWh')).toBeInTheDocument()

    const rows = bodyRows()
    expect(rows).toHaveLength(12)
    expect(rows[0]).toEqual(['Nov 2025', '1,200', '9,600.00', '18 / 18', '+200 (+20%)'])
    expect(rows[4]).toEqual(['Mar 2026', 'No data', '-', '0 / 18', '-'])
    expect(rows[5]).toEqual(['Apr 2026', '950', '7,600.00', '17 / 18 (incomplete)', '-'])
    // เดือนที่ไม่มีข้อมูลเลย (มี.ค.) เป็นช่องว่าง ไม่ถูกนับเป็นเดือนที่ข้อมูลไม่ครบ
    expect(
      screen.getByText(
        'Incomplete data (hollow points): Apr 2026 17 of 18 occupied units. These months add up only the units that have a reading or a bill.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Electricity usage for the whole building, Nov 2025 – Oct 2026' })).toBeInTheDocument()
  })

  it('switches to water using the same answer, without asking the server again', async () => {
    const load = vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => report(q))
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('12,300 kWh')

    await user.click(screen.getByRole('button', { name: 'Water' }))

    expect(screen.getByRole('button', { name: 'Water' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(card('Water usage')).getByText('949 m³')).toBeInTheDocument()
    expect(within(card('Water usage')).getByText('฿18,980.00 billed · Nov 2025 – Oct 2026')).toBeInTheDocument()
    expect(within(card('Monthly average')).getByText('86.27 m³')).toBeInTheDocument()
    expect(bodyRows()[0]).toEqual(['Nov 2025', '90', '1,800.00', '18 / 18', '-10 (-10%)'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('asks for the range of each shortcut, and "All years" hides the years before the first month with data', async () => {
    const load = vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => report(q))
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('12,300 kWh')

    await user.click(screen.getByRole('button', { name: 'This year' }))
    await waitFor(() => expect(load).toHaveBeenLastCalledWith({ from: '2026-01', to: '2026-11', granularity: 'month', compare: true }))
    expect(screen.getByRole('button', { name: 'This year' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Last 12 months' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'All years' }))
    await waitFor(() => expect(load).toHaveBeenLastCalledWith({ from: '2017-01', to: '2026-11', granularity: 'month', compare: true }))
    await waitFor(() => expect(bodyRows()).toHaveLength(12))
    const rows = bodyRows()
    expect(rows[0][0]).toBe('Nov 2025')
    expect(rows[11][0]).toBe('Oct 2026')
  })

  it('takes a hand-picked month and drops the shortcut highlight', async () => {
    const load = vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => report(q))
    renderPanel()
    await screen.findByText('12,300 kWh')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-06' } })

    await waitFor(() => expect(load).toHaveBeenLastCalledWith({ from: '2025-06', to: '2026-10', granularity: 'month', compare: true }))
    for (const name of ['Last 12 months', 'This year', 'All years']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('shows yearly totals as bars, with how many months of each year have data', async () => {
    const load = vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => report(q))
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByText('12,300 kWh')

    await user.click(screen.getByRole('button', { name: 'Yearly' }))

    await waitFor(() => expect(load).toHaveBeenLastCalledWith({ from: '2025-11', to: '2026-10', granularity: 'year', compare: true }))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'YEAR' })).toBeInTheDocument())
    expect(bodyRows()).toEqual([
      ['2025', '2,300', '18,400.00', '2 / 2', '-'],
      ['2026', '10,000', '80,000.00', '9 / 10', '-'],
    ])
    expect(container.querySelectorAll('rect')).toHaveLength(2)
    expect(within(card('Peak year')).getByText('2026')).toBeInTheDocument()
    expect(screen.queryByText(/Incomplete data/)).not.toBeInTheDocument()
  })

  it('compares the years on a January to December axis, one line per year, from the same monthly answer', async () => {
    const load = vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => report(q))
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('12,300 kWh')

    await user.click(screen.getByRole('button', { name: 'Compare years' }))

    expect(screen.getByRole('img', { name: 'Electricity usage by year, Nov 2025 – Oct 2026' })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['2025', '2026'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('exports the CSV of the current range and view from the server', async () => {
    vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => report(q))
    const csv = new Blob(['period\r\n'], { type: 'text/csv' })
    const download = vi.spyOn(api, 'downloadBuildingUsageCsv').mockResolvedValue(csv)
    const save = vi.spyOn(files, 'downloadBlob').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('12,300 kWh')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    expect(download).toHaveBeenCalledWith({ from: '2025-11', to: '2026-10', granularity: 'month', compare: true })
    await waitFor(() => expect(save).toHaveBeenCalledWith('building-usage-month-2025-11-2026-10.csv', csv))
  })

  it('says why the export failed and saves nothing', async () => {
    vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => report(q))
    vi.spyOn(api, 'downloadBuildingUsageCsv').mockRejectedValue(new api.ApiError(400, 'The range can be at most 10 years'))
    const save = vi.spyOn(files, 'downloadBlob').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('12,300 kWh')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    expect(await screen.findByText('The range can be at most 10 years')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('tells the user where to import readings when the range has no data', async () => {
    vi.spyOn(api, 'fetchBuildingUsage').mockImplementation(async (q) => {
      const empty = report({ ...q, from: '2010-01', to: '2010-12' })
      return { ...empty, from: q.from, to: q.to }
    })
    renderPanel()

    expect(await screen.findByText('No electricity usage recorded for this range yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Units · Water & Electricity' })).toHaveAttribute('href', '/units?view=utilities')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /usage for the whole building/ })).not.toBeInTheDocument()
  })

  it('shows the message from the server when the usage cannot be loaded', async () => {
    vi.spyOn(api, 'fetchBuildingUsage').mockRejectedValue(new api.ApiError(503, 'Usage is unavailable right now'))
    renderPanel()

    expect(await screen.findByText('Usage is unavailable right now')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
