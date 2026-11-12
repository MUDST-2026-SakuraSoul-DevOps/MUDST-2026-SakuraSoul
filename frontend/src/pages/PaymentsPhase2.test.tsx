import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import * as api from '../api/client'
import type { Receipt, ReceiptPayment } from '../api/types'
import { resetMockStore } from '../api/mockApi'
import { todayInBangkok } from '../format'
import PaymentsPage from './PaymentsPage'

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return { id: 1, receiptNo: 'RC-1', leaseId: 1, roomNumber: '101', tenantName: 'Live Tenant', tenantEmail: null,
    billingMonth: todayInBangkok().slice(0, 7), issuedAt: todayInBangkok(), dueDate: '2026-01-01', status: 'PENDING',
    items: [{ item: 'Rent', detail: null, usageValue: null, usageUnit: null, rate: null, amount: 1000 }], totalAmount: 1000,
    paidAt: null, paymentMethod: null, lastSentAt: null, sentCount: 0, latest: true, overdue: false,
    balanceDue: 1000, outstandingAmount: 1000, previousBalance: 0, interestAmount: 0, paidAmount: 0, settledAmount: 0,
    bank: null, promptPayPayload: null, payments: [], ...overrides }
}
function payment(id: number, overrides: Partial<ReceiptPayment> = {}): ReceiptPayment {
  return { id, amount: 100, paidOn: todayInBangkok(), method: 'CASH', reference: null, note: null, recordedAt: new Date().toISOString(), voidedAt: null, ...overrides }
}
async function openPayments(receipts: Receipt[]) {
  const fetch = vi.spyOn(api, 'fetchReceipts').mockResolvedValue(receipts)
  vi.spyOn(api, 'fetchRooms').mockResolvedValue([])
  vi.spyOn(api, 'fetchLeases').mockResolvedValue([])
  vi.spyOn(api, 'fetchDebts').mockResolvedValue([{ leaseId: 1, roomNumber: '101', tenantName: 'Live Tenant', receiptId: 1, receiptNo: 'RC-1', billingMonth: todayInBangkok().slice(0, 7), balanceDue: 700, oldestUnpaidDueDate: todayInBangkok(), daysOverdue: 0, bucket: '0-30' }])
  render(<PaymentsPage />)
  await screen.findByText(receipts[0].tenantName)
  return fetch
}
beforeEach(() => { resetMockStore(); localStorage.clear(); window.history.replaceState({}, '', '/') })
afterEach(() => vi.restoreAllMocks())

describe('Payments Phase 2 backend integration', () => {
  it('uses debts for pending collections and never loads fabricated local payment history', async () => {
    localStorage.setItem('sakura_payment_records_v2', JSON.stringify([{ id: 'FAKE-PAYMENT', amount: 999999 }]))
    const archive = vi.spyOn(api, 'createDocument')
    await openPayments([receipt()])
    const pending = screen.getByText('PENDING COLLECTIONS').parentElement!
    expect(within(pending).getByText(/700[.]00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Payment history tab' }))
    expect(screen.getByText('No payment history recorded yet.')).toBeInTheDocument()
    expect(screen.queryByText('FAKE-PAYMENT')).not.toBeInTheDocument()
    expect(archive).not.toHaveBeenCalled()
  })

  it('uses backend status and prevents editing or collecting on old/settled bills', async () => {
    await openPayments([
      receipt({ tenantName: 'Old Tenant', latest: false, balanceDue: null, carriedToReceiptNo: 'RC-2' }),
      receipt({ id: 2, receiptNo: 'RC-2', roomNumber: '102', tenantName: 'Partial Tenant', status: 'PARTIAL', overdue: true, paidAmount: 100, settledAmount: 100, balanceDue: 900 }),
      receipt({ id: 3, receiptNo: 'RC-3', roomNumber: '103', tenantName: 'Paid Tenant', status: 'PAID', overdue: true, balanceDue: 0, paidAmount: 1000, settledAmount: 1000 }),
    ])
    expect(screen.queryByRole('button', { name: 'Edit invoice for Old Tenant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit invoice for Partial Tenant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record payment for unit 101' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record payment for unit 103' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record payment for unit 102' })).toBeInTheDocument()
    const partial = screen.getByText('Partial Tenant').closest('tr')!
    expect(within(partial).getByText('Overdue')).toBeInTheDocument()
    const paid = screen.getByText('Paid Tenant').closest('tr')!
    expect(within(paid).getByText('Paid')).toBeInTheDocument()
  })

  it('allows editing a latest pending invoice with no payment', async () => {
    await openPayments([receipt()])
    expect(screen.getByRole('button', { name: 'Edit invoice for Live Tenant' })).toBeInTheDocument()
  })

  it('does not count a partially paid invoice as paid in full or count voided money as revenue', async () => {
    await openPayments([receipt({ status: 'PARTIAL', paidAmount: 100, settledAmount: 100, balanceDue: 900, payments: [payment(1), payment(2, { amount: 900, voidedAt: new Date().toISOString() })] })])
    const revenue = screen.getByText('TOTAL REVENUE (YTD)').parentElement!
    expect(within(revenue).getByText(/100[.]00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Payment history tab' }))
    const paid = screen.getByText('PAID IN FULL').parentElement!
    expect(within(paid).getByText('0 / 1')).toBeInTheDocument()
  })

  it('records the selected paidOn and OTHER note without using a filename as reference', async () => {
    const record = vi.spyOn(api, 'recordReceiptPayment').mockResolvedValue(receipt({ balanceDue: 900, paidAmount: 100, status: 'PARTIAL' }))
    await openPayments([receipt()])
    fireEvent.click(screen.getByRole('button', { name: 'Record payment for unit 101' }))
    fireEvent.change(screen.getByLabelText('Amount received (THB)'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2026-11-09' } })
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'Other' } })
    fireEvent.change(screen.getByLabelText('Payment note'), { target: { value: 'Counter service' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(record).toHaveBeenCalledWith(1, { amount: 100, paidOn: '2026-11-09', method: 'OTHER', reference: undefined, note: 'Counter service' }))
  })

  it('sorts history by server payment id and exposes only the eligible void action', async () => {
    const fetch = await openPayments([receipt({ payments: [payment(1), payment(2), payment(3, { voidedAt: new Date().toISOString() })] })])
    const voidPayment = vi.spyOn(api, 'voidPayment').mockRejectedValue(new api.ApiError(409, 'Only the most recent payment of this lease can be voided'))
    fireEvent.click(screen.getByRole('button', { name: 'Payment history tab' }))
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual(['PAY-3', 'PAY-2', 'PAY-1'])
    expect(screen.getByText('Voided')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Void payment PAY-1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Void payment PAY-3' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Void payment PAY-2' }))
    await screen.findByText('Only the most recent payment of this lease can be voided')
    expect(voidPayment).toHaveBeenCalledWith(2)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })

  it('does not show a bank or a QR when the invoice snapshot has no bank', async () => {
    localStorage.setItem('sakura_billing_settings', JSON.stringify({ bankName: 'Fake bank', accountNumber: '1234567890' }))
    await openPayments([receipt()])
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Live Tenant' }))
    expect(screen.queryByText('Bank transfer / PromptPay')).not.toBeInTheDocument()
    expect(screen.queryByText('Fake bank')).not.toBeInTheDocument()
  })
})
