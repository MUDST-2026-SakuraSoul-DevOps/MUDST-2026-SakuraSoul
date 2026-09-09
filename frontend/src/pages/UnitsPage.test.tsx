import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import UnitsPage from './UnitsPage'

/**
 * Unit tests for SSK-21 / Lock Room Maintenance Status.
 *
 * The Unit Management page shows all rooms and their current statuses in one
 * table, so it is the safest place for admins to lock rooms for maintenance
 * or release them back after maintenance is done.
 */

async function renderUnits() {
  render(<UnitsPage />)
  await screen.findByText('101')
}

function rowOf(roomNumber: string): HTMLElement {
  const row = screen.getByText(roomNumber).closest('tr')
  if (!row) {
    throw new Error(`Room row ${roomNumber} was not found`)
  }
  return row
}

beforeEach(() => {
  resetMockStore()
})

describe('room status table', () => {
  it('shows room statuses from the API instead of empty placeholders', async () => {
    await renderUnits()

    expect(within(rowOf('101')).getByText('Available')).toBeInTheDocument()
    expect(within(rowOf('102')).getByText('Occupied')).toBeInTheDocument()
    expect(within(rowOf('106')).getByText('Maintenance')).toBeInTheDocument()
  })

  it('shows the tenant name for an occupied room', async () => {
    await renderUnits()
    expect(within(rowOf('102')).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
  })
})

describe('US-15-S1 lock a room for maintenance', () => {
  it('locks an available room as Maintenance and updates the table immediately', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'ตั้งสถานะห้อง 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('สถานะห้อง 101')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('101')).getByText('Maintenance')).toBeInTheDocument()
    })
  })

  it('allows an occupied room to be locked for maintenance', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('102')).getByRole('button', { name: 'ตั้งสถานะห้อง 102' }))
    const dialog = await screen.findByRole('dialog')

    // The dialog should show the current tenant so admins do not lock the wrong room by accident.
    expect(within(dialog).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))

    await waitFor(() => {
      expect(within(rowOf('102')).getByText('Maintenance')).toBeInTheDocument()
    })
  })

  it('keeps a locked room out of the available-room flow', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'ตั้งสถานะห้อง 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // The dashboard uses this status to decide whether to show check-in or maintenance details.
    const room = (await fetchRooms()).find((r) => r.roomNumber === '101')
    expect(room?.status).toBe('MAINTENANCE')
  })

  it('does not change room status when the dialog is closed without confirmation', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'ตั้งสถานะห้อง 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ปิด' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(within(rowOf('101')).getByText('Available')).toBeInTheDocument()
  })
})

describe('US-15-S2 release a room after maintenance', () => {
  it('shows the release-maintenance action for a room that is already under maintenance', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('106')).getByRole('button', { name: 'ตั้งสถานะห้อง 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('button', { name: 'ปิดงานซ่อม คืนห้องให้เช่าได้' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }),
    ).not.toBeInTheDocument()
  })

  it('releases a maintenance room back to Available immediately', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('106')).getByRole('button', { name: 'ตั้งสถานะห้อง 106' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ปิดงานซ่อม คืนห้องให้เช่าได้' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('106')).getByText('Available')).toBeInTheDocument()
    })
  })
})
