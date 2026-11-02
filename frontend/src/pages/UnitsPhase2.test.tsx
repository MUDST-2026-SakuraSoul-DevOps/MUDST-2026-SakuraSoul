import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import UnitsPage from './UnitsPage'
import {
  resetApartmentLayout,
  resetRoomRates,
  resetExtraCharges,
  resetImportedUsage,
} from '../domain/unitsPhase2'

describe('UnitsPage Phase 2 features', () => {
  beforeEach(() => {
    resetMockStore()
    resetApartmentLayout()
    resetRoomRates()
    resetExtraCharges()
    resetImportedUsage()
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/units')
  })

  it('renders subnavigation tabs and navigates between tabs', async () => {
    const user = userEvent.setup()
    render(<UnitsPage />)

    // Wait for initial render of All units table
    expect(await screen.findByRole('heading', { name: 'All Units' })).toBeInTheDocument()

    // 4 tabs should exist
    const tabAll = screen.getByRole('button', { name: 'All units tab' })
    const tabRates = screen.getByRole('button', { name: 'Rate history tab' })
    const tabCharges = screen.getByRole('button', { name: 'Extra charges tab' })
    const tabUtilities = screen.getByRole('button', { name: 'Water & Electricity tab' })

    expect(tabAll).toBeInTheDocument()
    expect(tabRates).toBeInTheDocument()
    expect(tabCharges).toBeInTheDocument()
    expect(tabUtilities).toBeInTheDocument()

    // Switch to Rate history tab
    await user.click(tabRates)
    expect(screen.getByRole('button', { name: 'Schedule rate' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'All Units' })).not.toBeInTheDocument()

    // Switch to Extra charges tab
    await user.click(tabCharges)
    expect(screen.getByRole('button', { name: 'Add extra charge' })).toBeInTheDocument()

    // Switch to Water & Electricity tab
    await user.click(tabUtilities)
    expect(screen.getByRole('button', { name: 'Import usage CSV' })).toBeInTheDocument()
  })

  describe('SSK-160: Configurable room / floor count', () => {
    it('opens apartment settings dialog and updates layout configuration', async () => {
      const user = userEvent.setup()
      render(<UnitsPage />)

      await screen.findByRole('heading', { name: 'All Units' })

      // Open settings
      const settingsBtn = screen.getByRole('button', { name: /apartment settings/i })
      await user.click(settingsBtn)

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Apartment settings')).toBeInTheDocument()

      const floorsInput = within(dialog).getByLabelText('Number of floors')
      const roomsInput = within(dialog).getByLabelText('Rooms per floor')

      expect(floorsInput).toHaveValue(2)
      expect(roomsInput).toHaveValue(12)
      expect(within(dialog).getByText('24 Units')).toBeInTheDocument()

      // Change to 4 floors and 10 rooms per floor = 40 units
      await user.clear(floorsInput)
      await user.type(floorsInput, '4')
      await user.clear(roomsInput)
      await user.type(roomsInput, '10')

      expect(within(dialog).getByText('40 Units')).toBeInTheDocument()

      // Save layout
      await user.click(within(dialog).getByRole('button', { name: 'Save layout' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // Toast notification and breadcrumb should reflect 40 units
      expect(screen.getByText(/Apartment layout updated: 4 floors, 10 rooms\/floor \(40 units\)/i)).toBeInTheDocument()
      expect(screen.getByText(/4 floors · 10 rooms\/floor \(40 units\)/i)).toBeInTheDocument()
    })
  })

  describe('SSK-162: Room rate history', () => {
    it('schedules a new future room rate and displays it in the rate table', async () => {
      const user = userEvent.setup()
      render(<UnitsPage />)

      // Go to Rate history tab
      await user.click(screen.getByRole('button', { name: 'Rate history tab' }))

      // Check existing rates for 101
      expect(screen.getByText('Original contract rate')).toBeInTheDocument()
      expect(screen.getByText('New monthly rate')).toBeInTheDocument()

      // Open schedule rate modal
      await user.click(screen.getByRole('button', { name: 'Schedule rate' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Schedule room rate')).toBeInTheDocument()

      // Fill in new rent
      const rentInput = within(dialog).getByLabelText('Monthly rent')
      await user.clear(rentInput)
      await user.type(rentInput, '5500')

      const reasonInput = within(dialog).getByLabelText('Reason / Notes')
      await user.clear(reasonInput)
      await user.type(reasonInput, 'Annual inflation adjustment')

      // Submit
      await user.click(within(dialog).getByRole('button', { name: 'Schedule rate' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // Table should now contain the new rate and reason
      expect(screen.getByText('฿5,500.00')).toBeInTheDocument()
      expect(screen.getByText('Annual inflation adjustment')).toBeInTheDocument()
    })
  })

  describe('SSK-165: Room extra charges', () => {
    it('adds and deletes room extra charges', async () => {
      const user = userEvent.setup()
      render(<UnitsPage />)

      // Switch to Extra charges tab
      await user.click(screen.getByRole('button', { name: 'Extra charges tab' }))

      // Initially has Parking space
      expect(screen.getByText('Parking space')).toBeInTheDocument()

      // Open Add Extra Charge dialog
      await user.click(screen.getByRole('button', { name: 'Add extra charge' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Add extra charge')).toBeInTheDocument()

      // Fill in details
      const descInput = within(dialog).getByLabelText('Charge description')
      await user.type(descInput, 'Gym access fee')

      const amountInput = within(dialog).getByLabelText('Amount (THB)')
      await user.clear(amountInput)
      await user.type(amountInput, '500')

      // Submit
      await user.click(within(dialog).getByRole('button', { name: 'Add charge' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // Gym access fee should be in the list
      expect(screen.getByText('Gym access fee')).toBeInTheDocument()
      expect(screen.getAllByText('฿500.00').length).toBeGreaterThanOrEqual(1)

      // Delete the newly added charge
      const deleteButtons = screen.getAllByRole('button', { name: /Delete charge Gym access fee/i })
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.queryByText('Gym access fee')).not.toBeInTheDocument()
      })
    })
  })

  describe('SSK-166 & SSK-167: Utilities usage and CSV import', () => {
    it('renders usage chart, toggles Water/Electricity and filters, and handles CSV export', async () => {
      const user = userEvent.setup()
      const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
      const revokeObjectURLMock = vi.fn()
      global.URL.createObjectURL = createObjectURLMock
      global.URL.revokeObjectURL = revokeObjectURLMock

      render(<UnitsPage />)

      // Switch to Water & Electricity tab
      await user.click(screen.getByRole('button', { name: 'Water & Electricity tab' }))

      // Water stats and headings
      expect(screen.getByText('WATER USAGE')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Water consumption' })).toBeInTheDocument()

      // Switch to Electricity
      await user.click(screen.getByRole('button', { name: 'Electricity utility' }))
      expect(screen.getByText('ELECTRICITY USAGE')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Electricity consumption' })).toBeInTheDocument()

      // Switch to Yearly period via select change
      fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'Yearly' } })

      expect(screen.getByDisplayValue('2024–2026')).toBeInTheDocument()

      // Test Export CSV
      const exportBtn = screen.getByRole('button', { name: 'Export CSV' })
      await user.click(exportBtn)
      expect(createObjectURLMock).toHaveBeenCalled()
    })

    it('imports water & electricity CSV via the 3-step wizard', async () => {
      const user = userEvent.setup()
      render(<UnitsPage />)

      await user.click(screen.getByRole('button', { name: 'Water & Electricity tab' }))

      // Open import dialog
      await user.click(screen.getByRole('button', { name: 'Import usage CSV' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Import water & electricity usage')).toBeInTheDocument()
      expect(within(dialog).getByText('1. Select file')).toBeInTheDocument()

      // Click "Use sample file"
      await user.click(within(dialog).getByRole('button', { name: 'Use sample file' }))
      expect(within(dialog).getByText('sample-usage.csv')).toBeInTheDocument()

      // Click Review rows
      await user.click(within(dialog).getByRole('button', { name: 'Review rows' }))

      // Step 2: Review rows
      expect(within(dialog).getByText('2. Review rows')).toBeInTheDocument()
      expect(within(dialog).getByText(/valid rows/i)).toBeInTheDocument()

      // Click Import rows
      await user.click(within(dialog).getByRole('button', { name: /Import .* rows/i }))

      // Step 3: Complete
      expect(within(dialog).getByText('3. Complete')).toBeInTheDocument()
      expect(within(dialog).getByText('Import Complete')).toBeInTheDocument()

      // Click "View usage charts"
      await user.click(within(dialog).getByRole('button', { name: 'View usage charts' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // Latest import stat should update
      expect(screen.getByText(/4 rows/i)).toBeInTheDocument()
    })
  })
})
