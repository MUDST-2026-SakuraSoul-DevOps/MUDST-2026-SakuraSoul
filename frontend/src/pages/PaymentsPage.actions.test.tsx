import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '../api/client'
import { createReceipt, fetchReceipts, recordReceiptPayment } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import { todayInBangkok } from '../format'
import PaymentsPage from './PaymentsPage'

/*
  SSK-178 ทางที่เหลือของหน้า Payments ผ่าน backend จำลอง: แท็บกับ URL, ค้นหา, เลือกแถว, ป็อปอัปที่เปิดปิดจากหน้า
  และข้อความเมื่อบันทึกหรือ void ไม่ผ่าน

  ข้อมูลตั้งต้นของ mock (คิดมือไว้ที่หัวไฟล์ PaymentsPage.test.tsx)
  RC-2026-0001 Yuki Tanaka ห้อง 102 จ่ายครบแล้ว มีการชำระหนึ่งก้อน
  RC-2026-0002 Kenji Sato ห้อง 201 ค้าง 9,700 ของเดือนก่อน ครบกำหนดเจ็ดวันก่อน
*/

const KENJI_LEASE_ID = 2

async function renderPayments(search = '') {
  window.history.replaceState({}, '', `/payments${search}`)
  render(<PaymentsPage />)
}

async function renderInvoices() {
  await renderPayments()
  await screen.findByText('Yuki Tanaka')
}

/** ป็อปอัปตอนโหลดค่าตั้งของตึกกับตอนเป็นฟอร์มเป็นคนละตัว จึงรอฟอร์มก่อนแล้วค่อยหาป็อปอัป */
async function openBillingSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Billing Settings' }))
  await screen.findByRole('button', { name: 'Save Settings' })
  return screen.getByRole('dialog', { name: 'Billing Settings' })
}

function footer() {
  return screen.getByText(/entries$/)
}

