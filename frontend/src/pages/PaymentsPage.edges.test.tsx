import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as clientModule from '../api/client'
import { ApiError } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import PaymentsPage from './PaymentsPage'

/*
  ทางแยกของหน้า Payments ที่ PaymentsPage.test / PaymentsPhase2.test ยังไม่ได้เดิน
  แท็บจาก URL ค้นหา เลือก/ยกเลิกเลือก ยกเลิกการจ่าย ปิดป็อปอัปทุกตัว และ error ตอนบันทึกการจ่าย
  ข้อมูลตั้งต้นของ mock: RC-2026-0001 Yuki Tanaka ห้อง 102 (Paid), RC-2026-0002 Kenji Sato ห้อง 201 (ค้าง 9,700)
*/

async function renderPayments() {
  render(<PaymentsPage />)
  await screen.findByText('Yuki Tanaka')
}

beforeEach(() => {
  resetMockStore()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/payments')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('PaymentsPage tabs from the address bar', () => {
  it('opens Payment history from ?view=history and drops the view when going back to Invoices', async () => {
    window.history.replaceState(null, '', '/payments?view=history')
    const user = userEvent.setup()
    render(<PaymentsPage />)

    expect(await screen.findByRole('button', { name: 'Payment history tab' })).toHaveClass('bg-accent-soft')
    await user.click(screen.getByRole('button', { name: 'Invoices tab' }))
    expect(window.location.search).toBe('')
  })

  it('opens Summary reports from ?view=reports', async () => {
    window.history.replaceState(null, '', '/payments?view=reports')
    render(<PaymentsPage />)
    expect(await screen.findByRole('button', { name: 'Summary reports tab' })).toHaveClass('bg-accent-soft')
  })
})

describe('PaymentsPage invoice list', () => {
  it('finds an invoice by tenant name or by unit number', async () => {
    const user = userEvent.setup()
    await renderPayments()
    const search = screen.getByPlaceholderText('Search by Tenant or Unit...')

    await user.type(search, 'kenji')
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, '102')
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()
  })

  it('unticks one invoice and unticks them all again', async () => {
    const user = userEvent.setup()
    await renderPayments()
    const one = screen.getByRole('checkbox', { name: 'Select invoice for Kenji Sato' })
    const all = screen.getByRole('checkbox', { name: 'Select all invoices' })

    await user.click(one)
    expect(one).toBeChecked()
    await user.click(one)
    expect(one).not.toBeChecked()

    await user.click(all)
    expect(one).toBeChecked()
    await user.click(all)
    expect(one).not.toBeChecked()
  })
})

describe('PaymentsPage popups close cleanly', () => {
  it('opens and cancels billing settings, bulk print and the schedule', async () => {
    const user = userEvent.setup()
    await renderPayments()

    await user.click(screen.getByRole('button', { name: 'Billing Settings' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Bank name')).not.toBeInTheDocument()

    // ปุ่มพิมพ์หลายใบขึ้นเมื่อเลือกใบที่จ่ายแล้วอย่างน้อยหนึ่งใบ
    await user.click(screen.getByRole('checkbox', { name: 'Select invoice for Yuki Tanaka' }))
    await user.click(screen.getByRole('button', { name: 'Bulk print receipts' }))
    const printDialog = await screen.findByRole('dialog')
    await user.click(within(printDialog).getAllByRole('button', { name: /Cancel|Close/ })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Schedule Auto-Billing' }))
    await screen.findByText('Scheduled Bulk Billing')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Scheduled Bulk Billing')).not.toBeInTheDocument()
  })

  it('cancels the bulk send dialog', async () => {
    const user = userEvent.setup()
    await renderPayments()

    await user.click(screen.getByRole('button', { name: 'Send All Invoices' }))
    await screen.findByText('Send Invoices')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Send Invoices')).not.toBeInTheDocument()
  })

  it('goes from the receipt view to recording a payment for the unpaid balance', async () => {
    const user = userEvent.setup()
    await renderPayments()

    await user.click(screen.getByRole('button', { name: 'View receipt for Kenji Sato' }))
    await user.click(await screen.findByRole('button', { name: 'Record payment' }))

    expect(await screen.findByRole('button', { name: 'Pay full balance' })).toHaveTextContent('9,700.00')
  })

  it('closes the receipt view', async () => {
    const user = userEvent.setup()
    await renderPayments()

    await user.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })
})

describe('PaymentsPage payment errors', () => {
  it('shows a toast and keeps the dialog open when recording the payment fails', async () => {
    vi.spyOn(clientModule, 'recordReceiptPayment').mockRejectedValue(new ApiError(400, 'The payment date cannot be in the future'))
    const user = userEvent.setup()
    await renderPayments()

    await user.click(screen.getByRole('button', { name: 'Record payment for unit 201' }))
    await user.click(await screen.findByRole('button', { name: 'Record payment' }))

    expect(await screen.findByText('Error: The payment date cannot be in the future')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay full balance' })).toBeInTheDocument()
  })
})
