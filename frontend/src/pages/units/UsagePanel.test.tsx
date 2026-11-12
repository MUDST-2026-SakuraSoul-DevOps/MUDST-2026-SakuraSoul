import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RoomSummary } from '../../api/types'
import { UsagePanel } from './UsagePanel'

/*
  เทสตรงของแผงกราฟการใช้น้ำไฟ (SSK-167)
  เทสของหน้า Units เปิดแผงนี้ด้วยค่าตั้งต้นอย่างเดียว ตรงนี้ไล่ส่วนที่เหลือ: ดูรายห้อง เปลี่ยนชั้น
  ยอดสรุปบนการ์ด ไฟล์ CSV ที่ export และตอนโหลดข้อมูลไม่สำเร็จ
*/

const fetchUsage = vi.fn()
vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  fetchUsage: (...args: unknown[]) => fetchUsage(...args),
}))

const downloadTextFile = vi.fn()
vi.mock('../../lib/downloadFile', () => ({
  downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
}))

function room(id: number, roomNumber: string, floor: number): RoomSummary {
  return {
    id,
    roomNumber,
    floor,
    roomType: 'SINGLE',
    baseRent: 3500,
    status: 'AVAILABLE',
    currentLease: null,
    openMaintenanceCount: 0,
    openMaintenanceTitle: null,
  }
}

// ใส่ห้องสลับลำดับชั้นไว้ ตัวเลือกชั้นต้องเรียงจากน้อยไปมากเอง
const ROOMS = [room(21, '201', 2), room(11, '101', 1), room(12, '102', 1)]

function lastQuery() {
  return fetchUsage.mock.calls.at(-1)?.[0]
}

beforeEach(() => {
  fetchUsage.mockReset()
  downloadTextFile.mockReset()
  fetchUsage.mockResolvedValue([
    { period: '2026-08', units: 120 },
    { period: '2026-09', units: 180.5 },
    { period: '2026-10', units: 0 },
  ])
})

describe('UsagePanel', () => {
  it('starts on electricity for the lowest floor and lists floors in order', async () => {
    render(<UsagePanel rooms={ROOMS} version={0} />)

    await waitFor(() => expect(fetchUsage).toHaveBeenCalled())
    expect(lastQuery()).toMatchObject({ metric: 'electric', scope: 'floor', floor: 1, granularity: 'month' })
    expect(lastQuery()).not.toHaveProperty('roomId')

    const floorSelect = screen.getByLabelText('Floor') as HTMLSelectElement
    expect([...floorSelect.options].map((o) => o.textContent)).toEqual(['Floor 1', 'Floor 2'])
  })

  it('totals the units, averages them over the months and names the peak month', async () => {
    render(<UsagePanel rooms={ROOMS} version={0} />)

    // 120 + 180.5 + 0 = 300.5 หาร 3 เดือน = 100.2 (ปัดทศนิยมหนึ่งตำแหน่ง)
    expect(await screen.findByText('300.5 kWh')).toBeInTheDocument()
    expect(screen.getByText('100.2 kWh')).toBeInTheDocument()
    expect(screen.getByText('Across 3 months')).toBeInTheDocument()
    expect(screen.getByText('180.5 kWh')).toBeInTheDocument()
  })

  it('asks for one unit only when the view is switched to a unit', async () => {
    const user = userEvent.setup()
    render(<UsagePanel rooms={ROOMS} version={0} />)
    await waitFor(() => expect(fetchUsage).toHaveBeenCalled())

    await user.selectOptions(screen.getByLabelText('View'), 'room')
    await waitFor(() => expect(lastQuery()).toMatchObject({ scope: 'room', roomId: 21 }))
    expect(lastQuery()).not.toHaveProperty('floor')

    await user.selectOptions(screen.getByLabelText('Unit'), '12')
    await waitFor(() => expect(lastQuery()).toMatchObject({ scope: 'room', roomId: 12 }))
    expect(screen.getAllByText(/Unit 102 ·/).length).toBeGreaterThan(0)
  })

  it('switches floor, metric and the whole building view', async () => {
    const user = userEvent.setup()
    render(<UsagePanel rooms={ROOMS} version={0} />)
    await waitFor(() => expect(fetchUsage).toHaveBeenCalled())

    await user.selectOptions(screen.getByLabelText('Floor'), '2')
    await waitFor(() => expect(lastQuery()).toMatchObject({ scope: 'floor', floor: 2 }))

    await user.click(screen.getByRole('button', { name: 'Water' }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ metric: 'water' }))

    await user.selectOptions(screen.getByLabelText('View'), 'building')
    await waitFor(() => expect(lastQuery()).toMatchObject({ scope: 'building' }))
    expect(lastQuery()).not.toHaveProperty('floor')
    expect(lastQuery()).not.toHaveProperty('roomId')
    expect(screen.queryByLabelText('Floor')).not.toBeInTheDocument()
  })

  it('exports the loaded points as CSV named after the selection', async () => {
    const user = userEvent.setup()
    render(<UsagePanel rooms={ROOMS} version={0} />)
    await screen.findByText('300.5 kWh')

    await user.click(screen.getByRole('button', { name: /Export CSV/ }))

    expect(downloadTextFile).toHaveBeenCalledTimes(1)
    const [name, body, type] = downloadTextFile.mock.calls[0]
    const { from, to } = lastQuery()
    expect(name).toBe(`usage-electric-floor-${from}-${to}.csv`)
    expect(body).toBe('period,electric_kwh\n2026-08,120\n2026-09,180.5\n2026-10,0\n')
    expect(type).toBe('text/csv')
  })

  it('labels the water column in cubic metres', async () => {
    const user = userEvent.setup()
    render(<UsagePanel rooms={ROOMS} version={0} />)
    await screen.findByText('300.5 kWh')

    await user.click(screen.getByRole('button', { name: 'Water' }))
    await waitFor(() => expect(lastQuery()).toMatchObject({ metric: 'water' }))
    await user.click(screen.getByRole('button', { name: /Export CSV/ }))

    expect(downloadTextFile.mock.calls[0][1]).toMatch(/^period,water_m3\n/)
  })

  it('says there is no usage yet when every point is zero', async () => {
    fetchUsage.mockResolvedValue([
      { period: '2026-09', units: 0 },
      { period: '2026-10', units: 0 },
    ])
    render(<UsagePanel rooms={ROOMS} version={0} />)

    expect(await screen.findByText(/No usage recorded for this selection yet/)).toBeInTheDocument()
    expect(screen.getByText('No usage yet')).toBeInTheDocument()
  })

  it('shows the error and keeps export off when the usage cannot load', async () => {
    fetchUsage.mockRejectedValue(new Error('Server is down'))
    render(<UsagePanel rooms={ROOMS} version={0} />)

    expect(await screen.findByText(/Server is down|Could not load the usage/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeDisabled()
  })

  it('reloads when the parent bumps the version after an import', async () => {
    const { rerender } = render(<UsagePanel rooms={ROOMS} version={0} />)
    await waitFor(() => expect(fetchUsage).toHaveBeenCalledTimes(1))

    rerender(<UsagePanel rooms={ROOMS} version={1} />)
    await waitFor(() => expect(fetchUsage).toHaveBeenCalledTimes(2))
  })
})
