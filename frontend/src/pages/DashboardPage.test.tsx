import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createLease, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import DashboardPage from './DashboardPage'

/**
 * Tests the dashboard for US-08 room overview, US-09 room-click dialogs by
 * status, and US-05 prevention of overlapping lease periods.
 *
 * Data comes from the mock backend through the real client. The goal is to
 * verify that the screen connects to the API and renders correctly, not just
 * that components can render passed-in props.
 */

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function renderDashboard() {
  // This page links to Maintenance, so it needs a Router wrapper.
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
  // Wait for the first room card to confirm data has loaded.
  await screen.findByRole('button', { name: 'Unit 101' })
}

beforeEach(() => {
  resetMockStore()
})

describe('US-08 room overview', () => {
  it('shows all 24 rooms grouped by two floors', async () => {
    await renderDashboard()

    expect(screen.getAllByRole('listitem')).toHaveLength(24)
    expect(screen.getByText('Floor 1')).toBeInTheDocument()
    expect(screen.getByText('Floor 2')).toBeInTheDocument()
  })

  it('matches summary counts to room statuses from the API', async () => {
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

  it('shows Maintenance on rooms under maintenance', async () => {
    await renderDashboard()
    const card = screen.getByRole('button', { name: 'Unit 106' })
    expect(within(card).getByText('Maintenance')).toBeInTheDocument()
  })

  it('filters to only rooms under maintenance', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unit 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Unit 106' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unit 206' })).toBeInTheDocument()
  })

  it('filters rooms by tenant name while typing in the search field', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.type(screen.getByLabelText('Search room or tenant'), 'Yuki')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unit 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Unit 102' })).toBeInTheDocument()
  })

  it('shows an empty state when no rooms match the search', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.type(screen.getByLabelText('Search room or tenant'), '999')

    expect(await screen.findByText('No units match your search or filter')).toBeInTheDocument()
  })
})

describe('US-09 room click actions', () => {
  it('S1 opens the Create Lease form for an available room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Check In Unit 101')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Create Lease' })).toBeInTheDocument()
    // Tenant options must be ready when the dialog opens, not loaded later.
    expect(within(dialog).getByLabelText('Tenant')).toBeInTheDocument()
  })

  it('S2 opens tenant and lease details for an occupied room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 102' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(within(dialog).getByText('Lease period')).toBeInTheDocument()
    expect(within(dialog).getByText(/¥3,500/)).toBeInTheDocument()
    // US-09 requires follow-up actions here without going to Contracts.
    expect(within(dialog).getByRole('button', { name: 'Edit Lease' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Check Out' })).toBeInTheDocument()
  })

  it('S3 opens maintenance tasks for a room under maintenance', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('AC compressor replacement')).toBeInTheDocument()
    expect(within(dialog).getByText(/In Progress/)).toBeInTheDocument()
  })

  it('closes the dialog with the close button and returns to the dashboard', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 102' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close dialog' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('updates the room card immediately after a successful check-in', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 105' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Create Lease' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const card = await screen.findByRole('button', { name: 'Unit 105' })
    await waitFor(() => {
      expect(within(card).getByText('Yuki Tanaka')).toBeInTheDocument()
    })
  })
})

describe('US-05-S1 prevent overlapping leases from the screen', () => {
  it('blocks check-in when the requested period overlaps a future booking', async () => {
    // Unit 101 is available today but booked 60 days in the future, so the dialog can still open.
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

    // Set the lease period to overlap the future booking.
    fireEvent.change(within(dialog).getByLabelText(/Lease start/), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText(/Lease end/), {
      target: { value: isoDate(120) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Create Lease' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('not available')
    expect(alert).toHaveTextContent('101')
    expect(alert).toHaveTextContent('Haruto Watanabe')

    // The dialog must stay open so users can adjust dates without reopening it.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not create a new lease after a blocked submission', async () => {
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
    fireEvent.change(within(dialog).getByLabelText(/Lease start/), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText(/Lease end/), {
      target: { value: isoDate(120) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Create Lease' }))
    await within(dialog).findByRole('alert')

    // Unit 101 must stay available with no tenant name on the card.
    const card = screen.getByRole('button', { name: 'Unit 101' })
    expect(within(card).queryByText('Haruto Watanabe')).not.toBeInTheDocument()
  })

  it('warns before calling the API when the end date is before the start date', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/Lease start/), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText(/Lease end/), {
      target: { value: isoDate(10) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Create Lease' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The end date cannot be before the start date',
    )
  })

  it('creates a lease normally when the requested period does not overlap', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 105' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Create Lease' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

/*
  SSK-82: the dashboard Maintenance button must open the Create Maintenance
  dialog instead of navigating to the Maintenance page, matching the ticket's
  expected result.
*/
describe('SSK-82 Maintenance button opens the Create Maintenance dialog', () => {
  it('opens the dialog without navigating away', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Create Maintenance' })).toBeInTheDocument()
    // The dashboard remains behind the dialog, proving no navigation happened.
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

  it('uses real API rooms in the room picker and switches floors', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('button', { name: /^101/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /^201/ })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Floor 2' }))
    expect(within(dialog).getByRole('button', { name: /^201/ })).toBeInTheDocument()
  })

  it('rejects saving without a selected room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please select a room')
  })

  /*
    Cost is optional, but if the tenant-billing checkbox is selected, the amount
    must be present. Otherwise the request says to bill the tenant without a value.
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

  it('saves a complete form and closes the dialog', async () => {
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

describe('US-15 finish maintenance from the dashboard', () => {
  it('opens maintenance details instead of check-in for a room under maintenance', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))

    const dialog = await screen.findByRole('dialog')
    // This prevents rooms under maintenance from being offered for new leases.
    expect(within(dialog).queryByText('Check In Unit 106')).not.toBeInTheDocument()
    expect(await within(dialog).findByText('AC compressor replacement')).toBeInTheDocument()
  })

  it('S2 makes the room available for a new lease after finishing maintenance', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Finish Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Reopen the same room; it should now show the check-in form instead of maintenance details.
    await user.click(await screen.findByRole('button', { name: 'Unit 106' }))
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).getByText('Check In Unit 106')).toBeInTheDocument()
  })
})
