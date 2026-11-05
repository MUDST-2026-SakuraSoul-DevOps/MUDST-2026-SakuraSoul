import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { createLease, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import { resetPaymentRecords, saveBillingSettings, DEFAULT_BILLING_SETTINGS } from '../domain/paymentPhase2'
import { todayInBangkok } from '../format'
import PaymentsPage from './PaymentsPage'

async function renderPayments() {
  render(<PaymentsPage />)
  await screen.findByText('Yuki Tanaka')
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.history.replaceState({}, '', '/')
  }
  resetMockStore()
  resetPaymentRecords()
  saveBillingSettings(DEFAULT_BILLING_SETTINGS)
  vi.restoreAllMocks()
})

describe('Payments Phase 2 Features (SSK-168, SSK-169, SSK-163, SSK-164, SSK-170)', () => {
  it('SSK-168: displays bank details and PromptPay QR code in invoice details modal', async () => {
    await renderPayments()

    // Open Yuki Tanaka invoice receipt modal
    fireEvent.click(screen.getByRole('button', { name: /View receipt for Yuki Tanaka/i }))

    const modal = screen.getByRole('dialog', { name: /Generate Receipt/i })
    expect(within(modal).getByText('Bank transfer / PromptPay')).toBeInTheDocument()
    expect(within(modal).getByText(/Kasikornbank · 012-3-45678-9/i)).toBeInTheDocument()
    expect(within(modal).getByText(/Sakura Soul Apartment · Reference: RC-2026-0001/i)).toBeInTheDocument()
    expect(within(modal).getByText(/Scan PromptPay QR code via your mobile banking app/i)).toBeInTheDocument()
  })

  it('SSK-168 & SSK-164: configures bank details and late interest in Billing Settings dialog', async () => {
    await renderPayments()

    // Open Billing Settings
    fireEvent.click(screen.getByRole('button', { name: 'Billing Settings' }))
    const settingsDialog = screen.getByRole('dialog', { name: /Billing Settings/i })
    expect(settingsDialog).toBeInTheDocument()

    // Verify SSK-164 interest fields
    const interestCheckbox = within(settingsDialog).getByLabelText('Apply interest to overdue principal')
    const interestInput = within(settingsDialog).getByLabelText('Interest per month (%)')
    expect(interestCheckbox).toBeChecked()
    expect(interestInput).toHaveValue(1)

    // Change interest rate
    fireEvent.change(interestInput, { target: { value: '2' } })

    // Change Bank details (SSK-168)
    const bankInput = within(settingsDialog).getByLabelText('Bank name')
    const accountInput = within(settingsDialog).getByLabelText('Account number')
    fireEvent.change(bankInput, { target: { value: 'SCB' } })
    fireEvent.change(accountInput, { target: { value: '999-9-99999-9' } })

    // Save
    fireEvent.click(within(settingsDialog).getByRole('button', { name: 'Save Settings' }))
    expect(screen.queryByRole('dialog', { name: /Billing Settings/i })).not.toBeInTheDocument()
    expect(screen.getByText('Billing settings updated successfully')).toBeInTheDocument()

    // Open receipt modal to check updated bank details
    fireEvent.click(screen.getByRole('button', { name: /View receipt for Yuki Tanaka/i }))
    const modal = screen.getByRole('dialog', { name: /Generate Receipt/i })
    expect(within(modal).getByText(/SCB · 999-9-99999-9/i)).toBeInTheDocument()
  })

  it('SSK-163: records partial payment, updates debt to 5,700 and shows remaining balance in modal', async () => {
    await renderPayments()

    // Kenji Sato (room 201) is overdue with 9,700 total due
    const kenjiRow = screen.getByRole('row', { name: /Kenji Sato/ })
    expect(kenjiRow).toHaveTextContent('Overdue')

    // Click Record Payment button for unit 201
    const recordBtn = within(kenjiRow).getByRole('button', { name: /Record payment for unit 201/i })
    fireEvent.click(recordBtn)

    const payDialog = screen.getByRole('dialog', { name: /Record payment/i })
    expect(payDialog).toBeInTheDocument()
    expect(within(payDialog).getByText('9,700.00')).toBeInTheDocument()

    // Enter partial payment of 4,000 THB
    const amountInput = within(payDialog).getByLabelText('Amount received (THB)')
    fireEvent.change(amountInput, { target: { value: '4000' } })

    // Balance after this payment should show 5,700.00
    expect(within(payDialog).getByText('5,700.00')).toBeInTheDocument()

    // Select payment method and upload slip proof
    const methodSelect = within(payDialog).getByLabelText('Payment method')
    fireEvent.change(methodSelect, { target: { value: 'PromptPay' } })

    const slipInput = within(payDialog).getByLabelText('Payment proof (optional)')
    fireEvent.change(slipInput, {
      target: { files: [{ name: 'slip_kenji_partial.png' }] },
    })
    expect(within(payDialog).getByText('Attached: slip_kenji_partial.png')).toBeInTheDocument()

    // Submit payment
    fireEvent.click(within(payDialog).getByRole('button', { name: 'Record payment' }))

    // Toast appears
    expect(await screen.findByText(/Payment of ฿4,000.00 recorded for Unit 201. Remaining: ฿5,700.00/i)).toBeInTheDocument()

    // Status is now Partially paid!
    const updatedKenjiRow = screen.getByRole('row', { name: /Kenji Sato/ })
    expect(within(updatedKenjiRow).getByText('Partially paid')).toBeInTheDocument()
    expect(updatedKenjiRow).toHaveTextContent('Paid 4,000.00 · Bal 5,700.00')

    // View receipt for Kenji Sato: Total amount displayed should be remaining ฿5,700.00!
    fireEvent.click(within(updatedKenjiRow).getByRole('button', { name: /View receipt for Kenji Sato/i }))
    const modal = screen.getByRole('dialog', { name: /Generate Receipt/i })
    expect(within(modal).getByText('Remaining balance to pay')).toBeInTheDocument()
    expect(within(modal).getByTestId('receipt-total-amount')).toHaveTextContent('฿5,700.00')
  })

  it('SSK-169: selects invoices and opens bulk print dialog with receipts for received payments', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    await renderPayments()

    // Yuki Tanaka is Paid
    const yukiCheckbox = screen.getByRole('checkbox', { name: /Select invoice for Yuki Tanaka/i })
    fireEvent.click(yukiCheckbox)

    // Selection bar appears
    expect(screen.getByText('1 invoices selected · 1 payment receipts')).toBeInTheDocument()

    // Click "Bulk print receipts"
    const bulkPrintBtn = screen.getByRole('button', { name: 'Bulk print receipts' })
    expect(bulkPrintBtn).toBeEnabled()
    fireEvent.click(bulkPrintBtn)

    const printDialog = screen.getByRole('dialog', { name: /Bulk print receipts/i })
    expect(printDialog).toBeInTheDocument()
    expect(within(printDialog).getByText(/PAYMENT RECEIPT · RC-2026-1101/i)).toBeInTheDocument()
    expect(within(printDialog).getByText('Unit 102 · RC-2026-0001')).toBeInTheDocument()
    expect(within(printDialog).getByText('15,250.00')).toBeInTheDocument()

    // Trigger Print
    const doPrintBtn = within(printDialog).getByRole('button', { name: /Print 1 receipts/i })
    fireEvent.click(doPrintBtn)
    expect(printSpy).toHaveBeenCalled()

    printSpy.mockRestore()
  })

  it('SSK-164: displays carryover balance and interest breakdown in invoice modal', async () => {
    // Create lease for Unit 101 which has configured carryover of 2,000
    const rooms = await fetchRooms()
    const room101 = rooms.find((r) => r.roomNumber === '101')!
    await createLease({
      roomId: room101.id,
      tenantId: 6,
      startDate: `${todayInBangkok().slice(0, 7)}-01`,
      endDate: null,
      billingCycle: 'MONTHLY',
    })

    await renderPayments()

    // Create a new invoice for Unit 101
    fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))
    const createBtn = screen.getByRole('button', { name: 'Create Bill' })
    await waitFor(() => expect(createBtn).toBeEnabled())

    fireEvent.change(screen.getByLabelText(/Room/i), { target: { value: '101' } })
    fireEvent.change(screen.getByLabelText(/Electric usage/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Water usage/i), { target: { value: '5' } })
    fireEvent.click(createBtn)

    // Wait for the create dialog to close before looking for the new row
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Create/i })).not.toBeInTheDocument(),
      { timeout: 5000 },
    )

    // Find row for room 101 (Haruto Watanabe)
    const row101 = await screen.findByRole('row', { name: /Haruto Watanabe/ }, { timeout: 5000 })
    expect(row101).toBeInTheDocument()

    // Open view receipt
    fireEvent.click(within(row101).getByRole('button', { name: /View receipt for Haruto Watanabe/i }))
    const modal = screen.getByRole('dialog', { name: /Generate Receipt/i })

    // Verify Carryover & Late interest snapshot
    expect(within(modal).getByText('Previous unpaid balance')).toBeInTheDocument()
    expect(within(modal).getByText('฿2,000.00')).toBeInTheDocument()
    expect(within(modal).getByText(/Late interest/i)).toBeInTheDocument()
    // 2,000 * 1% = ฿20.00
    expect(within(modal).getByText('฿20.00')).toBeInTheDocument()
  })

  it('renders Payment history tab with receipts, methods, and slip attachments', async () => {
    await renderPayments()

    // Click "Payment history" tab
    fireEvent.click(screen.getByRole('button', { name: 'Payment history tab' }))

    // Heading and description appear
    expect(screen.getByRole('heading', { name: 'Payment history' })).toBeInTheDocument()
    expect(screen.getByText(/One receipt for each payment received/i)).toBeInTheDocument()

    // Verify sample payment records are listed
    expect(screen.getByText('RC-2026-1101')).toBeInTheDocument()
    expect(screen.getByText('RC-2026-1102')).toBeInTheDocument()
    expect(screen.getByText('transfer-102.jpg')).toBeInTheDocument()
    expect(screen.getByText('transfer-101.jpg')).toBeInTheDocument()
  })

  it('SSK-170: renders Summary reports tab with grouping, period filters, and CSV export', async () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-csv')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    await renderPayments()

    // Click "Summary reports" tab
    fireEvent.click(screen.getByRole('button', { name: 'Summary reports tab' }))

    // Heading appears
    expect(screen.getByRole('heading', { name: 'Summary by unit' })).toBeInTheDocument()
    expect(screen.getAllByText('CURRENT CHARGES')[0]).toBeInTheDocument()
    expect(screen.getAllByText('PAYMENTS RECEIVED')[0]).toBeInTheDocument()
    expect(screen.getAllByText('CLOSING BALANCE')[0]).toBeInTheDocument()

    // Switch grouping to Tenant
    fireEvent.click(screen.getByRole('button', { name: 'Group by Tenant' }))
    expect(screen.getByRole('heading', { name: 'Summary by tenant' })).toBeInTheDocument()

    // Switch grouping to Month
    fireEvent.click(screen.getByRole('button', { name: 'Group by Month' }))
    expect(screen.getByRole('heading', { name: 'Summary by month' })).toBeInTheDocument()

    // Export report
    fireEvent.click(screen.getByRole('button', { name: 'Export report' }))
    expect(createObjectURLSpy).toHaveBeenCalled()

    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })
})