beforeEach(() => {
  resetMockStore()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('Payments page tabs follow the URL', () => {
  it('opens the tab named in ?view= and keeps the URL in step when switching tabs', async () => {
    await renderPayments('?view=history')

    expect(await screen.findByRole('heading', { name: 'Payment history' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Summary reports tab' }))
    expect(await screen.findByRole('button', { name: 'Export report' })).toBeInTheDocument()
    expect(window.location.search).toBe('?view=reports')
    expect(screen.queryByRole('heading', { name: 'Payment history' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Invoices tab' }))
    expect(await screen.findByText('Yuki Tanaka')).toBeInTheDocument()
    // แท็บแรกไม่มี view ใน URL ลิงก์ที่คัดลอกไปจึงเปิดหน้าใบแจ้งหนี้ตามปกติ
    expect(window.location.search).toBe('')
  })

  it('opens Summary reports straight from ?view=reports', async () => {
    await renderPayments('?view=reports')

    expect(await screen.findByRole('button', { name: 'Export report' })).toBeInTheDocument()
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
  })
})

describe('Payments invoice list', () => {
  it('finds an invoice by tenant name or unit number, and says when nothing matches', async () => {
    await renderInvoices()
    const total = Number(footer().textContent?.match(/of (\d+) entries/)?.[1])
    const searchBox = screen.getByPlaceholderText('Search by Tenant or Unit...')

    fireEvent.change(searchBox, { target: { value: '  KENJI ' } })
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(footer()).toHaveTextContent(`Showing 1 of ${total} entries`)

    fireEvent.change(searchBox, { target: { value: '102' } })
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()

    fireEvent.change(searchBox, { target: { value: 'nobody here' } })
    expect(screen.getByText('No invoices yet')).toBeInTheDocument()
    expect(footer()).toHaveTextContent(`Showing 0 of ${total} entries`)
  })

  it('picks one invoice, then all of them, and clears the picks again', async () => {
    await renderInvoices()
    const total = Number(footer().textContent?.match(/of (\d+) entries/)?.[1])
    const all = screen.getByRole('checkbox', { name: 'Select all invoices' }) as HTMLInputElement
    const kenji = screen.getByRole('checkbox', { name: 'Select invoice for Kenji Sato' })

    fireEvent.click(kenji)
    expect(kenji).toBeChecked()
    expect(footer()).toHaveTextContent(`Selected 1 of ${total} entries`)
    // ใบของ Kenji ยังไม่มีการชำระ จึงยังไม่มีใบเสร็จให้พิมพ์
    expect(screen.getByText('1 invoices selected · 0 payment receipts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bulk print receipts' })).toBeDisabled()
    expect(all.indeterminate).toBe(true)

    fireEvent.click(kenji)
    expect(kenji).not.toBeChecked()
    expect(footer()).toHaveTextContent(`Showing ${total} of ${total} entries`)

    fireEvent.click(all)
    expect(footer()).toHaveTextContent(`Selected ${total} of ${total} entries`)
    expect(all).toBeChecked()
    expect(all.indeterminate).toBe(false)

    fireEvent.click(all)
    expect(footer()).toHaveTextContent(`Showing ${total} of ${total} entries`)
    expect(screen.queryByText(/invoices selected/)).not.toBeInTheDocument()
  })

  it('prints the receipts of the payments behind the picked invoices', async () => {
    await renderInvoices()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select invoice for Yuki Tanaka' }))
    expect(screen.getByText('1 invoices selected · 1 payment receipts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bulk print receipts' }))

    const dialog = await screen.findByRole('dialog', { name: 'Bulk print receipts' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Bulk print receipts' })).not.toBeInTheDocument()
  })

  it('shows the carried balance on the new invoice and where the old one went', async () => {
    const carriedFrom = (await fetchReceipts()).find((receipt) => receipt.tenantName === 'Kenji Sato')!
    const next = await createReceipt({
      leaseId: KENJI_LEASE_ID,
      billingMonth: todayInBangkok().slice(0, 7),
      electricUnits: 0,
      waterUnits: 0,
    })
    expect(next.previousBalance).toBe(carriedFrom.totalAmount)
    await renderInvoices()

    // ยอดยกมาคือยอดค้างทั้งใบของเดือนก่อน (9,700 ตามหัวไฟล์)
    expect(screen.getByText('Incl. carry 9,700.00')).toBeInTheDocument()
    expect(screen.getByText(`Carried to ${next.receiptNo}`)).toBeInTheDocument()
  })

  it('shows the API error instead of the table when the invoices cannot be loaded', async () => {
    vi.spyOn(api, 'fetchReceipts').mockRejectedValue(new api.ApiError(503, 'The receipts are unavailable'))
    await renderPayments()

    expect(await screen.findByText('The receipts are unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select all invoices' })).not.toBeInTheDocument()
  })
})

describe('Payments dialogs opened from the page', () => {
  it('saves billing settings from the toolbar, says so and reloads the invoices', async () => {
    await renderInvoices()
    const load = vi.spyOn(api, 'fetchReceipts')

    fireEvent.click(within(await openBillingSettings()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Billing Settings' })).not.toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()

    fireEvent.click(within(await openBillingSettings()).getByRole('button', { name: 'Save Settings' }))

    expect(await screen.findByText('Billing settings updated successfully')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Billing Settings' })).not.toBeInTheDocument()
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  })

  it('opens Billing Settings and New Invoice from the Payment history tab too', async () => {
    await renderPayments('?view=history')
    await screen.findByRole('heading', { name: 'Payment history' })

    fireEvent.click(within(await openBillingSettings()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Billing Settings' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))
    expect(await screen.findByRole('dialog', { name: 'Create Payment' })).toBeInTheDocument()
  })

  it('closes the schedule and send dialogs without saving or sending anything', async () => {
    await renderInvoices()
    const saveSchedule = vi.spyOn(api, 'updateBillingSchedule')
    const send = vi.spyOn(api, 'sendReceipts')

    const scheduleButton = screen.getByRole('button', { name: 'Schedule Auto-Billing' })
    await waitFor(() => expect(scheduleButton).toBeEnabled())
    fireEvent.click(scheduleButton)
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Scheduled Bulk Billing' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Scheduled Bulk Billing' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send All Invoices' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Send Invoices' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Send Invoices' })).not.toBeInTheDocument()

    expect(saveSchedule).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('moves from the receipt view to Record payment for the same invoice, and closes the view on Cancel', async () => {
    await renderInvoices()

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Generate Receipt' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Generate Receipt' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Kenji Sato' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Generate Receipt' })).getByRole('button', { name: 'Record payment' }))

    const record = await screen.findByRole('dialog', { name: 'Record payment' })
    expect(within(record).getByText('RC-2026-0002 · Unit 201 · Kenji Sato')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Generate Receipt' })).not.toBeInTheDocument()
  })
})

describe('Payments page messages when the API refuses', () => {
  async function recordForKenji() {
    fireEvent.click(screen.getByRole('button', { name: 'Record payment for unit 201' }))
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    return dialog
  }

  it('shows why recording failed and keeps the dialog open so nothing is lost', async () => {
    await renderInvoices()
    const record = vi
      .spyOn(api, 'recordReceiptPayment')
      .mockRejectedValue(new api.ApiError(409, 'The amount is more than the balance due'))

    const dialog = await recordForKenji()

    expect(await screen.findByText('Error: The amount is more than the balance due')).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The amount is more than the balance due')
    expect(screen.getByRole('dialog', { name: 'Record payment' })).toBeInTheDocument()
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('falls back to a plain message when the failure carries none', async () => {
    await renderInvoices()
    vi.spyOn(api, 'recordReceiptPayment').mockRejectedValue('network down')

    await recordForKenji()

    expect(await screen.findByText('Error: Could not record payment')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Record payment' })).toBeInTheDocument()
  })

  it('voids the latest payment, says so, and shows it as voided', async () => {
    const kenji = (await fetchReceipts()).find((receipt) => receipt.tenantName === 'Kenji Sato')!
    const paid = await recordReceiptPayment(kenji.id, { amount: 1000, method: 'CASH' })
    const paymentId = paid.payments![paid.payments!.length - 1].id
    await renderPayments('?view=history')

    fireEvent.click(await screen.findByRole('button', { name: `Void payment PAY-${paymentId}` }))

    expect(await screen.findByText('Payment voided successfully')).toBeInTheDocument()
    const row = await screen.findByRole('row', { name: new RegExp(`PAY-${paymentId}.*Voided`) })
    expect(within(row).queryByRole('button', { name: `Void payment PAY-${paymentId}` })).not.toBeInTheDocument()
  })

  it('says why a payment could not be voided, or a plain message when the failure carries none', async () => {
    const kenji = (await fetchReceipts()).find((receipt) => receipt.tenantName === 'Kenji Sato')!
    const paid = await recordReceiptPayment(kenji.id, { amount: 1000, method: 'CASH' })
    const paymentId = paid.payments![paid.payments!.length - 1].id
    const voidPayment = vi
      .spyOn(api, 'voidPayment')
      .mockRejectedValueOnce(new api.ApiError(409, 'Only the latest payment can be voided'))
      .mockRejectedValueOnce('network down')
    await renderPayments('?view=history')
    const button = await screen.findByRole('button', { name: `Void payment PAY-${paymentId}` })

    fireEvent.click(button)
    expect(await screen.findByText('Only the latest payment can be voided')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: `Void payment PAY-${paymentId}` }))
    expect(await screen.findByText('Could not void payment')).toBeInTheDocument()
    expect(voidPayment.mock.calls).toEqual([[paymentId], [paymentId]])
    expect(screen.queryByText('Payment voided successfully')).not.toBeInTheDocument()
  })
})
