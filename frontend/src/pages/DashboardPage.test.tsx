import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createLease, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import DashboardPage from './DashboardPage'

/**
 * Covers the dashboard page: US-08 room overview for all 24 rooms, US-09 room
 * click flows by room status, and US-05 lease-overlap prevention.
 */

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function renderDashboard() {
  // The page includes a link to Maintenance, so it must be wrapped with a Router.
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
  // Wait for the first room card to confirm that the data has loaded.
  await screen.findByRole('button', { name: 'Unit 101' })
}

beforeEach(() => {
  resetMockStore()
})

describe('US-08 full room overview', () => {
  it('shows all 24 rooms across two floors', async () => {
    await renderDashboard()

    expect(screen.getAllByRole('listitem')).toHaveLength(24)
    expect(screen.getByText('Floor 1')).toBeInTheDocument()
    expect(screen.getByText('Floor 2')).toBeInTheDocument()
  })

  it('matches the summary totals to room statuses from the API', async () => {
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
      const card = screen.getByRole('group', { name: `${label} units` })
      expect(within(card).getByText(String(value))).toBeInTheDocument()
    }
  })

  it('shows the tenant name on occupied room cards', async () => {
    await renderDashboard()
    const card = screen.getByRole('button', { name: 'Unit 102' })
    expect(within(card).getByText('Yuki Tanaka')).toBeInTheDocument()
  })

  it('shows Maintenance on rooms closed for maintenance', async () => {
    await renderDashboard()
    const card = screen.getByRole('button', { name: 'Unit 106' })
    expect(within(card).getByText('Maintenance')).toBeInTheDocument()
  })

  it('filters maintenance rooms to only rooms closed for maintenance', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unit 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Unit 106' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unit 206' })).toBeInTheDocument()
  })

  it('filters rooms by tenant name from the search field', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.type(screen.getByLabelText('Search room or tenant'), 'Yuki')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unit 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Unit 102' })).toBeInTheDocument()
  })

  it('shows an empty-search message instead of leaving the page blank', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.type(screen.getByLabelText('Search room or tenant'), '999')

    expect(await screen.findByText('No units match your search or filter')).toBeInTheDocument()
  })
})

describe('US-09 room click flows', () => {
  it('S1 opens the lease creation form for an available room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Room 101')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Check In' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Tenant Name')).toBeInTheDocument()
  })

  it('S2 opens tenant and lease details for an occupied room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 102' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Room 102')).toBeInTheDocument()
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(within(dialog).getByText('Tenant Information')).toBeInTheDocument()
    expect(within(dialog).getByText('Lease Information')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Check Out' })).toBeInTheDocument()
  })

  it('S3 opens the maintenance list for a room closed for maintenance', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('AC compressor replacement')).toBeInTheDocument()
    expect(within(dialog).getByText(/In Progress/)).toBeInTheDocument()
  })

  it('closes the popup with the close button and returns to the dashboard', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 102' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('updates the dashboard immediately after successfully checking in an available room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 105' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))

    // Confirm dialog
    const confirmDialog = await screen.findByRole('dialog', { name: 'Confirm Check In' })
    await user.click(within(confirmDialog).getByRole('button', { name: 'Confirm Check In' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const card = await screen.findByRole('button', { name: 'Unit 105' })
    await waitFor(() => {
      expect(within(card).getByText('Yuki Tanaka')).toBeInTheDocument()
    })
  })
})

