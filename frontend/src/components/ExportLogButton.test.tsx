import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MaintenanceTicket } from '../api/types'
import { ExportLogButton } from './ExportLogButton'

/**
 * Tests the Export Log button for US-18.
 *
 * jsdom does not provide URL.createObjectURL or real browser downloads, so the
 * test fakes both and verifies the generated filename and content.
 */

function ticket(overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket {
  return {
    id: 1,
    roomId: 6,
    roomNumber: '106',
    title: 'AC compressor replacement',
    detail: 'Air conditioner not cooling',
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
  // Capture download link clicks because jsdom cannot download files.
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
  it('downloads a CSV file with the date in the filename', async () => {
    const user = userEvent.setup()
    render(<ExportLogButton tickets={[ticket()]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toMatch(/^maintenance-log-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

describe('US-18-S2 export only filtered rows', () => {
  it('writes rows only for the tickets passed to the button', async () => {
    const user = userEvent.setup()
    // The caller filters the list before passing it in; the button does not fetch by itself.
    const filtered = [ticket({ id: 1, roomNumber: '106' }), ticket({ id: 2, roomNumber: '206' })]
    render(<ExportLogButton tickets={filtered} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(clicked).toHaveLength(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    const text = await blob.text()
    // One header row plus two ticket rows.
    expect(text.replace('﻿', '').split('\r\n')).toHaveLength(3)
    expect(text).toContain('106')
    expect(text).toContain('206')
  })
})

describe('US-18-S3 no export data', () => {
  it('shows an alert and does not create an empty file', async () => {
    const user = userEvent.setup()
    render(<ExportLogButton tickets={[]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no maintenance history to export',
    )
    expect(clicked).toHaveLength(0)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('clears the warning when data is available and export is retried', async () => {
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
 * QA found that the warning stayed visible after the ticket list changed.
 *
 * Reproduction: export with an empty filtered list, then clear the filter so
 * the table has rows again. The stale warning made the system look empty even
 * when the table was populated.
 */
describe('warning clears when tickets change', () => {
  it('clears a stale warning when the filtered list has rows again', async () => {
    const user = userEvent.setup()
    const view = render(<ExportLogButton tickets={[]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('There is no maintenance history to export')

    view.rerender(<ExportLogButton tickets={[ticket()]} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the warning when the changed list is still empty', async () => {
    const user = userEvent.setup()
    const view = render(<ExportLogButton tickets={[]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))
    view.rerender(<ExportLogButton tickets={[]} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
