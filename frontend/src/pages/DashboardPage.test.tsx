import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as clientModule from '../api/client'
import { createLease, deleteRoom, fetchMaintenanceLog, fetchReminders, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import { todayInBangkok } from '../format'
import DashboardPage from './DashboardPage'

/**
 * Covers the dashboard: US-08 room overview, US-09 status-specific room dialogs,
 * and US-05 prevention of overlapping leases.
 */

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function renderDashboard() {
  // The page contains Maintenance links, so it requires a router.
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
  // Wait for the first room card to confirm that data loading has completed.
  await screen.findByRole('button', { name: 'Unit 101' })
}

beforeEach(() => {
  resetMockStore()
})

describe('US-08 room overview', () => {
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

  it.each([
    ['Available', 'Unit 101', 'Unit 102'],
    ['Occupied', 'Unit 102', 'Unit 101'],
  ])('filters %s rooms without showing rooms with another status', async (filter, visible, hidden) => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: filter }))

    expect(screen.getByRole('button', { name: visible })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: hidden })).not.toBeInTheDocument()
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

describe('US-09 open a room for the next action', () => {
  it('S1 opens the lease creation form for an available room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Room 101')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Check In' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Tenant Name')).toBeInTheDocument()
  })

  /*
    SSK-136 the check-in tab used to offer editable Phone / National ID / Line ID / Emergency Contact
    fields filled with placeholders ('055-555-5555', '911') that were never sent anywhere.
  */
  it('S1 shows the selected tenant real contact details read-only on check-in', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Tenant Name'), 'Hiroshi Nakamura')

    expect(within(dialog).getByText('083-456-7890')).toBeInTheDocument()
    expect(within(dialog).getByText('1100400345673')).toBeInTheDocument()
    expect(within(dialog).getByText('hiroshi.n@example.com')).toBeInTheDocument()
    // Nothing to type into: contact details are edited on the Tenants page.
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Emergency Contact')).not.toBeInTheDocument()
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

  // SSK-136 every occupied room used to show the same made-up phone, ID and emergency contact.
  it('S2 shows the real contact details of the tenant in the room', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 102' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('081-234-5678')).toBeInTheDocument()
    expect(within(dialog).getByText('1100400123450')).toBeInTheDocument()
    expect(within(dialog).getByText('yuki.t@example.com')).toBeInTheDocument()
    // Yuki has no Line ID on file.
    expect(within(dialog).getByText('Not provided')).toBeInTheDocument()
    expect(within(dialog).queryByText('021-366-4587')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('1-1111-11111-11-1')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Emergency Contact')).not.toBeInTheDocument()
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

describe('US-05-S1 prevent overlapping leases from the interface', () => {
  it('blocks check-in when the selected room is already booked for the date range', async () => {
    await createLease({
      roomId: 1,
      tenantId: 6,
      startDate: isoDate(60),
      endDate: isoDate(400),
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
  SSK-82 requires the Dashboard Maintenance button to open Create Maintenance
  instead of navigating to the Maintenance page.
*/
describe('SSK-82 Maintenance button opens the Create Maintenance popup', () => {
  it('opens the popup without navigating away', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Create Maintenance' })).toBeInTheDocument()
    // The dashboard remains visible behind the dialog, so no navigation occurred.
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
    The amount is optional, but billing a tenant without an amount would create
    a charge without a value and therefore has no meaningful outcome.
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

  /*
    SSK-131 bug: Save Maintenance used to close the popup without saving anything.
    The ticket must reach the API and appear on the room card straight away (US-08).
  */
  it('SSK-131 saves a real maintenance ticket and shows it on the room card', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^101/ }))
    await user.selectOptions(within(dialog).getByLabelText('Maintenance Type'), 'Plumbing')
    await user.type(within(dialog).getByLabelText('Additional Notes'), 'Kitchen sink blocked')
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(screen.getByRole('button', { name: 'Unit 101' })).getByText(/Plumbing/)).toBeInTheDocument()
    })

    const created = (await fetchMaintenanceLog()).find((ticket) => ticket.roomNumber === '101')
    expect(created).toMatchObject({
      title: 'Plumbing',
      maintenanceType: 'Plumbing',
      detail: 'Kitchen sink blocked',
      status: 'OPEN',
      cost: null,
    })
    // Still Available must not close the room.
    expect((await fetchRooms()).find((room) => room.roomNumber === '101')?.status).toBe('AVAILABLE')
  })

  it('SSK-131 closes the room when Out of Service is chosen', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^105/ }))
    await user.selectOptions(within(dialog).getByLabelText('Maintenance Type'), 'Electrical')
    await user.click(within(dialog).getByRole('radio', { name: /Out of Service/ }))
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    await waitFor(() => {
      expect(within(screen.getByRole('button', { name: 'Unit 105' })).getByText('Maintenance')).toBeInTheDocument()
    })
    expect((await fetchRooms()).find((room) => room.roomNumber === '105')).toMatchObject({
      status: 'MAINTENANCE',
      openMaintenanceTitle: 'Electrical',
    })
  })

  /*
    SSK-131 kept Recurring disabled until Schedule & Reminder used the API. SSK-20 wired that tab, so
    ticking Recurring now creates a reminder for the same unit after the ticket, starting at the next date.
  */
  it('SSK-20 Recurring creates a reminder for the unit after the ticket', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^101/ }))
    await user.selectOptions(within(dialog).getByLabelText('Maintenance Type'), 'Plumbing')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Recurring maintenance' }))
    fireEvent.change(within(dialog).getByLabelText('Next maintenance date'), { target: { value: isoDate(7) } })
    await user.selectOptions(within(dialog).getByLabelText('Repeat every'), 'Quarterly')
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect((await fetchMaintenanceLog()).some((ticket) => ticket.roomNumber === '101' && ticket.title === 'Plumbing')).toBe(true)
    const reminder = (await fetchReminders()).find((r) => r.name === 'Plumbing')
    expect(reminder).toMatchObject({
      frequency: 'QUARTERLY',
      roomNumber: '101',
      startDate: isoDate(7),
      nextDueDate: isoDate(7),
      remindTime: null,
      active: true,
    })
  })

  it('SSK-20 Repeat every offers only the intervals the backend supports', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    const interval = within(dialog).getByLabelText('Repeat every')

    expect(within(interval).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Select interval',
      'Monthly',
      'Quarterly',
      'Annual',
    ])
  })

  it('SSK-20 the next maintenance date must be after today', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^101/ }))
    await user.selectOptions(within(dialog).getByLabelText('Maintenance Type'), 'Plumbing')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Recurring maintenance' }))
    fireEvent.change(within(dialog).getByLabelText('Next maintenance date'), {
      target: { value: todayInBangkok() },
    })
    await user.selectOptions(within(dialog).getByLabelText('Repeat every'), 'Monthly')
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The next maintenance date must be after today')
    // Nothing reaches the API, so there is no ticket or reminder to clean up.
    expect((await fetchMaintenanceLog()).some((ticket) => ticket.roomNumber === '101')).toBe(false)
    expect((await fetchReminders()).some((r) => r.name === 'Plumbing')).toBe(false)
  })

  it('SSK-20 keeps the ticket and explains what is left when the reminder cannot be saved', async () => {
    const reminderCall = vi
      .spyOn(clientModule, 'createReminder')
      .mockRejectedValueOnce(new clientModule.ApiError(500, 'Database is unavailable'))
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^101/ }))
    await user.selectOptions(within(dialog).getByLabelText('Maintenance Type'), 'Plumbing')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Recurring maintenance' }))
    fireEvent.change(within(dialog).getByLabelText('Next maintenance date'), { target: { value: isoDate(7) } })
    await user.selectOptions(within(dialog).getByLabelText('Repeat every'), 'Monthly')
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The ticket was created, but the recurring reminder could not be saved. Add it in Maintenance → Schedule & Reminder.',
    )
    expect(reminderCall).toHaveBeenCalledOnce()
    expect((await fetchMaintenanceLog()).some((ticket) => ticket.roomNumber === '101' && ticket.title === 'Plumbing')).toBe(true)
    reminderCall.mockRestore()
  })

  it('SSK-131 keeps the popup open with the API reason when the ticket cannot be saved', async () => {
    const user = userEvent.setup()
    await renderDashboard()
    // Unit 108 is deleted elsewhere after the dashboard loaded, so the API answers 404.
    const unitId = (await fetchRooms()).find((room) => room.roomNumber === '108')?.id
    expect(unitId).toBeDefined()
    await deleteRoom(unitId as number)

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^108/ }))
    await user.selectOptions(within(dialog).getByLabelText('Maintenance Type'), 'Furniture')
    await user.click(within(dialog).getByRole('button', { name: /Save Maintenance/ }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(`No unit with id ${unitId}`)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect((await fetchMaintenanceLog()).some((ticket) => ticket.title === 'Furniture')).toBe(false)
  })

  it('cancels maintenance creation without changing the dashboard', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Create Maintenance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Room Availability' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unit 101' })).toBeInTheDocument()
  })
})

describe('US-15 finish maintenance from the dashboard', () => {
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

    // Reopening the same room should now show the check-in form instead of maintenance details.
    await user.click(await screen.findByRole('button', { name: 'Unit 106' }))
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).getByRole('button', { name: 'Check In' })).toBeInTheDocument()
  })
})
