import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import AppliancesPage from './AppliancesPage'

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
  it('opens the New Request popup', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New Appliance Request' })).toBeInTheDocument()
  })

  it('adds a rental request to the table and updates the summary cards', async () => {
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
    expect(within(added as HTMLElement).getByText('฿350.00')).toBeInTheDocument()
  })

  it('populates the rental fee and deposit from the catalog as read-only values', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('option', { name: '105' })
    await user.selectOptions(within(dialog).getByLabelText('Appliance *'), 'AP-011')

    const fee = within(dialog).getByLabelText(/Monthly Fee/)
    const deposit = within(dialog).getByLabelText(/Deposit/)
    expect(fee).toHaveValue('฿350.00')
    expect(deposit).toHaveValue('฿2,000.00')
    expect(fee).toHaveAttribute('readonly')
    expect(deposit).toHaveAttribute('readonly')
  })

  it('does not save without a selected room', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Create Request' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please choose a room')
    expect(rows()).toHaveLength(3)
  })

  it('opens the delete confirmation and removes a rental request (BUG-A2)', async () => {
    const user = await openPage()
    expect(rows()).toHaveLength(3)

    const deleteBtn = screen.getByRole('button', { name: 'Delete request for unit 101' })
    await user.click(deleteBtn)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Confirm Delete Rental Request' })).toBeInTheDocument()
    expect(within(dialog).getByText(/Are you sure you want to delete/)).toBeInTheDocument()
    expect(within(dialog).getAllByText('Unit 101').length).toBeGreaterThan(0)

    await user.click(within(dialog).getByRole('button', { name: 'Confirm Delete' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    expect(screen.queryByText('101')).not.toBeInTheDocument()
  })

  it('keeps the rental request when deletion is canceled (BUG-A2)', async () => {
    const user = await openPage()
    expect(rows()).toHaveLength(3)

    const deleteBtn = screen.getByRole('button', { name: 'Delete request for unit 101' })
    await user.click(deleteBtn)

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rows()).toHaveLength(3)
    expect(screen.getByText('101')).toBeInTheDocument()
  })
})


describe('SSK-96 Appliance Catalog tab', () => {
  async function openCatalog() {
    const user = await openPage()
    await user.click(screen.getByRole('button', { name: 'Appliance Catalog' }))
    return user
  }

  it('opens the Add Appliance popup', async () => {
    const user = await openCatalog()

    await user.click(screen.getByRole('button', { name: /Add Appliance/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Add Appliance' })).toBeInTheDocument()
  })

  it('creates a new appliance with an automatically generated category SKU', async () => {
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

  it('edits an existing appliance without adding a new row', async () => {
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

  it('rejects a low-stock threshold higher than the owned quantity', async () => {
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

// SSK-141 หน้านี้ยังไม่มี backend (SSK-142) ต้องไม่ทำให้ผู้ใช้เข้าใจว่าบันทึกหรือออกบิลแล้ว
describe('SSK-141 the prototype says what it does not do', () => {
  it('warns that changes are not saved and does not claim the fees are billed', async () => {
    await openPage()

    const notice = screen.getByText('Prototype — changes are not saved.').closest('[role="status"]')
    expect(notice).toHaveTextContent('This page is not connected to the backend yet; data resets when you reload.')
    expect(screen.getByText('Not added to monthly bills yet')).toBeInTheDocument()
    expect(screen.queryByText("Added to this month's bills")).not.toBeInTheDocument()
  })

  it('does not promise an Appliance Fee line on the bill in the request popup', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/Appliance fees are not added to the monthly bill yet/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/is added\s+as an/)).not.toBeInTheDocument()
  })
})
