import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import { updateApartmentConfig } from '../api/client'
import ContractsPage from './ContractsPage'

/**
 * Covers the Contract Management page and its Figma design.
 * Includes Edit mode, its three actions, Create Contract, Edit Contract, PDF preview, and Contract Template.
 */

async function renderContracts() {
  render(<ContractsPage />)
  await screen.findByText('Yuki Tanaka')
}

function rowOf(tenantName: string): HTMLElement {
  const row = screen.getByText(tenantName).closest('tr')
  if (!row) {
    throw new Error(`No row found for ${tenantName}`)
  }
  return row
}

beforeEach(() => {
  resetMockStore()
})

describe('Contract Management list', () => {
  it('renders the contract list correctly', async () => {
    await renderContracts()

    expect(screen.getByText('Contract Management')).toBeInTheDocument()
    expect(screen.getByText('Create Contract')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()

    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Arisa Fujimoto')).toBeInTheDocument()
    expect(within(rowOf('Yuki Tanaka')).getByText(/Unit 4A - Sakura Wing/)).toBeInTheDocument()
  })

  it('enters Edit mode and shows all three action buttons', async () => {
    const user = userEvent.setup()
    await renderContracts()

    // Enter Edit mode.
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    // Edit mode provides both Cancel and Done controls.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    // Each row exposes all three actions.
    const row = rowOf('Yuki Tanaka')
    expect(within(row).getByLabelText('Edit contract for Unit 102')).toBeInTheDocument()
    expect(within(row).getByLabelText('Upload signed contract for Unit 102')).toBeInTheDocument()
    expect(within(row).getByLabelText('Contract template for Unit 102')).toBeInTheDocument()
  })

  it('opens the Create Contract modal from the Create Contract button', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })
    expect(within(dialog).getByRole('heading', { name: 'Create Contract' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Unit/)).toBeInTheDocument()
  })

  it('opens the Residential Lease Agreement preview from Print/PDF', async () => {
    const user = userEvent.setup()
    await renderContracts()

    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByRole('button', { name: 'View contract for Unit 102' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract PDF Preview' })
    expect(within(dialog).getByText('Residential Lease Agreement')).toBeInTheDocument()
    expect(within(dialog).getByText('Save as PDF')).toBeInTheDocument()
  })

  it('opens the Contract Template modal from the third Edit mode action', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Contract template for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Contract Template' })
    expect(within(dialog).getByText('Contract Template')).toBeInTheDocument()
    expect(within(dialog).getByText(/Available variables/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Save Template/)).toBeInTheDocument()
  })

  it('updates the table after editing a contract tenant and confirming', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(within(rowOf('Yuki Tanaka')).getByLabelText('Edit contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    expect(within(dialog).getByRole('heading', { name: 'Edit Contract' })).toBeInTheDocument()

    await user.selectOptions(within(dialog).getByLabelText(/^Tenant/), '6')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Haruto Watanabe')).toBeInTheDocument()
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
  })

  it('discards edited lease dates after Cancel', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(within(rowOf('Yuki Tanaka')).getByLabelText('Edit contract for Unit 102'))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    const endDate = within(dialog).getByLabelText(/^End Date/)
    const originalEndDate = (endDate as HTMLInputElement).value

    fireEvent.change(endDate, { target: { value: '2027-12-31' } })
    expect(endDate).toHaveValue('2027-12-31')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await user.click(within(rowOf('Yuki Tanaka')).getByLabelText('Edit contract for Unit 102'))
    const reopenedDialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    expect(within(reopenedDialog).getByLabelText(/^End Date/)).toHaveValue(originalEndDate)
  })

  it('keeps the dialog open and shows validation when the end date is before the start date', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(within(rowOf('Yuki Tanaka')).getByLabelText('Edit contract for Unit 102'))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })

    fireEvent.change(within(dialog).getByLabelText(/^Start Date/), { target: { value: '2026-12-31' } })
    fireEvent.change(within(dialog).getByLabelText(/^End Date/), { target: { value: '2026-01-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    expect(await within(dialog).findByText('End Date must not be earlier than Start Date.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Contract' })).toBeInTheDocument()
  })
})

describe('SSK-112 Create/Edit Contract form fixes', () => {
  it('allows saving a contract without a Line ID because it is optional', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Edit contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    const lineId = within(dialog).getByLabelText(/Line ID/)
    const label = dialog.querySelector(`label[for="${lineId.id}"]`)
    expect(label).toHaveTextContent('(optional)')
    expect(label?.textContent).not.toContain('*')

    await user.clear(lineId)
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('updates the rent amount when the room type changes', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Edit contract for Unit 102'))

    // Unit 102 is a double room, so its initial rent comes from the existing lease.
    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    expect(within(dialog).getByLabelText(/Room Type/)).toHaveValue('DOUBLE')

    await user.selectOptions(within(dialog).getByLabelText(/Room Type/), 'SINGLE')

    expect(within(dialog).getByLabelText(/Rent Amount/)).toHaveValue(3500)
    expect(within(dialog).getByLabelText(/Security Deposit/)).toHaveValue(7000)
  })

  it('synchronizes room type and rent amount when the unit changes', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    const unitSelect = within(dialog).getByLabelText(/Unit/)
    // Unit 104 is a vacant double room with no active lease.
    await user.selectOptions(unitSelect, screen.getByRole('option', { name: /104 · Floor 1/ }))

    expect(within(dialog).getByLabelText(/Room Type/)).toHaveValue('DOUBLE')
    expect(within(dialog).getByLabelText(/Rent Amount/)).toHaveValue(4500)
    expect(within(dialog).getByLabelText(/Security Deposit/)).toHaveValue(9000)
  })

  it('allows clearing Rent Amount, Security Deposit, and Common Area Fee without leaving zero values', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    const rentAmount = within(dialog).getByLabelText(/Rent Amount/)
    const securityDeposit = within(dialog).getByLabelText(/Security Deposit/)
    const commonFee = within(dialog).getByLabelText(/Common Area Fee/)

    await user.clear(rentAmount)
    await user.clear(securityDeposit)
    await user.clear(commonFee)

    expect(rentAmount).toHaveValue(null)
    expect(securityDeposit).toHaveValue(null)
    expect(commonFee).toHaveValue(null)

    await user.type(rentAmount, '4200')
    expect(rentAmount).toHaveValue(4200)
  })

  it('shows Water and Electric Billing Type rates from Apartment Config', async () => {
    const user = userEvent.setup()
    await updateApartmentConfig({
      electricRatePerUnit: 50,
      waterRatePerUnit: 100,
      commonAreaFee: 300,
      internetFee: 250,
    })
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    expect(
      await within(dialog).findByRole('option', { name: 'Per unit - ¥50.00' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: 'Per unit - ¥100.00' })).toBeInTheDocument()
  })
})
