import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import DashboardPage from './DashboardPage'

/**
 * Unit tests for SSK-14 / US-08 and SSK-15 / US-09.
 *
 * Covered:
 * - Render the dashboard room overview.
 * - Show room status summary counts from the frontend client.
 * - Search and filter visible room cards.
 * - Open the correct room dialog when each room status is clicked.
 * - Continue the available-room flow by creating a lease from the room dialog.
 *
 * These tests use the real frontend client with the mock backend store.
 * The goal is to verify the screen behavior from the user's point of view,
 * not only whether a component can render manually injected props.
 */

async function renderDashboard() {
  render(<DashboardPage />)
  // Wait for the first room card so the test only continues after data has loaded.
  await screen.findByRole('button', { name: 'ห้อง 101' })
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
    const card = screen.getByRole('button', { name: 'ห้อง 102' })
    expect(within(card).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
  })

  it('shows Maintenance on a room card that is under maintenance', async () => {
    await renderDashboard()

    // Room 106 is marked as under maintenance in the mock store.
    const card = screen.getByRole('button', { name: 'ห้อง 106' })
    expect(within(card).getByText('Maintenance')).toBeInTheDocument()
  })

  it('filters the dashboard to maintenance rooms only', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // Maintenance should hide normal available rooms and keep only rooms under maintenance.
    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'ห้อง 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'ห้อง 106' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ห้อง 206' })).toBeInTheDocument()
  })

  it('filters rooms by tenant name from the search input', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // This verifies that admins can quickly find a room by typing the tenant name.
    await user.type(screen.getByLabelText('ค้นหาเลขห้องหรือชื่อผู้เช่า'), 'ยูกิ')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'ห้อง 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'ห้อง 102' })).toBeInTheDocument()
  })

  it('shows an empty state when no room matches the search keyword', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // This keeps the dashboard understandable when the current filters return no rooms.
    await user.type(screen.getByLabelText('ค้นหาเลขห้องหรือชื่อผู้เช่า'), '999')

    expect(await screen.findByText('ไม่พบห้องที่ตรงกับคำค้นหาหรือตัวกรอง')).toBeInTheDocument()
  })
})

describe('US-09 room detail click actions', () => {
  it('S1 opens the check-in form when an available room is clicked', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'ห้อง 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('เช็คอินห้อง 101')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'สร้างสัญญาเช่า' })).toBeInTheDocument()

    // The tenant selector should be ready as soon as the dialog opens.
    expect(within(dialog).getByLabelText('ผู้เช่า')).toBeInTheDocument()
  })

  it('S2 opens tenant and lease details when an occupied room is clicked', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // Room 102 has an active lease in the mock store.
    await user.click(screen.getByRole('button', { name: 'ห้อง 102' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    expect(within(dialog).getByText('ช่วงสัญญา')).toBeInTheDocument()
    expect(within(dialog).getByText(/3,500\.00 บาท/)).toBeInTheDocument()
  })

  it('S3 opens maintenance details when a maintenance room is clicked', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // Room 106 has an open maintenance ticket.
    await user.click(screen.getByRole('button', { name: 'ห้อง 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('เปลี่ยนคอมเพรสเซอร์แอร์')).toBeInTheDocument()
    expect(within(dialog).getByText(/กำลังซ่อม/)).toBeInTheDocument()
  })

  it('closes the room dialog and returns to the dashboard', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'ห้อง 102' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ปิด' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('updates the dashboard immediately after creating a lease from an available room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    // This covers the "continue action" flow after clicking an available room.
    await user.click(screen.getByRole('button', { name: 'ห้อง 105' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'สร้างสัญญาเช่า' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const card = await screen.findByRole('button', { name: 'ห้อง 105' })
    await waitFor(() => {
      expect(within(card).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    })
  })
})
