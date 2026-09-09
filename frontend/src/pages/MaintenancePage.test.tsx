import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MaintenancePage from './MaintenancePage'

/**
 * Unit tests for SSK-19 / View Maintenance History.
 *
 * The current frontend implementation provides a Maintenance Log tab with
 * sample history data. There is no backend integration for persisted
 * maintenance history yet, so these tests cover the visible history behavior
 * that exists in the frontend.
 *
 * Covered for now:
 * - Open the Maintenance Log tab.
 * - Render maintenance history summary cards.
 * - Show maintenance history rows.
 * - Search log history by task name.
 * - Search log history by unit number.
 * - Keep timestamp and status visible in each history row.
 *
 * Not covered yet:
 * - Loading maintenance history from the backend.
 * - Creating a new persisted log entry.
 * - Sorting or filtering history by date/status.
 */

async function openMaintenanceLog() {
  render(<MaintenancePage />)

  await userEvent.click(screen.getByRole('button', { name: 'Maintenance Log' }))
  await screen.findByRole('heading', { name: 'Maintenance Log History' })
}

describe('SSK-19 maintenance history view', () => {
  it('opens the Maintenance Log tab and shows history summary cards', async () => {
    await openMaintenanceLog()

    // This verifies that admins can enter the maintenance history section.
    expect(screen.getByRole('heading', { name: 'Maintenance Management' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Maintenance Log History' })).toBeInTheDocument()
    expect(screen.getByText('Total Logs')).toBeInTheDocument()
    expect(screen.getByText("Today's Activity")).toBeInTheDocument()
    expect(screen.getByText('Status Changes')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('shows maintenance history rows with task, unit, timestamp, and status data', async () => {
    await openMaintenanceLog()

    // This checks the core history table content that admins need to review past maintenance activity.
    const acRow = screen.getByText('AC Not Cooling').closest('tr')
    expect(acRow).not.toBeNull()
    expect(within(acRow!).getByText('Status updated to In Progress')).toBeInTheDocument()
    expect(within(acRow!).getByText('101')).toBeInTheDocument()
    expect(within(acRow!).getByText('13 Aug 09:32')).toBeInTheDocument()
    expect(within(acRow!).getByText('In Progress')).toBeInTheDocument()

    const faucetRow = screen.getByText('Leaking Faucet').closest('tr')
    expect(faucetRow).not.toBeNull()
    expect(within(faucetRow!).getByText('204')).toBeInTheDocument()
    expect(within(faucetRow!).getByText('Pending')).toBeInTheDocument()
  })

  it('filters maintenance history by task name', async () => {
    const user = userEvent.setup()
    await openMaintenanceLog()

    // This helps admins quickly find the history of a specific maintenance issue.
    await user.type(screen.getByPlaceholderText('Search Log'), 'Faucet')

    await waitFor(() => {
      expect(screen.queryByText('AC Not Cooling')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Leaking Faucet')).toBeInTheDocument()
    expect(screen.queryByText('Broken Blinds')).not.toBeInTheDocument()
  })

  it('filters maintenance history by unit number', async () => {
    const user = userEvent.setup()
    await openMaintenanceLog()

    // This verifies that admins can find history for a specific room/unit.
    await user.type(screen.getByPlaceholderText('Search Log'), '305')

    await waitFor(() => {
      expect(screen.queryByText('AC Not Cooling')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Leaking Faucet')).not.toBeInTheDocument()
    expect(screen.getByText('Broken Blinds')).toBeInTheDocument()
  })

  it('shows a Create Log button from the history tab', async () => {
    await openMaintenanceLog()

    // The button is visible, but the create-log flow is not wired to persistence yet.
    expect(screen.getByRole('button', { name: /create log/i })).toBeInTheDocument()
  })
})
