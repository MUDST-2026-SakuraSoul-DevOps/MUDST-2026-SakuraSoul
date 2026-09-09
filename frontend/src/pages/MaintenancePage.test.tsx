import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MaintenancePage from './MaintenancePage'

/**
 * Unit tests for SSK-18 / Log Maintenance Record.
 *
 * The current frontend implementation only provides a Maintenance Tasks table
 * with sample data. The actual maintenance log form and backend API are not
 * wired yet, so these tests cover the available UI behavior first.
 *
 * Covered for now:
 * - Render the Maintenance Management page.
 * - Show sample maintenance task records.
 * - Search maintenance tasks by task name.
 * - Search maintenance tasks by unit number.
 * - Show one edit action per visible maintenance task row.
 * - Show the placeholder state for the Maintenance Log tab.
 *
 * Not covered yet:
 * - Creating a real maintenance log record.
 * - Saving maintenance records to the backend.
 * - Viewing persisted maintenance history from real data.
 */

describe('SSK-18 maintenance record page readiness', () => {
  it('renders the maintenance management page with task records', () => {
    render(<MaintenancePage />)

    // This verifies that admins can open the maintenance area and see current maintenance records.
    expect(screen.getByRole('heading', { name: 'Maintenance Management' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Task Overview' })).toBeInTheDocument()
    expect(screen.getByText('AC Not Cooling')).toBeInTheDocument()
    expect(screen.getByText('Leaking Faucet')).toBeInTheDocument()
    expect(screen.getByText('Broken Blinds')).toBeInTheDocument()
  })

  it('filters maintenance tasks by task name', async () => {
    const user = userEvent.setup()
    render(<MaintenancePage />)

    // This helps admins find a specific maintenance record quickly by issue name.
    await user.type(screen.getByPlaceholderText('Search Task...'), 'Faucet')

    await waitFor(() => {
      expect(screen.queryByText('AC Not Cooling')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Leaking Faucet')).toBeInTheDocument()
    expect(screen.queryByText('Broken Blinds')).not.toBeInTheDocument()
  })

  it('filters maintenance tasks by unit number', async () => {
    const user = userEvent.setup()
    render(<MaintenancePage />)

    // This verifies that admins can find maintenance records from the room/unit number.
    await user.type(screen.getByPlaceholderText('Search Task...'), '205')

    await waitFor(() => {
      expect(screen.queryByText('AC Not Cooling')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Leaking Faucet')).not.toBeInTheDocument()
    expect(screen.getByText('Broken Blinds')).toBeInTheDocument()
  })

  it('shows one edit action for each visible maintenance task row', () => {
    render(<MaintenancePage />)

    // The edit buttons are available as UI affordances, but the edit flow is not wired yet.
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)

    for (const row of rows) {
      expect(within(row).getByRole('button', { name: 'แก้ไขงาน' })).toBeInTheDocument()
    }
  })

  it('shows a placeholder when the Maintenance Log tab is opened', async () => {
    const user = userEvent.setup()
    render(<MaintenancePage />)

    // This documents the current limitation: the log tab exists, but its content is not implemented yet.
    await user.click(screen.getByRole('button', { name: 'Maintenance Log' }))

    expect(await screen.findByText('ยังไม่มี design context สำหรับ Maintenance Log')).toBeInTheDocument()
  })
})
