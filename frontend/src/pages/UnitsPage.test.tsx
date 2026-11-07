import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createLease, fetchApartmentConfig, fetchLeases, fetchRoomRates, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import UnitsPage from './UnitsPage'

/**
 * Covers Unit Management, including US-15 maintenance locking and release.
 *
 * This page lists all 24 units and their statuses, so administrators can update
 * a unit status from one place.
 */

// แท็บย่อยอยู่ใน ?view= ตั้งแต่ SSK-162 หน้าจึงต้องอยู่ใต้ router
async function renderUnits(url = '/units') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <UnitsPage />
    </MemoryRouter>,
  )
  await screen.findAllByText('101')
}

function rowOf(roomNumber: string): HTMLElement {
  const row = screen.getByText(roomNumber).closest('tr')
  if (!row) {
    throw new Error(`No row found for unit ${roomNumber}`)
  }
  return row
}

beforeEach(() => {
  resetMockStore()
})

describe('unit table', () => {
  it('shows room statuses returned by the API', async () => {
    await renderUnits()

    expect(within(rowOf('101')).getByText('Available')).toBeInTheDocument()
    expect(within(rowOf('102')).getByText('Occupied')).toBeInTheDocument()
    expect(within(rowOf('106')).getByText('Maintenance')).toBeInTheDocument()
  })

  // The design uses the second column for room type rather than tenant name.
  // Tenant names are available on the Dashboard and Tenants pages.
  it('shows the room type for each unit', async () => {
    await renderUnits()
    expect(within(rowOf('101')).getByText('Single Bedroom')).toBeInTheDocument()
    expect(within(rowOf('102')).getByText('Double Bedroom')).toBeInTheDocument()
  })
})

describe('US-15-S1 lock a unit for maintenance', () => {
  it('sets an available unit to Maintenance and updates the table immediately', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'Set status for unit 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Unit 101 Status')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Set to Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('101')).getByText('Maintenance')).toBeInTheDocument()
    })
  })

  it('allows an occupied unit to be locked as specified by the story', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('102')).getByRole('button', { name: 'Set status for unit 102' }))
    const dialog = await screen.findByRole('dialog')
    // The dialog identifies the current tenant to prevent locking the wrong unit.
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Set to Maintenance' }))

    await waitFor(() => {
      expect(within(rowOf('102')).getByText('Maintenance')).toBeInTheDocument()
    })
  })

  it('does not offer a locked unit for a new lease', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'Set status for unit 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Set to Maintenance' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // The Dashboard uses this status to choose between the check-in form and maintenance details.
    const room = (await fetchRooms()).find((r) => r.roomNumber === '101')
    expect(room?.status).toBe('MAINTENANCE')
  })

  it('does not change the status when the dialog closes without confirmation', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'Set status for unit 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(within(rowOf('101')).getByText('Available')).toBeInTheDocument()
  })
})

describe('US-15-S2 release a unit after maintenance', () => {
  it('returns an occupied unit to Occupied after maintenance is finished', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('102')).getByRole('button', { name: 'Set status for unit 102' }))
    const lockDialog = await screen.findByRole('dialog')
    await user.click(within(lockDialog).getByRole('button', { name: 'Set to Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('102')).getByText('Maintenance')).toBeInTheDocument()
    })

    await user.click(within(rowOf('102')).getByRole('button', { name: 'Set status for unit 102' }))
    const releaseDialog = await screen.findByRole('dialog')
    expect(within(releaseDialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    await user.click(within(releaseDialog).getByRole('button', { name: 'Finish Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('102')).getByText('Occupied')).toBeInTheDocument()
    })
  })

  it('offers Finish Maintenance for a unit under maintenance', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('106')).getByRole('button', { name: 'Set status for unit 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('button', { name: 'Finish Maintenance' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Set to Maintenance' }),
    ).not.toBeInTheDocument()
  })

  it('returns a maintenance unit to Available after maintenance is finished', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('106')).getByRole('button', { name: 'Set status for unit 106' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Finish Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('106')).getByText('Available')).toBeInTheDocument()
    })
  })
})

