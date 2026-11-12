import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as api from '../api/client'
import * as downloads from '../lib/downloadFile'
import { BulkPrintReceiptsDialog } from './BulkPrintReceiptsDialog'
import type { PaymentRecord } from '../domain/paymentPhase2'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('previews the server PDF, downloads that file once and releases its object URL on close', async () => {
  const blob = new Blob(['pdf'], { type: 'application/pdf' })
  const print = vi.spyOn(api, 'printReceipts').mockResolvedValue(blob)
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  const create = vi.fn(() => 'http://localhost/receipt.pdf')
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
  const open = vi.spyOn(window, 'open')
  const record: PaymentRecord = { id: 'PAY-1', receiptId: 7, receiptNo: 'RC-7', roomNumber: '101', tenantName: 'Tenant', amount: 100, date: '2026-11-13' }
  const { unmount } = render(<BulkPrintReceiptsDialog isOpen receipts={[record, { ...record, id: 'PAY-2' }]} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /^Print \d+ receipts$/ }))
  expect(await screen.findByTitle('Receipt PDF preview')).toHaveAttribute('src', 'http://localhost/receipt.pdf')
  expect(print).toHaveBeenCalledWith({ receiptIds: [7] })
  expect(open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Download receipt PDF' }))
  expect(download).toHaveBeenCalledWith('receipts.pdf', blob)
  unmount()
  expect(revoke).toHaveBeenCalledWith('http://localhost/receipt.pdf')
})

it('shows a server print error and permits retry', async () => {
  vi.spyOn(api, 'printReceipts').mockRejectedValue(new Error('Printing unavailable'))
  const record: PaymentRecord = { id: 'PAY-1', receiptId: 7, receiptNo: 'RC-7', roomNumber: '101', tenantName: 'Tenant', amount: 100, date: '2026-11-13' }
  render(<BulkPrintReceiptsDialog isOpen receipts={[record]} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /^Print \d+ receipts$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Printing unavailable')
  await waitFor(() => expect(screen.getByRole('button', { name: /^Print \d+ receipts$/ })).toBeEnabled())
})