describe('US-05-S1 lease-overlap prevention from the UI', () => {
  it('blocks check-in when the selected room is already booked for the date range', async () => {
    await createLease({
      roomId: 1,
      tenantId: 6,
      startDate: isoDate(60),
      endDate: isoDate(400),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))
    const dialog = await screen.findByRole('dialog')

    // Switch to Lease Information tab to edit dates
    await user.click(within(dialog).getByRole('button', { name: 'Lease Information' }))

    fireEvent.change(within(dialog).getByLabelText('Check In Date'), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText('Check Out Date'), {
      target: { value: isoDate(120) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('not available')
    expect(alert).toHaveTextContent('101')
    expect(alert).toHaveTextContent('Haruto Watanabe')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not create a new lease after the overlap is blocked', async () => {
    await createLease({
      roomId: 1,
      tenantId: 6,
      startDate: isoDate(60),
      endDate: isoDate(400),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))
    const dialog = await screen.findByRole('dialog')
    
    await user.click(within(dialog).getByRole('button', { name: 'Lease Information' }))
    fireEvent.change(within(dialog).getByLabelText('Check In Date'), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText('Check Out Date'), {
      target: { value: isoDate(120) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))
    await within(dialog).findByRole('alert')

    const card = screen.getByRole('button', { name: 'Unit 101' })
    expect(within(card).queryByText('Haruto Watanabe')).not.toBeInTheDocument()
  })

  it('warns before calling the API when the check-out date is before the check-in date', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Lease Information' }))
    fireEvent.change(within(dialog).getByLabelText('Check In Date'), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText('Check Out Date'), {
      target: { value: isoDate(10) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Check Out Date must not be earlier than Check In Date.',
    )
  })

  it('allows lease creation when the selected date range does not overlap any existing lease', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 105' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))

    const confirmDialog = await screen.findByRole('dialog', { name: 'Confirm Check In' })
    await user.click(within(confirmDialog).getByRole('button', { name: 'Confirm Check In' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

/*
  SSK-82: the Maintenance button on the dashboard must open the Create Maintenance
  popup instead of navigating to the Maintenance page.
*/
describe('SSK-82 Maintenance button opens the Create Maintenance popup', () => {
  it('opens the popup without navigating away', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Create Maintenance' })).toBeInTheDocument()
    // The dashboard is still behind the dialog, so navigation did not happen.
    expect(screen.getByRole('heading', { name: 'Room Availability' })).toBeInTheDocument()
  })

  it('shows all six sections from the design', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')

    for (const title of [
      'Select Room',
      'Maintenance Type',
      'Room Availability During Maintenance',
      'Maintenance Cost',
      'Schedule',
      'Additional Notes',
    ]) {
      expect(within(dialog).getByRole('heading', { name: new RegExp(title) })).toBeInTheDocument()
    }
  })

  it('uses API rooms in the room selector and can switch floors', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('button', { name: /^101/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /^201/ })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Floor 2' }))
    expect(within(dialog).getByRole('button', { name: /^201/ })).toBeInTheDocument()
  })

  it('does not save without selecting a room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please select a room')
  })

  /*
    The amount field is optional unless the repair will be billed to the tenant.
    Once billing is enabled, saving without an amount would create a meaningless
    charge notice.
  */
  it('warns when tenant billing is selected without an amount', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^101/ }))
    await user.selectOptions(within(dialog).getByLabelText('Maintenance Type'), 'Plumbing')
    await user.click(within(dialog).getByLabelText('Bill this repair to the tenant'))
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('must be greater than 0')
  })

  it('saves complete maintenance data and closes the popup', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^101/ }))
    await user.selectOptions(within(dialog).getByLabelText('Maintenance Type'), 'Plumbing')
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

describe('US-15 releasing rooms from maintenance on the dashboard', () => {
  it('opens the maintenance list instead of the check-in form for a room under maintenance', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Check In' })).not.toBeInTheDocument()
    expect(await within(dialog).findByText('AC compressor replacement')).toBeInTheDocument()
    expect(within(dialog).getByText(/In Progress/)).toBeInTheDocument()
  })

  it('S2 allows a released room to accept a new lease immediately', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Release Room' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Open the same room again; it should now show the check-in form instead of maintenance tasks.
    await user.click(await screen.findByRole('button', { name: 'Unit 106' }))
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).getByRole('button', { name: 'Check In' })).toBeInTheDocument()
  })
})
