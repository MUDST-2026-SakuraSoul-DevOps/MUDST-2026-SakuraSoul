import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContractsPage from './ContractsPage'

/**
 * Unit tests for SSK-17 / Generate Lease Contract.
 *
 * The current frontend implementation is still a UI-only contract list that uses
 * sample contract data. There is no working generate/download contract action yet.
 *
 * Covered for now:
 * - Render the Contract Management page.
 * - Show existing sample contract rows.
 * - Search contracts by tenant name.
 * - Search contracts by unit name.
 * - Show one contract action button per contract row.
 *
 * Not covered yet:
 * - Generating a real lease contract document.
 * - Downloading or previewing a generated contract file.
 * - Calling a backend endpoint for contract generation.
 */

describe('SSK-17 generate lease contract page readiness', () => {
  it('renders the contract management page with contract rows', () => {
    render(<ContractsPage />)

    // This verifies that admins can see the contract management screen before generating contracts.
    expect(screen.getByRole('heading', { name: 'Contract Management' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create contract/i })).toBeInTheDocument()
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
    expect(screen.getByText('Hiroshi Nakamura')).toBeInTheDocument()
  })

  it('filters contracts by tenant name', async () => {
    const user = userEvent.setup()
    render(<ContractsPage />)

    // This helps admins quickly find the lease contract that should be generated or reviewed.
    await user.type(screen.getByPlaceholderText('Search by Tenant or Unit...'), 'Kenji')

    await waitFor(() => {
      expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
    expect(screen.queryByText('Hiroshi Nakamura')).not.toBeInTheDocument()
  })

  it('filters contracts by unit name', async () => {
    const user = userEvent.setup()
    render(<ContractsPage />)

    // This verifies that contract search also works through room/unit information, not only tenant names.
    await user.type(screen.getByPlaceholderText('Search by Tenant or Unit...'), 'Maple')

    await waitFor(() => {
      expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()
    expect(screen.getByText('Hiroshi Nakamura')).toBeInTheDocument()
  })

  it('shows one contract action button for each visible contract row', () => {
    render(<ContractsPage />)

    // The action buttons are currently only UI affordances; the generate/download behavior is not wired yet.
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)

    for (const row of rows) {
      expect(within(row).getByRole('button', { name: 'ดูสัญญา' })).toBeInTheDocument()
    }
  })
})
