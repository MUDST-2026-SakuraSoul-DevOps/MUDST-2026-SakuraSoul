import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import MaintenancePage from './MaintenancePage'

/**
 * Screen-level tests for the Maintenance Log tab.
 *
 * ExportLogButton has its own focused unit tests, so this file checks the
 * screen behavior around it. The important part is that the page passes the
 * filtered maintenance log rows to the export button, not the full unfiltered
 * list. If that connection breaks, the export button could still work, but the
 * downloaded file would include rows the user already filtered out.
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
  it('loads maintenance history from the API instead of hard-coded page data', async () => {
    await openLogTab()

    expect(logRows()).toHaveLength(4)
    expect(screen.getByText('เปลี่ยนคอมเพรสเซอร์แอร์')).toBeInTheDocument()
    expect(screen.getByText('ก๊อกอ่างล้างหน้าหยด')).toBeInTheDocument()
  })

  it('shows the Export Log button in the Maintenance Log tab', async () => {
    await openLogTab()

    expect(screen.getByRole('button', { name: /Export Log/ })).toBeInTheDocument()
  })
})

describe('US-18-S2 filtered export behavior', () => {
  it('filters the table by maintenance status', async () => {
    const user = await openLogTab()

    await user.click(screen.getByRole('button', { name: 'In Progress' }))

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('เปลี่ยนคอมเพรสเซอร์แอร์')).toBeInTheDocument()
  })

  it('filters the table by room number search', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('ค้นหาประวัติงานซ่อมบำรุง'), '201')

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('ก๊อกอ่างล้างหน้าหยด')).toBeInTheDocument()
  })

  it('does not export an empty file when no log rows match the current filters', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('ค้นหาประวัติงานซ่อมบำรุง'), 'ไม่มีงานซ่อมชื่อนี้')
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ยังไม่มีประวัติงานซ่อมให้ export')
  })
})

/**
 * Tests for the Tasks, Supplies, and Schedule tabs after dialog flows were added.
 *
 * These tabs still use local page state instead of real backend endpoints.
 * The tests focus on whether dialogs are connected to the visible page state,
 * because this is the part most likely to break quietly when the page later
 * moves from local state to real APIs.
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
  it('adds a new task to the table and updates the summary count', async () => {
    const user = await openTab('Maintenance Tasks')

    expect(taskRows()).toHaveLength(3)
    const total = screen.getByRole('group', { name: 'จำนวนงานซ่อม Total Tasks' })
    expect(within(total).getByText('3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Window Latch Broken')
    await user.type(screen.getByLabelText('Unit Number'), '108')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(taskRows()).toHaveLength(4)
    expect(screen.getByText('Window Latch Broken')).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'จำนวนงานซ่อม Total Tasks' })).getByText('4'),
    ).toBeInTheDocument()
  })

  it('rejects an invalid unit number and does not add the task to the table', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Bad Unit')
    await user.type(screen.getByLabelText('Unit Number'), '9')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('สามหลัก')
    expect(screen.queryByText('Bad Unit')).not.toBeInTheDocument()
  })

  it('updates an existing task row instead of adding a duplicate row', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'แก้ไขงาน Leaking Faucet' }))
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

  it('recomputes Low Stock from the current quantity instead of a stale saved value', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'แก้ไขอะไหล่ LED Bulbs 60W' }))
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
  it('shows scheduled events on the correct calendar day', async () => {
    await openTab('Schedule & Reminder')

    // Plumbing Check should appear only on its scheduled day.
    const wednesday = screen.getByLabelText('ตารางงานวัน Wed 16')
    expect(within(wednesday).getByText('Plumbing Check')).toBeInTheDocument()
    expect(within(screen.getByLabelText('ตารางงานวัน Thu 17')).queryByText('Plumbing Check')).toBeNull()
  })

  it('adds a new reminder card after saving the reminder dialog', async () => {
    const user = await openTab('Schedule & Reminder')

    // This verifies the main SSK-20 dialog flow: open Add Reminder, fill required fields, and save.
    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'Gutter Cleaning')
    await user.type(screen.getByLabelText('Start Date'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(screen.getByText('Gutter Cleaning')).toBeInTheDocument()
    expect(screen.getByText('Next: 2026-11-02')).toBeInTheDocument()
  })

  it('keeps the dialog open and shows validation when the start date is missing', async () => {
    const user = await openTab('Schedule & Reminder')

    // The reminder cannot be saved without a start date.
    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'No Start Date')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ต้องเลือกวันเริ่ม')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the reminder dialog without adding a reminder when Cancel is clicked', async () => {
    const user = await openTab('Schedule & Reminder')

    // Cancel should dismiss the dialog and leave the Recurring list unchanged.
    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'Cancelled Reminder')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Cancelled Reminder')).not.toBeInTheDocument()
  })
})
