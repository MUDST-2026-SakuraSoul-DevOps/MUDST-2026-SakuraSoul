import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '../api/client'
import type { Receipt, ReceiptPayment } from '../api/types'
import * as downloads from '../lib/downloadFile'
import { BulkPrintReceiptsDialog } from './BulkPrintReceiptsDialog'
import { paymentHistory } from '../domain/paymentLedger'
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

/*
  หน้า Payments ส่งรายการเข้าป็อปอัปจาก paymentHistory ของใบที่เลือก (ตัดการชำระที่ void ทิ้ง)
  ชุดนี้จึงสร้างรายการจากใบเสร็จรูปเดียวกับที่ GET /api/receipts ตอบ ไม่เขียน PaymentRecord เอง
  paymentHistory เรียงการชำระใหม่สุดก่อน PAY-13 (ใบ 8) จึงมาก่อน PAY-12 (ใบ 7)
*/
describe('BulkPrintReceiptsDialog with the payments of the selected invoices', () => {
  function apiReceipt(id: number, overrides: Partial<Receipt> = {}): Receipt {
    return {
      id, receiptNo: `RC-2026-000${id}`, leaseId: id, roomNumber: '101', tenantName: 'Tenant', tenantEmail: null,
      billingMonth: '2026-10', issuedAt: '2026-11-01T02:00:00Z', dueDate: '2026-11-20', status: 'PENDING', items: [],
      totalAmount: 4638, paidAt: null, paymentMethod: null, lastSentAt: null, sentCount: 0, latest: true,
      previousBalance: 0, interestAmount: 0, paidAmount: 0, settledAmount: 0, balanceDue: 4638, outstandingAmount: 4638,
      overdue: false, carriedToReceiptNo: null, payments: [], bank: null, promptPayPayload: null, ...overrides,
    }
  }
  function received(id: number, overrides: Partial<ReceiptPayment> = {}): ReceiptPayment {
    return { id, amount: 1500, paidOn: '2026-11-09', method: 'CASH', reference: null, note: null,
      recordedAt: '2026-11-09T03:00:00Z', voidedAt: null, ...overrides }
  }
  const records = paymentHistory([
    apiReceipt(7, { roomNumber: '101', tenantName: 'Yuki Tanaka', status: 'PARTIAL', paidAmount: 1500, settledAmount: 1500,
      balanceDue: 3138, outstandingAmount: 3138, payments: [received(12)] }),
    apiReceipt(8, { roomNumber: '102', tenantName: 'Kenji Sato', status: 'PAID', paidAmount: 4638, settledAmount: 4638,
      balanceDue: 0, outstandingAmount: 0, payments: [received(13, { amount: 4638, paidOn: '2026-11-10', method: 'QR' })] }),
  ])

  function fakeObjectUrls(url: string) {
    const create = vi.fn(() => url)
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
    return { create, revoke }
  }

  it('lists each received payment with its date and method, and prints them by receipt id', async () => {
    const print = vi.spyOn(api, 'printReceipts').mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    fakeObjectUrls('blob:receipts')
    render(<BulkPrintReceiptsDialog isOpen receipts={records} onClose={vi.fn()} />)

    const [newest, older] = screen.getAllByRole('article')
    expect(within(newest).getByText('PAYMENT RECEIPT · PAY-13')).toBeInTheDocument()
    expect(within(newest).getByText('Kenji Sato')).toBeInTheDocument()
    expect(within(newest).getByText('Unit 102 · RC-2026-0008')).toBeInTheDocument()
    expect(within(newest).getByText('2026-11-10 · PromptPay')).toBeInTheDocument()
    expect(within(newest).getByText('Amount received').nextElementSibling).toHaveTextContent('4,638.00')
    expect(within(older).getByText('PAYMENT RECEIPT · PAY-12')).toBeInTheDocument()
    expect(within(older).getByText('Unit 101 · RC-2026-0007')).toBeInTheDocument()
    expect(within(older).getByText('2026-11-09 · Cash')).toBeInTheDocument()
    expect(within(older).getByText('Amount received').nextElementSibling).toHaveTextContent('1,500.00')

    fireEvent.click(screen.getByRole('button', { name: 'Print 2 receipts' }))

    expect(await screen.findByTitle('Receipt PDF preview')).toHaveAttribute('src', 'blob:receipts')
    expect(print.mock.calls).toEqual([[{ receiptIds: [8, 7] }]])
  })

  it('explains that only received payments print when no selected invoice has one', () => {
    const print = vi.spyOn(api, 'printReceipts')
    // ใบที่ยังไม่มีใครจ่ายไม่มีการชำระ จึงไม่มีใบรับเงินให้พิมพ์
    const nothingReceived = paymentHistory([apiReceipt(9)])
    render(<BulkPrintReceiptsDialog isOpen receipts={nothingReceived} onClose={vi.fn()} />)

    expect(
      screen.getByText('No payment receipts found for the selected invoices. Only received payments generate receipts.'),
    ).toBeInTheDocument()
    const printButton = screen.getByRole('button', { name: 'Print 0 receipts' })
    expect(printButton).toBeDisabled()
    fireEvent.click(printButton)
    expect(print).not.toHaveBeenCalled()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('renders nothing while closed', () => {
    const print = vi.spyOn(api, 'printReceipts')
    const { container } = render(<BulkPrintReceiptsDialog isOpen={false} receipts={records} onClose={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
    expect(print).not.toHaveBeenCalled()
  })

  it('drops a PDF or an error that comes back after the dialog was closed', async () => {
    const { create } = fakeObjectUrls('blob:late')
    let finishPrint!: (pdf: Blob) => void
    let failPrint!: (error: Error) => void
    vi.spyOn(api, 'printReceipts')
      .mockImplementationOnce(() => new Promise((resolve) => { finishPrint = resolve }))
      .mockImplementationOnce(() => new Promise((_, reject) => { failPrint = reject }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const first = render(<BulkPrintReceiptsDialog isOpen receipts={records} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print 2 receipts' }))
    expect(screen.getByRole('button', { name: 'Print 2 receipts' })).toHaveTextContent('Generating PDF...')
    expect(screen.getByRole('button', { name: 'Print 2 receipts' })).toBeDisabled()
    first.unmount()
    await act(async () => finishPrint(new Blob(['%PDF-1.4'], { type: 'application/pdf' })))
    // ไม่สร้าง object URL ให้ป็อปอัปที่ปิดไปแล้ว ไม่มีใครเหลือคืนหน่วยความจำนั้น
    expect(create).not.toHaveBeenCalled()

    const second = render(<BulkPrintReceiptsDialog isOpen receipts={records} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print 2 receipts' }))
    second.unmount()
    await act(async () => failPrint(new Error('Printing unavailable')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(consoleError).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
