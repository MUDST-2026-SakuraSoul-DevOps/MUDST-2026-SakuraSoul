import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import MaintenancePage from './MaintenancePage'
import { workWeekOf } from '../domain/maintenanceBoard'
import { todayInBangkok } from '../format'

/**
 * Tests the Maintenance Log tab for US-18 at the page level.
 *
 * The Export button itself is covered in ExportLogButton.test.tsx. This file
 * focuses on the page wiring that test cannot cover: the page must pass the
 * filtered list to the button, not the full list. That is the core of US-18-S2;
 * if this wiring breaks, export still works but includes rows the user filtered out.
 */

async function openLogTab() {
  const user = userEvent.setup()
  render(<MaintenancePage />)
  await user.click(screen.getByRole('button', { name: 'Maintenance Log' }))
  await screen.findByRole('table')
  return user
}

function logRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

beforeEach(() => {
  resetMockStore()
})

describe('Maintenance Log tab', () => {
  it('loads maintenance history from the API instead of hard-coded sample data', async () => {
    await openLogTab()

    expect(logRows()).toHaveLength(4)
    expect(screen.getByText('AC compressor replacement')).toBeInTheDocument()
    expect(screen.getByText('Bathroom tap dripping')).toBeInTheDocument()
  })

  /*
    US-18 remains in scope: admins must be able to export maintenance history
    for reporting or sharing. The Create Log button is intentionally out.
  */
  it('shows Export Log for US-18 and does not show Create Log', async () => {
    await openLogTab()

    expect(screen.getByRole('button', { name: /Export Log/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Log/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search the maintenance log')).toBeInTheDocument()
  })

  /*
    US-18-S2 requires the file to contain only rows currently visible after
    filtering. If the wiring is wrong, the button still exports but includes
    hidden rows.
  */
  it('does not create an empty file when exporting after filtering to no rows', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), 'no such task name')
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no maintenance history to export',
    )
  })

  it('calculates the summary cards from real tickets', async () => {
    await openLogTab()

    expect(within(screen.getByRole('group', { name: 'Total Logs tasks' })).getByText('4')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Completed tasks' })).getByText('0')).toBeInTheDocument()
  })

  /**
   * US-13 requires history from newest to oldest. The mock sorts this in
   * GET /api/maintenance (mockApi.ts), but there was no page-level test to
   * catch regressions if the mock order changes or the real backend returns
   * unsorted data later.
   */
  it('sorts items from newest reported date to oldest for US-13', async () => {
    await openLogTab()

    const titles = logRows().map((row) => within(row).getAllByRole('cell')[0].textContent)
    expect(titles).toEqual([
      expect.stringContaining('Scheduled AC cleaning'),
      expect.stringContaining('Bathroom drain pipe leaking'),
      expect.stringContaining('Bathroom tap dripping'),
      expect.stringContaining('AC compressor replacement'),
    ])
  })
})

describe('Maintenance Log search', () => {
  it('filters by room number', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), '201')

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Bathroom tap dripping')).toBeInTheDocument()
  })

  it('shows an empty state when no rows match the filter', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), 'no such task name')

    expect(await screen.findByText('Nothing matches your filter')).toBeInTheDocument()
  })
})

/**
 * Tests the Tasks, Supplies, and Schedule tabs from the latest design update
 * that added dialogs.
 *
 * These three tabs do not have real endpoints yet, so their data lives in page
 * state. The tests prove that dialogs are wired to the tables, which is the
 * easiest part to break quietly when switching to real APIs.
 */

async function openTab(label: string) {
  const user = userEvent.setup()
  render(<MaintenancePage />)
  await user.click(screen.getByRole('button', { name: label }))
  return user
}

function taskRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

