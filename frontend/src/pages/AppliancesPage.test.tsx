import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import AppliancesPage from './AppliancesPage'

/**
 * Tests Appliance Rental for SSK-96, where QA reported that the primary
 * buttons did not work in both tabs.
 *
 * This page does not have backend endpoints yet, so data lives in page state.
 * These tests prove that dialogs are wired to their tables, which is the
 * easiest part to break quietly when moving to real APIs later.
 */

async function openPage() {
  const user = userEvent.setup()
  render(<AppliancesPage />)
  await screen.findByRole('table')
  return user
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

beforeEach(() => {
  resetMockStore()
})

describe('SSK-96 Rental Requests tab', () => {
  it('opens the dialog when New Request is clicked', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New Appliance Request' })).toBeInTheDocument()
  })

  it('adds a rental request to the table and updates summary cards', async () => {
    const user = await openPage()
    expect(rows()).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('option', { name: '105' })

    await user.selectOptions(within(dialog).getByLabelText('Room *'), '105')
    await user.selectOptions(within(dialog).getByLabelText('Appliance *'), 'AP-011')
    await user.type(within(dialog).getByLabelText('Start Date *'), '2026-10-05')
    await user.click(within(dialog).getByRole('button', { name: 'Create Request' }))

    expect(rows()).toHaveLength(4)
    const added = screen.getByText('105').closest('tr')
    expect(within(added as HTMLElement).getByText('¥350')).toBeInTheDocument()
  })

  /**
   * Monthly fee and deposit are read-only fields filled from the catalog. The
   * design labels them "From catalog rate"; if they were editable, tenant
   * charges could drift from the published catalog.
   */
  it('fills monthly fee and deposit from the catalog and keeps them read-only', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('option', { name: '105' })
    await user.selectOptions(within(dialog).getByLabelText('Appliance *'), 'AP-011')

    const fee = within(dialog).getByLabelText(/Monthly Fee/)
    const deposit = within(dialog).getByLabelText(/Deposit/)
    expect(fee).toHaveValue('¥350')
    expect(deposit).toHaveValue('¥2,000')
    expect(fee).toHaveAttribute('readonly')
    expect(deposit).toHaveAttribute('readonly')
  })

  it('rejects saving without a selected room', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Create Request' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please choose a room')
    expect(rows()).toHaveLength(3)
  })
})

describe('SSK-96 Appliance Catalog tab', () => {
  async function openCatalog() {
    const user = await openPage()
    await user.click(screen.getByRole('button', { name: 'Appliance Catalog' }))
    return user
  }

  it('opens the dialog when Add Appliance is clicked', async () => {
    const user = await openCatalog()

    await user.click(screen.getByRole('button', { name: /Add Appliance/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Add Appliance' })).toBeInTheDocument()
  })

  it('adds a new catalog item with an auto-generated category SKU', async () => {
    const user = await openCatalog()
    expect(rows()).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: /Add Appliance/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Appliance name *'), 'Air Purifier')
    await user.selectOptions(within(dialog).getByLabelText(/Category \*/), 'Bedroom')
    await user.click(within(dialog).getByRole('button', { name: 'Add Appliance' }))

    expect(rows()).toHaveLength(6)
    const added = screen.getByText('Air Purifier').closest('tr')
    expect(within(added as HTMLElement).getByText('SKU: BE-001')).toBeInTheDocument()
  })

  it('edits the existing row instead of adding a new one', async () => {
    const user = await openCatalog()

    await user.click(screen.getByRole('button', { name: 'Edit Pocket Wi-Fi' }))
    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText('Appliance name *')
    await user.clear(name)
    await user.type(name, 'Pocket Wi-Fi 5G')
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    expect(rows()).toHaveLength(5)
    expect(screen.getByText('Pocket Wi-Fi 5G')).toBeInTheDocument()
    expect(screen.queryByText('Pocket Wi-Fi')).not.toBeInTheDocument()
  })

  /**
   * A low-stock threshold above the total owned quantity would keep the item
   * permanently flagged, making the label meaningless over time.
   */
  it('rejects a low-stock alert threshold above the owned quantity', async () => {
    const user = await openCatalog()

    await user.click(screen.getByRole('button', { name: /Add Appliance/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Appliance name *'), 'Heater')
    const owned = within(dialog).getByLabelText(/Quantity owned \*/)
    await user.clear(owned)
    await user.type(owned, '2')
    const low = within(dialog).getByLabelText(/Low stock alert at/)
    await user.clear(low)
    await user.type(low, '5')
    await user.click(within(dialog).getByRole('button', { name: 'Add Appliance' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'cannot be higher than the quantity owned',
    )
    expect(screen.queryByText('Heater')).not.toBeInTheDocument()
  })
})
