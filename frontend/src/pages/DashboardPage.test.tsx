import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import DashboardPage from './DashboardPage'

/**
 * Unit tests for SSK-14 / US-08: Dashboard room overview.
 *
 * Covered:
 * - Render all 24 rooms across two floors.
 * - Show summary counts that match room status data from the client.
 * - Display occupied room tenant information.
 * - Display maintenance room state.
 * - Filter rooms by Available / Occupied / Maintenance.
 * - Search rooms by tenant name.
 * - Show an empty state when no rooms match.
 *
 * These tests use the real frontend client with the mock backend store.
 * The goal is to verify how the dashboard screen loads and presents room data,
 * not only whether a component can render manually injected props.
 */

async function renderDashboard() {
  render(<DashboardPage />)
  // Wait for the first room card so the test only continues after data has loaded.
  await screen.findByRole('listitem', { name: 'ห้อง 101' })
}

beforeEach(() => {
  resetMockStore()
})

describe('US-08 dashboard room overview', () => {
  it('renders all 24 rooms across two floors', async () => {
    await renderDashboard()

    expect(screen.getAllByRole('listitem')).toHaveLength(24)
    expect(screen.getByText('Floor 1')).toBeInTheDocument()
    expect(screen.getByText('Floor 2')).toBeInTheDocument()
  })

  it('shows summary counts that match the room statuses from the client', async () => {
    const rooms = await fetchRooms()
    const expected = {
      available: rooms.filter((r) => r.status === 'AVAILABLE').length,
      occupied: rooms.filter((r) => r.status === 'OCCUPIED').length,
      maintenance: rooms.filter((r) => r.status === 'MAINTENANCE').length,
    }

    await renderDashboard()

    for (const [label, value] of [
      ['Available', expected.available],
      ['Occupied', expected.occupied],
      ['Maint.', expected.maintenance],
    ] as const) {
      const card = screen.getByRole('group', { name: `จำนวนห้อง ${label}` })
      expect(within(card).getByText(String(value))).toBeInTheDocument()
    }
  })

  it('shows the tenant name on an occupied room card', async () => {
    await renderDashboard()

    // Room 102 has an active lease, so the dashboard should show its tenant.
    const card = screen.getByRole('listitem', { name: 'ห้อง 102' })
    expect(within(card).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
  })

  it('shows Maintenance on a room card that is under maintenance', async () => {
    await renderDashboard()

    // Room 106 is marked as under maintenance in the mock store.
    const card = screen.getByRole('listitem', { name: 'ห้อง 106' })
    expect(within(card).getByText('Maintenance')).toBeInTheDocument()
  })

  it('filters the dashboard to available rooms only', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // Available should include empty rooms and hide occupied or maintenance rooms.
    await user.click(screen.getByRole('button', { name: 'Available' }))

    await waitFor(() => {
      expect(screen.getByRole('listitem', { name: 'ห้อง 101' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('listitem', { name: 'ห้อง 102' })).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'ห้อง 106' })).not.toBeInTheDocument()
  })

  it('filters the dashboard to occupied rooms only', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // Occupied should include rooms with active tenants and hide empty or maintenance rooms.
    await user.click(screen.getByRole('button', { name: 'Occupied' }))

    await waitFor(() => {
      expect(screen.getByRole('listitem', { name: 'ห้อง 102' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('listitem', { name: 'ห้อง 101' })).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'ห้อง 106' })).not.toBeInTheDocument()
  })

  it('filters the dashboard to maintenance rooms only', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // Maintenance should hide normal available rooms and keep only rooms under maintenance.
    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('listitem', { name: 'ห้อง 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('listitem', { name: 'ห้อง 106' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'ห้อง 206' })).toBeInTheDocument()
  })

  it('filters rooms by tenant name from the search input', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // This verifies that admins can quickly find a room by typing the tenant name.
    await user.type(screen.getByLabelText('ค้นหาเลขห้องหรือชื่อผู้เช่า'), 'ยูกิ')

    await waitFor(() => {
      expect(screen.queryByRole('listitem', { name: 'ห้อง 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('listitem', { name: 'ห้อง 102' })).toBeInTheDocument()
  })

  it('shows an empty state when no room matches the search keyword', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // This keeps the dashboard understandable when the current filters return no rooms.
    await user.type(screen.getByLabelText('ค้นหาเลขห้องหรือชื่อผู้เช่า'), '999')

    expect(await screen.findByText('ไม่พบห้องที่ตรงกับคำค้นหาหรือตัวกรอง')).toBeInTheDocument()
  })
})
