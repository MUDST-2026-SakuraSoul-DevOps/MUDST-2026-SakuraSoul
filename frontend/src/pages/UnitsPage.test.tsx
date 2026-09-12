import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchApartmentConfig, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import UnitsPage from './UnitsPage'

/**
 * Tests Unit Management for US-15: locking rooms for maintenance and unlocking them.
 *
 * This page is the only place that shows all 24 rooms and their statuses in a
 * single table, so admins can update status regardless of the room's current state.
 */

async function renderUnits() {
  render(<UnitsPage />)
  await screen.findByText('101')
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

describe('room table', () => {
  it('shows room status from the API instead of empty dashes', async () => {
    await renderUnits()

    expect(within(rowOf('101')).getByText('Available')).toBeInTheDocument()
    expect(within(rowOf('102')).getByText('Occupied')).toBeInTheDocument()
    expect(within(rowOf('106')).getByText('Maintenance')).toBeInTheDocument()
  })

  // The design uses the second column for room type, not tenant name. Tenant
  // names are visible on Dashboard and Tenants, so the old table assertion changed.
  it('shows each room type in the table', async () => {
    await renderUnits()
    expect(within(rowOf('101')).getByText('Single Bedroom')).toBeInTheDocument()
    expect(within(rowOf('102')).getByText('Double Bedroom')).toBeInTheDocument()
  })
})

describe('US-15-S1 lock rooms for maintenance', () => {
  it('sets an available room to maintenance and updates the table immediately', async () => {
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

  it('allows locking an occupied room as specified by the story', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('102')).getByRole('button', { name: 'Set status for unit 102' }))
    const dialog = await screen.findByRole('dialog')
    // The dialog must show who is in this room to reduce accidental locks.
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Set to Maintenance' }))

    await waitFor(() => {
      expect(within(rowOf('102')).getByText('Maintenance')).toBeInTheDocument()
    })
  })

  it('prevents locked rooms from being offered for new leases', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'Set status for unit 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Set to Maintenance' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Dashboard uses this status to choose between check-in and maintenance details.
    const room = (await fetchRooms()).find((r) => r.roomNumber === '101')
    expect(room?.status).toBe('MAINTENANCE')
  })

  it('does not change status when the dialog is closed without confirmation', async () => {
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

describe('US-15-S2 unlock rooms after maintenance', () => {
  it('shows the Finish Maintenance action for rooms under maintenance', async () => {
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

  it('returns a maintenance room to available after finishing maintenance', async () => {
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

describe('US-16 apartment utility rates', () => {
  it('opens the config form with the current rates', async () => {
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

  it('S1 saves edited rates through the API', async () => {
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

  it('S2 warns and does not save negative rates', async () => {
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

    // The dialog stays open for correction and the previous rate remains unchanged.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect((await fetchApartmentConfig()).waterRatePerUnit).toBe(before.waterRatePerUnit)
  })

  it('explains that new rates do not change already issued receipts', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))
    const dialog = await screen.findByRole('dialog')

    // US-16-S3 snapshot behavior cannot be implemented fully until SSK-16
    // receipts exist, so the form must at least explain the intended behavior.
    expect(
      await within(dialog).findByText(/Receipts already issued keep their original rates/),
    ).toBeInTheDocument()
  })
})