describe('Maintenance Tasks tab', () => {
  it('creates a new task, adds it to the table, and updates the summary count', async () => {
    const user = await openTab('Maintenance Tasks')

    expect(taskRows()).toHaveLength(3)
    const total = screen.getByRole('group', { name: 'Total Tasks tasks' })
    expect(within(total).getByText('3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Window Latch Broken')
    await user.type(screen.getByLabelText('Unit Number'), '108')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(taskRows()).toHaveLength(4)
    expect(screen.getByText('Window Latch Broken')).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Total Tasks tasks' })).getByText('4'),
    ).toBeInTheDocument()
  })

  it('rejects non-three-digit room numbers and does not add a row', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Bad Unit')
    await user.type(screen.getByLabelText('Unit Number'), '9')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('three digits')
    expect(screen.queryByText('Bad Unit')).not.toBeInTheDocument()
  })

  /*
    QA noted that Assigned To / Report By were free-text fields even though the
    design shows dropdowns. That allowed inconsistent spellings for the same
    person and broke later filtering (SSK-94). There is no staff API yet, so the
    page offers names already used in the system.
  */
  it('suggests existing names for Assigned To and Report By', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'New Task' }))

    const assignTo = screen.getByLabelText('Assigned To')
    const reportBy = screen.getByLabelText('Report By')
    // Use separate datalists so reporter names are not offered as assignees.
    expect(assignTo).toHaveAttribute('list')
    expect(reportBy).toHaveAttribute('list')
    expect(assignTo.getAttribute('list')).not.toBe(reportBy.getAttribute('list'))

    const assignOptions = [
      ...document.querySelectorAll(`#${assignTo.getAttribute('list')} option`),
    ].map((o) => o.getAttribute('value'))
    expect(assignOptions).toEqual(['Kenji Tanaka', 'Mei Lin'])

    const reportOptions = [
      ...document.querySelectorAll(`#${reportBy.getAttribute('list')} option`),
    ].map((o) => o.getAttribute('value'))
    expect(reportOptions).toEqual(['Alex P.', 'David W.', 'Sarah J.'])
  })

  it('still allows entering a new technician name while there is no staff API', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'New Tech Job')
    await user.type(screen.getByLabelText('Unit Number'), '110')
    await user.type(screen.getByLabelText('Assigned To'), 'Haruto Mori')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    const row = screen.getByText('New Tech Job').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Haruto Mori')).toBeInTheDocument()
  })

  it('updates the existing task row instead of adding a new row', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'Edit task Leaking Faucet' }))
    const title = screen.getByLabelText('Task Title')
    await user.clear(title)
    await user.type(title, 'Leaking Faucet (urgent)')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(taskRows()).toHaveLength(3)
    expect(screen.getByText('Leaking Faucet (urgent)')).toBeInTheDocument()
    expect(screen.queryByText('Leaking Faucet')).not.toBeInTheDocument()
  })
})

describe('Supplies & Inventory tab', () => {
  it('adds a new supply item with an auto-generated SKU', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'New Supply Item' }))
    await user.type(screen.getByLabelText('Item Name'), 'Shower Head')
    await user.type(screen.getByLabelText('Category'), 'Plumbing')
    await user.click(screen.getByRole('button', { name: 'Add Supply' }))

    expect(screen.getByText('Shower Head')).toBeInTheDocument()
    expect(screen.getByText('SKU: PL-004')).toBeInTheDocument()
  })

  /**
   * US-17-S2 says "click restock for that item and enter Amount to add". QA
   * pointed out that both the button and form were missing in earlier branches,
   * including the first version of this page.
   */
  it('adds restock quantity to the existing stock instead of replacing it', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '20')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('28')).toBeInTheDocument()
  })

  it('changes Low Stock to In Stock after restocking above the minimum', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '20')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(within(row as HTMLElement).getByText('In Stock')).toBeInTheDocument()
  })

  it('rejects zero or negative restock quantities for US-17-S5', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '-5')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('greater than 0')
    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(within(row as HTMLElement).getByText('8')).toBeInTheDocument()
  })

  it('calculates Low Stock from the actual quantity instead of a stored label', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Edit item LED Bulbs 60W' }))
    const quantity = screen.getByLabelText('Quantity')
    await user.clear(quantity)
    await user.type(quantity, '1')
    await user.click(screen.getByRole('button', { name: 'Edit Supply' }))

    const row = screen.getByText('LED Bulbs 60W').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Low Stock')).toBeInTheDocument()
  })
})

