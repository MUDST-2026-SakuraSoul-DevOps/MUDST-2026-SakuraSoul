import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import ContractsPage from './ContractsPage'

/**
 * Tests Contract Management against the Figma design, including Edit mode,
 * three action buttons, Create Contract, Edit Contract, View PDF, and Contract Template.
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

    // Click Edit.
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    // Cancel and Done must be available.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    // Each row must show all three actions.
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

  it('edits a contract from Edit mode', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Edit contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    expect(within(dialog).getByRole('heading', { name: 'Edit Contract' })).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/Rent Amount/), { target: { value: '42000' } })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
