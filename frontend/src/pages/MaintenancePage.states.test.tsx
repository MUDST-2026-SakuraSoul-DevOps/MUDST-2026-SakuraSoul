import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as client from '../api/client'
import { ApiError } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import MaintenancePage from './MaintenancePage'

/*
  สถานะว่างและสถานะโหลดไม่สำเร็จของทั้งสี่แท็บในหน้า Maintenance
  เทสหลักของหน้ารันกับข้อมูลตั้งต้นที่มีของอยู่แล้วเสมอ จึงไม่เคยเห็นสองสถานะนี้
*/

beforeEach(() => {
  resetMockStore()
  vi.restoreAllMocks()
})

async function openTab(name: string) {
  const user = userEvent.setup()
  render(<MaintenancePage />)
  await user.click(screen.getByRole('button', { name }))
  return user
}

describe('MaintenancePage with nothing recorded yet', () => {
  it('invites the first task, item, reminder and says the log is empty', async () => {
    vi.spyOn(client, 'fetchMaintenanceLog').mockResolvedValue([])
    vi.spyOn(client, 'fetchSupplies').mockResolvedValue([])
    vi.spyOn(client, 'fetchReminders').mockResolvedValue([])
    const user = userEvent.setup()
    render(<MaintenancePage />)

    expect(await screen.findByText('No maintenance tasks yet')).toBeInTheDocument()
    expect(screen.getByText("Click 'New Task' to create the first one.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supplies & Inventory' }))
    expect(await screen.findByText('No supply items yet')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Schedule & Reminder' }))
    expect(await screen.findByText('No reminders yet')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Maintenance Log' }))
    expect(await screen.findByText('No maintenance history yet')).toBeInTheDocument()
  })

  it('says no task matches the search when there are tasks', async () => {
    const user = await openTab('Maintenance Tasks')
    await user.type(await screen.findByLabelText('Search tasks'), 'zzzz-no-such-task')
    expect(await screen.findByText('No tasks match your search')).toBeInTheDocument()
  })

  it('says no item matches the search when there are items', async () => {
    const user = await openTab('Supplies & Inventory')
    await user.type(await screen.findByLabelText('Search items'), 'zzzz-no-such-item')
    expect(await screen.findByText('No items match your search')).toBeInTheDocument()
  })
})

describe('MaintenancePage when the server fails', () => {
  it('shows the error on every tab', async () => {
    vi.spyOn(client, 'fetchMaintenanceLog').mockRejectedValue(new ApiError(500, 'Log service down'))
    vi.spyOn(client, 'fetchSupplies').mockRejectedValue(new ApiError(500, 'Inventory service down'))
    vi.spyOn(client, 'fetchReminders').mockRejectedValue(new ApiError(500, 'Reminder service down'))
    const user = userEvent.setup()
    render(<MaintenancePage />)

    expect(await screen.findByText('Log service down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supplies & Inventory' }))
    expect(await screen.findByText('Inventory service down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Schedule & Reminder' }))
    expect(await screen.findByText('Reminder service down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Maintenance Log' }))
    expect(await screen.findAllByText('Log service down')).not.toHaveLength(0)
  })
})