describe('Schedule & Reminder tab', () => {
  /**
   * Day labels are no longer constants; the calendar follows the real work
   * week as QA requested. This test computes expected labels with the same
   * helper the page uses, so reintroducing a fixed week will fail.
   */
  it('shows scheduled work on the correct day in the current work week', async () => {
    await openTab('Schedule & Reminder')

    const week = workWeekOf(todayInBangkok())
    const wednesday = screen.getByLabelText(`Schedule for ${week[2].label}`)
    const thursday = screen.getByLabelText(`Schedule for ${week[3].label}`)

    expect(within(wednesday).getByText('Plumbing Check')).toBeInTheDocument()
    expect(within(thursday).queryByText('Plumbing Check')).toBeNull()
  })

  it('shows Overdue on cards that are far past due', async () => {
    await openTab('Schedule & Reminder')

    const roofing = screen.getByText('Roofing Inspection').closest('div')?.parentElement
    expect(roofing).not.toBeNull()
    expect(within(roofing as HTMLElement).getByText('Overdue')).toBeInTheDocument()
  })

  it('shows GMT+7 instead of GMT+9 because the apartment is in Thailand', async () => {
    await openTab('Schedule & Reminder')

    expect(screen.getByText('GMT+7')).toBeInTheDocument()
    expect(screen.queryByText('GMT+9')).toBeNull()
  })

  it('adds a reminder and shows a new card in Recurring', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'Gutter Cleaning')
    await user.type(screen.getByLabelText('Start Date'), '2026-11-02')
    // The unit field is a dropdown from real rooms, so wait for options to load.
    await screen.findByRole('option', { name: '101' })
    await user.selectOptions(screen.getByLabelText('Assigned Unit'), '101')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(screen.getByText('Gutter Cleaning')).toBeInTheDocument()
    expect(screen.getByText('Next: 2026-11-02')).toBeInTheDocument()
  })

  /*
    QA typed arbitrary letters into Assigned Unit and saved a reminder linked
    to a non-existent room (SSK-92). The field is now a dropdown, and missing
    selection must be rejected instead of saved.
  */
  it('rejects saving without a selected unit', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'No Unit')
    await user.type(screen.getByLabelText('Start Date'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose the unit')
  })

  it('uses a dropdown of real rooms for Assigned Unit', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    const unitField = screen.getByLabelText('Assigned Unit')
    expect(unitField.tagName).toBe('SELECT')

    await screen.findByRole('option', { name: '101' })
    const offered = within(unitField).getAllByRole('option').map((o) => o.textContent)
    expect(offered).toContain('101')
    expect(offered).toContain('212')
    // Non-existent rooms must not be offered.
    expect(offered).not.toContain('999')
  })

  it('rejects saving without a start date', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'No Start Date')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose a start date')
  })

  it('opens the delete confirmation from the recurring card menu and cancels it', async () => {
    const user = await openTab('Schedule & Reminder')

    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()

    // Open delete popup.
    await user.click(screen.getByRole('button', { name: 'Options for HVAC Inspection' }))

    expect(screen.getByRole('heading', { name: 'Delete Recurring Reminder' })).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to delete this reminder/i)).toBeInTheDocument()

    // Cancel deletion.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('heading', { name: 'Delete Recurring Reminder' })).not.toBeInTheDocument()
    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()
  })

  it('deletes the recurring reminder after confirmation', async () => {
    const user = await openTab('Schedule & Reminder')

    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()

    // Open delete popup.
    await user.click(screen.getByRole('button', { name: 'Options for HVAC Inspection' }))
    // Confirm deletion.
    await user.click(screen.getByRole('button', { name: 'Delete reminder' }))

    expect(screen.queryByRole('heading', { name: 'Delete Recurring Reminder' })).not.toBeInTheDocument()
    expect(screen.queryByText('HVAC Inspection')).not.toBeInTheDocument()
    expect(screen.getByText('Fire Safety Audit')).toBeInTheDocument()
  })
})
