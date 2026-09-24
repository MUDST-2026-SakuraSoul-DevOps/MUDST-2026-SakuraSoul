import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import MaintenancePage from './MaintenancePage'
import { workWeekOf } from '../domain/maintenanceBoard'
import { todayInBangkok } from '../format'
import * as downloadModule from '../lib/downloadFile'


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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Maintenance Log tab', () => {
  it('loads maintenance history from the API instead of hardcoded sample data', async () => {
    await openLogTab()

    expect(logRows()).toHaveLength(4)
    expect(screen.getByText('AC compressor replacement')).toBeInTheDocument()
    expect(screen.getByText('Bathroom tap dripping')).toBeInTheDocument()
  })

    it('shows the Export Log button for US-18 but no Create Log button', async () => {
    await openLogTab()

    expect(screen.getByRole('button', { name: /Export Log/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Log/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search the maintenance log')).toBeInTheDocument()
  })

    it('does not export an empty file when the filter has no results', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), 'no such task name')
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no maintenance history to export',
    )
  })

  it('exports only the filtered rows to CSV', async () => {
    const download = vi.spyOn(downloadModule, 'downloadTextFile').mockImplementation(() => {})
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), '201')
    expect(logRows()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(download).toHaveBeenCalledTimes(1)
    const [filename, csv, mimeType] = download.mock.calls[0]
    expect(filename).toMatch(/^maintenance-log-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(mimeType).toBe('text/csv;charset=utf-8')
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(2)
    expect(csv).toContain('Bathroom tap dripping')
    expect(csv).toContain('201')
    expect(csv).not.toContain('AC compressor replacement')
  })

  it('calculates the four summary cards from the actual records', async () => {
    await openLogTab()

    expect(within(screen.getByRole('group', { name: 'Total Logs tasks' })).getByText('4')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Completed tasks' })).getByText('0')).toBeInTheDocument()
  })

    it('sorts records from newest report date to oldest according to US-13', async () => {
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
  it('filters the table by unit number', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), '201')

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Bathroom tap dripping')).toBeInTheDocument()
  })

  it('shows an empty-state message when the search has no results', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), 'no such task name')

    expect(await screen.findByText('Nothing matches your filter')).toBeInTheDocument()
  })
})


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
  it('adds a new task to the table and updates the summary counts', async () => {
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

  it('rejects a non-three-digit unit number without adding it to the table', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Bad Unit')
    await user.type(screen.getByLabelText('Unit Number'), '9')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('three digits')
    expect(screen.queryByText('Bad Unit')).not.toBeInTheDocument()
  })

    it('offers previously used names for Assigned To and Report By', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'New Task' }))

    const assignTo = screen.getByLabelText('Assigned To')
    const reportBy = screen.getByLabelText('Report By')
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

  it('allows a new technician name because no employee API exists yet', async () => {
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

    it('asks for confirmation before deleting a task', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'Delete task Leaking Faucet' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Are you sure you want to delete this task/)).toBeInTheDocument()
    expect(screen.getAllByText('Leaking Faucet')).toHaveLength(2)
    expect(taskRows()).toHaveLength(3)
  })

  it('removes the row after deletion is confirmed', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'Delete task Leaking Faucet' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))

    expect(screen.queryByText('Leaking Faucet')).not.toBeInTheDocument()
    expect(taskRows()).toHaveLength(2)
  })

  it('keeps the row when deletion is cancelled', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'Delete task Leaking Faucet' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Leaking Faucet')).toBeInTheDocument()
    expect(taskRows()).toHaveLength(3)
  })
})

