import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MaintenanceTicket } from '../api/types'
import { ExportLogButton } from './ExportLogButton'

/**
 * Unit tests for the SSK-24 Export Log button.
 *
 * jsdom cannot create real object URLs or download real files, so these tests
 * mock the browser download APIs and verify the filename and file content that
 * would be sent to the user.
 */

function ticket(overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket {
  return {
    id: 1,
    roomId: 6,
    roomNumber: '106',
    title: 'เปลี่ยนคอมเพรสเซอร์แอร์',
    detail: 'แอร์ไม่เย็น',
    status: 'IN_PROGRESS',
    reportedAt: '2026-09-01',
    ...overrides,
  }
}

let clicked: HTMLAnchorElement[] = []

beforeEach(() => {
  clicked = []
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
  // Capture the generated download link because jsdom cannot download files.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('US-18-S1 export creates a file', () => {
  it('downloads a CSV file with the export date in the filename', async () => {
    const user = userEvent.setup()
    render(<ExportLogButton tickets={[ticket()]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toMatch(/^maintenance-log-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

describe('US-18-S2 export only filtered rows', () => {
  it('exports only the tickets passed from the current filtered page state', async () => {
    const user = userEvent.setup()
    // The page filters the list first and passes only visible rows to the button.
    const filtered = [ticket({ id: 1, roomNumber: '106' }), ticket({ id: 2, roomNumber: '206' })]
    render(<ExportLogButton tickets={filtered} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(clicked).toHaveLength(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    const text = await blob.text()
    // One header row plus the two filtered ticket rows.
    expect(text.replace('﻿', '').split('\r\n')).toHaveLength(3)
    expect(text).toContain('106')
    expect(text).toContain('206')
  })
})

describe('US-18-S3 empty export state', () => {
  it('shows a warning and does not create an empty file', async () => {
    const user = userEvent.setup()
    render(<ExportLogButton tickets={[]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ยังไม่มีประวัติงานซ่อมให้ export',
    )
    expect(clicked).toHaveLength(0)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('clears the warning after data becomes available and export is clicked again', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ExportLogButton tickets={[]} />)
    await user.click(screen.getByRole('button', { name: /Export Log/ }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<ExportLogButton tickets={[ticket()]} />)
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

/**
 * This prevents a stale warning from staying visible after the filtered list changes.
 *
 * Reproduction: export with no rows, then clear the filters so rows come back.
 * The old "no data" message should disappear because the page now has exportable data.
 */
describe('stale empty-export warning behavior', () => {
  it('clears the stale warning when the ticket list changes from empty to non-empty', async () => {
    const user = userEvent.setup()
    const view = render(<ExportLogButton tickets={[]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('ยังไม่มีประวัติงานซ่อมให้ export')

    view.rerender(<ExportLogButton tickets={[ticket()]} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the warning visible when the ticket list is still empty', async () => {
    const user = userEvent.setup()
    const view = render(<ExportLogButton tickets={[]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))
    view.rerender(<ExportLogButton tickets={[]} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