describe('SSK-160 configure the building layout', () => {
  async function openLayout() {
    const user = userEvent.setup()
    await renderUnits()
    await user.click(screen.getByRole('button', { name: 'Apartment settings' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Apartment Settings')).toBeInTheDocument()
    await within(dialog).findByLabelText(/Number of floors/)
    return { user, dialog }
  }

  it('counts units and floors from the API instead of a fixed 24', async () => {
    await renderUnits()
    expect(screen.getByText('Total Units').parentElement).toHaveTextContent('24')
    expect(screen.getByText('12 rooms per floor')).toBeInTheDocument()
    expect(screen.getByText('Floors').parentElement).toHaveTextContent('2')
    expect(screen.getByText('Configurable apartment layout')).toBeInTheDocument()
  })

  it('shows the floor of each unit in its own column', async () => {
    await renderUnits()
    expect(screen.getByRole('columnheader', { name: 'FLOOR' })).toBeInTheDocument()
    expect(within(rowOf('212')).getByText('2')).toBeInTheDocument()
  })

  // AC 1: 3 floors × 10 rooms shows 30 units on 3 floors
  it('saves 3 floors of 10 rooms and the table shows 30 units across 3 floors', async () => {
    const { user, dialog } = await openLayout()
    expect(within(dialog).getByLabelText(/Number of floors/)).toHaveValue(2)
    expect(within(dialog).getByLabelText(/Rooms per floor/)).toHaveValue(12)

    fireEvent.change(within(dialog).getByLabelText(/Number of floors/), { target: { value: '3' } })
    fireEvent.change(within(dialog).getByLabelText(/Rooms per floor/), { target: { value: '10' } })
    expect(within(dialog).getByTestId('layout-total')).toHaveTextContent('30 units')
    expect(within(dialog).getByText(/Adds 10 units: 301, 302/)).toBeInTheDocument()
    expect(within(dialog).getByText('Removes 4 units: 111, 112, 211, 212')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Save Layout' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await screen.findByText('310')
    expect(screen.getByText('Total Units').parentElement).toHaveTextContent('30')
    expect(screen.getByText('Floors').parentElement).toHaveTextContent('3')
    expect(screen.getByText('10 rooms per floor')).toBeInTheDocument()
    expect(screen.queryByText('112')).not.toBeInTheDocument()
  })

  // AC 2: a unit with an active lease cannot be removed; the API answers 409 and nothing changes
  it('warns about occupied units and shows the 409 reason without changing anything', async () => {
    const { user, dialog } = await openLayout()

    fireEvent.change(within(dialog).getByLabelText(/Rooms per floor/), { target: { value: '9' } })
    expect(within(dialog).getByText(/110 has an active lease/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Save Layout' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Unit 110 has lease or maintenance history and cannot be removed. Nothing was changed.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(await fetchRooms()).toHaveLength(24)
  })

  it('rejects a layout outside the limits before calling the API', async () => {
    const { user, dialog } = await openLayout()

    fireEvent.change(within(dialog).getByLabelText(/Rooms per floor/), { target: { value: '100' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save Layout' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Rooms per floor must be a whole number from 1 to 99',
    )
    expect(await fetchRooms()).toHaveLength(24)
  })
})

describe('SSK-162 room rates over time', () => {
  it('shows each unit monthly rent and links to its rate history', async () => {
    const user = userEvent.setup()
    await renderUnits()
    expect(within(rowOf('101')).getByText('฿3,500.00')).toBeInTheDocument()

    await user.click(within(rowOf('101')).getByRole('link', { name: 'View rates for unit 101' }))

    expect(await screen.findByText('Rate history · Unit 101')).toBeInTheDocument()
    expect(await screen.findByText(/No rate changes yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rate history' })).toHaveAttribute('aria-current', 'page')
  })

  // AC (as changed by SSK-180): a new room rate applies to contracts signed from that month;
  // the contract already running keeps the rent it was signed with.
  it('schedules a rate that new contracts use while the current contract keeps its locked rent', async () => {
    const user = userEvent.setup()
    const room102 = (await fetchRooms()).find((r) => r.roomNumber === '102')!
    await renderUnits(`/units?view=rates&room=${room102.id}`)

    await user.click(await screen.findByRole('button', { name: 'Schedule rate' }))
    const dialog = await screen.findByRole('dialog')
    const month = within(dialog).getByLabelText(/Effective from/)
    fireEvent.change(month, { target: { value: '2099-12' } })
    fireEvent.change(within(dialog).getByLabelText(/Monthly rent/), { target: { value: '5200' } })
    fireEvent.change(within(dialog).getByLabelText(/Electricity rate/), { target: { value: '9' } })
    await user.type(within(dialog).getByLabelText('Reason / note'), 'Renovated')
    await user.click(within(dialog).getByRole('button', { name: 'Schedule rate' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByRole('cell', { name: /Dec 2099/ })).toBeInTheDocument()
    expect(screen.getByText('Renovated')).toBeInTheDocument()
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    // Next rate change card picks up the scheduled month
    expect(screen.getByText('Next Rate Change').parentElement).toHaveTextContent('Dec 2099')

    const [rate] = await fetchRoomRates(room102.id)
    expect(rate).toMatchObject({ effectiveFrom: '2099-12', monthlyRent: 5200, electricRatePerUnit: 9 })
    const [running] = await fetchLeases({ roomId: room102.id, status: 'ACTIVE' })
    expect(running.monthlyRent).toBe(4500)

    // a contract that starts after the effective month is signed at the new rate
    const later = await createLease({
      roomId: room102.id,
      tenantId: 6,
      startDate: '2100-01-01',
      endDate: '2100-12-31',
      billingCycle: 'MONTHLY',
    })
    expect(later).toMatchObject({ monthlyRent: 5200, electricRatePerUnit: 9 })
  })

  it('shows the 409 reason when the month already has an issued bill', async () => {
    const user = userEvent.setup()
    const room102 = (await fetchRooms()).find((r) => r.roomNumber === '102')!
    await renderUnits(`/units?view=rates&room=${room102.id}`)

    await user.click(await screen.findByRole('button', { name: 'Schedule rate' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Effective from/), { target: { value: '2020-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Schedule rate' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A bill for 2020-01 or later has already been issued for this unit. Choose a later month.',
    )
    expect(await fetchRoomRates(room102.id)).toEqual([])
  })
})

describe('US-16 configure utility rates', () => {
  it('opens the configuration form with the current rates', async () => {
    const user = userEvent.setup()
    const current = await fetchApartmentConfig()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Apartment Config')).toBeInTheDocument()
    await waitFor(() => {
      expect(within(dialog).getByLabelText(/Electricity Rate per Unit/)).toHaveValue(
        current.electricRatePerUnit,
      )
    })
  })

  it('S1 saves edited rates through the mock API', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByLabelText(/Electricity Rate per Unit/)

    fireEvent.change(within(dialog).getByLabelText(/Electricity Rate per Unit/), { target: { value: '9.5' } })
    fireEvent.change(within(dialog).getByLabelText(/Common Area Fee/), { target: { value: '400' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save Rates' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    const saved = await fetchApartmentConfig()
    expect(saved.electricRatePerUnit).toBe(9.5)
    expect(saved.commonAreaFee).toBe(400)
  })

  it('S2 warns and does not save a negative rate', async () => {
    const user = userEvent.setup()
    const before = await fetchApartmentConfig()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByLabelText(/Water Rate per Unit/)

    fireEvent.change(within(dialog).getByLabelText(/Water Rate per Unit/), { target: { value: '-5' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save Rates' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('Water rate per unit cannot be negative')

    // Keep the dialog open for correction and leave the saved rate unchanged.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect((await fetchApartmentConfig()).waterRatePerUnit).toBe(before.waterRatePerUnit)
  })

  it('explains that new rates do not modify issued receipts', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))
    const dialog = await screen.findByRole('dialog')

    // US-16-S3 cannot verify receipt snapshots until receipt support is available.
    // The form must at least state the intended behavior clearly.
    expect(
      await within(dialog).findByText(/Receipts already issued keep their original rates/),
    ).toBeInTheDocument()
  })
})