describe('Supplies & Inventory tab', () => {
  it('filters supplies by item name', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.type(screen.getByRole('textbox', { name: 'Search items' }), 'Air Filters')

    const rows = taskRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Air Filters 16x20x1')).toBeInTheDocument()
    expect(screen.queryByText('LED Bulbs 60W')).not.toBeInTheDocument()
  })

  it('finds a supply by SKU even when its name does not match', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.type(screen.getByRole('textbox', { name: 'Search items' }), 'HV-042')

    const rows = taskRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Air Filters 16x20x1')).toBeInTheDocument()
  })

  it('assigns a SKU to a new supply item', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'New Supply Item' }))
    await user.type(screen.getByLabelText('Item Name'), 'Shower Head')
    await user.type(screen.getByLabelText('Category'), 'Plumbing')
    await user.click(screen.getByRole('button', { name: 'Add Supply' }))

    expect(screen.getByText('Shower Head')).toBeInTheDocument()
    expect(screen.getByText('SKU: PL-004')).toBeInTheDocument()
  })

    it('increases stock from the existing quantity when restocking', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '20')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('28')).toBeInTheDocument()
  })

  it('changes the status from Low Stock to In Stock after restocking above the minimum', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '20')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(within(row as HTMLElement).getByText('In Stock')).toBeInTheDocument()
  })

  it('rejects negative and zero restock quantities according to US-17-S5', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '-5')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('greater than 0')
    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(within(row as HTMLElement).getByText('8')).toBeInTheDocument()
  })

    it('prevents restocking above Max Stock for SSK-111', async () => {
    const user = await openTab('Supplies & Inventory')
    await user.click(screen.getByRole('button', { name: 'Restock LED Bulbs 60W' }))
    await user.type(screen.getByLabelText('Amount to add'), '139')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('above the maximum stock of 200')
    const row = screen.getByText('LED Bulbs 60W').closest('tr')
    expect(within(row as HTMLElement).getByText('145')).toBeInTheDocument()
  })

  it('shows the remaining restock allowance for SSK-111', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock LED Bulbs 60W' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/you can add up to 55 more/)).toBeInTheDocument()
  })

  it('prevents editing stock above Max Stock for SSK-111', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Edit item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    const quantity = within(dialog).getByLabelText('Quantity')
    await user.clear(quantity)
    await user.type(quantity, '284')
    await user.click(within(dialog).getByRole('button', { name: 'Edit Supply' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Quantity cannot be higher than maximum stock',
    )
  })

    it('shows Max Stock in the form and table for SSK-111', async () => {
    const user = await openTab('Supplies & Inventory')

    expect(screen.getByRole('columnheader', { name: 'MAX STOCK' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Max Stock')).toHaveValue(200)
  })

  it('rejects Max Stock below Min Stock for SSK-111', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Edit item Air Filters 16x20x1' }))
    const dialog = await screen.findByRole('dialog')
    const maxStock = within(dialog).getByLabelText('Max Stock')
    await user.clear(maxStock)
    await user.type(maxStock, '5')
    await user.click(within(dialog).getByRole('button', { name: 'Edit Supply' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'cannot be lower than minimum stock',
    )
  })

    it('SSK-111 asks for confirmation before deleting a task', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Delete item LED Bulbs 60W' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Are you sure you want to delete this item/)).toBeInTheDocument()
    expect(screen.getAllByText('LED Bulbs 60W')).toHaveLength(2)
  })

  it('SSK-111 removes the row after deletion is confirmed', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Delete item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete item' }))

    expect(screen.queryByText('LED Bulbs 60W')).not.toBeInTheDocument()
  })

  it('SSK-111 keeps the row when deletion is cancelled', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Delete item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('LED Bulbs 60W')).toBeInTheDocument()
  })

  it('shows Low Stock based on the current quantity', async () => {
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

  it('allows zero stock and shows Low Stock when the minimum is positive', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Edit item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    const quantity = within(dialog).getByLabelText('Quantity')
    await user.clear(quantity)
    await user.type(quantity, '0')
    await user.click(within(dialog).getByRole('button', { name: 'Edit Supply' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const row = screen.getByText('LED Bulbs 60W').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('0')).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText('Low Stock')).toBeInTheDocument()
  })
})

describe('Schedule & Reminder tab', () => {
    it('shows scheduled tasks on their dates in the current week', async () => {
    await openTab('Schedule & Reminder')

    const week = workWeekOf(todayInBangkok())
    const wednesday = screen.getByLabelText(`Schedule for ${week[2].label}`)
    const thursday = screen.getByLabelText(`Schedule for ${week[3].label}`)

    expect(within(wednesday).getByText('Plumbing Check')).toBeInTheDocument()
    expect(within(thursday).queryByText('Plumbing Check')).toBeNull()
  })

  it('marks long-overdue cards as Overdue', async () => {
    await openTab('Schedule & Reminder')

    const roofing = screen.getByText('Roofing Inspection').closest('div')?.parentElement
    expect(roofing).not.toBeNull()
    expect(within(roofing as HTMLElement).getByText('Overdue')).toBeInTheDocument()
  })

  it('shows GMT+7 instead of GMT+9 for the Thailand apartment', async () => {
    await openTab('Schedule & Reminder')

    expect(screen.getByText('GMT+7')).toBeInTheDocument()
    expect(screen.queryByText('GMT+9')).toBeNull()
  })

  it('adds a new card to the Recurring section after saving a reminder', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'Gutter Cleaning')
    await user.type(screen.getByLabelText('Start Date'), '2026-11-02')
    await screen.findByRole('option', { name: '101' })
    await user.selectOptions(screen.getByLabelText('Assigned Unit'), '101')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(screen.getByText('Gutter Cleaning')).toBeInTheDocument()
    expect(screen.getByText('Next: 2026-11-02')).toBeInTheDocument()
  })

    it('does not save a reminder without a unit', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'No Unit')
    await user.type(screen.getByLabelText('Start Date'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose the unit')
  })

  it('uses a dropdown of real units for Assigned Unit', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    const unitField = screen.getByLabelText('Assigned Unit')
    expect(unitField.tagName).toBe('SELECT')

    await screen.findByRole('option', { name: '101' })
    const offered = within(unitField).getAllByRole('option').map((o) => o.textContent)
    expect(offered).toContain('101')
    expect(offered).toContain('212')
    expect(offered).not.toContain('999')
  })

  it('does not save a reminder without a start date', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'No Start Date')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose a start date')
  })

  it('opens the recurring reminder delete confirmation and supports cancelling', async () => {
    const user = await openTab('Schedule & Reminder')

    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Options for HVAC Inspection' }))

    expect(screen.getByRole('heading', { name: 'Delete Recurring Reminder' })).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to delete this reminder/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('heading', { name: 'Delete Recurring Reminder' })).not.toBeInTheDocument()
    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()
  })

  it('removes a recurring reminder after deletion is confirmed', async () => {
    const user = await openTab('Schedule & Reminder')

    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Options for HVAC Inspection' }))
    await user.click(screen.getByRole('button', { name: 'Delete reminder' }))

    expect(screen.queryByRole('heading', { name: 'Delete Recurring Reminder' })).not.toBeInTheDocument()
    expect(screen.queryByText('HVAC Inspection')).not.toBeInTheDocument()
    expect(screen.getByText('Fire Safety Audit')).toBeInTheDocument()
  })
})
