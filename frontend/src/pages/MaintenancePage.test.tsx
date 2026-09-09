import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import MaintenancePage from './MaintenancePage'

/**
 * Screen-level tests for SSK-24 / Export Maintenance Log.
 *
 * ExportLogButton has its own focused unit tests, so this file checks the
 * Maintenance Log screen behavior around it. The important part is that the
 * page passes filtered log rows to the export button, not the full unfiltered
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
  it('filters the table by maintenance status before export', async () => {
    const user = await openLogTab()

    await user.click(screen.getByRole('button', { name: 'In Progress' }))

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('เปลี่ยนคอมเพรสเซอร์แอร์')).toBeInTheDocument()
  })

  it('filters the table by room number search before export', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('ค้นหาประวัติงานซ่อมบำรุง'), '201')

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('ก๊อกอ่างล้างหน้าหยด')).toBeInTheDocument()
  })

  it('does not create an empty export file when no rows match the current filters', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('ค้นหาประวัติงานซ่อมบำรุง'), 'ไม่มีงานซ่อมชื่อนี้')
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ยังไม่มีประวัติงานซ่อมให้ export')
  })
})
