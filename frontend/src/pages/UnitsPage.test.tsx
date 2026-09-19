import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchApartmentConfig, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import UnitsPage from './UnitsPage'

/**
 * Covers Unit Management, including US-15 maintenance locking and release.
 *
 * This page lists all 24 units and their statuses, so administrators can update
 * a unit status from one place.
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
