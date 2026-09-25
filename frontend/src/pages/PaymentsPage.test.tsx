import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { createLease, fetchReceipts, fetchRooms, updateApartmentConfig } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import { todayInBangkok } from '../format'
import PaymentsPage from './PaymentsPage'

/*
  ยอดทุกตัวในไฟล์นี้คิดด้วยมือจากข้อมูลตั้งต้นของ mock (SSK-128) ไม่ได้เอาตัวเลขที่หน้าจอโชว์มาเทียบกับตัวเอง
  Config ตั้งต้น: ไฟ 50 น้ำ 100 ค่าส่วนกลาง 300 อินเทอร์เน็ต 250 สัญญาตัวอย่างไม่ได้ล็อกอัตราไว้จึงใช้ชุดนี้

  RC-2026-0001 Yuki Tanaka ห้อง 102 (Paid)    4,500 + 300 + 250 + 180×50 + 12×100 = 15,250
  RC-2026-0002 Kenji Sato ห้อง 201 (Pending)   3,500 + 300 + 250 +  95×50 +  9×100 =  9,700
*/

async function renderPayments() {
  render(<PaymentsPage />)
  await screen.findByText('Yuki Tanaka')
}

async function openCreateBill(room: string, electric: string, water: string) {
  fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))
  // สัญญากับอัตราโหลดแบบ async ปุ่มจะกดได้ก็ต่อเมื่อโหลดเสร็จ
  const createBill = screen.getByRole('button', { name: 'Create Bill' })
  await waitFor(() => expect(createBill).toBeEnabled())
  fireEvent.change(screen.getByLabelText(/Room/i), { target: { value: room } })
  fireEvent.change(screen.getByLabelText(/Electric usage/i), { target: { value: electric } })
  fireEvent.change(screen.getByLabelText(/Water usage/i), { target: { value: water } })
  return createBill
}

beforeEach(() => {
  resetMockStore()
  vi.restoreAllMocks()
})

describe('PaymentsPage list from /api/receipts', () => {
  it('renders receipts from the API with room type, amount, and billing month', async () => {
    await renderPayments()

    expect(screen.getByText('Payment Management')).toBeInTheDocument()
    const yuki = screen.getByRole('row', { name: /Yuki Tanaka/ })
    expect(yuki).toHaveTextContent('Unit 102')
    expect(yuki).toHaveTextContent('15,250.00')
    expect(yuki).toHaveTextContent('RC-2026-0001')
    expect(yuki).toHaveTextContent('Paid')
    const kenji = screen.getByRole('row', { name: /Kenji Sato/ })
    expect(kenji).toHaveTextContent('9,700.00')
    expect(kenji).toHaveTextContent('Pending')
    expect(screen.getByText('Showing 2 of 2 entries')).toBeInTheDocument()
  })

  it('computes the pending and renewal cards from the loaded data instead of fixed numbers', async () => {
    await renderPayments()

    const pending = screen.getByText('PENDING COLLECTIONS').closest('div')!.parentElement!
    expect(pending).toHaveTextContent('9,700.00')
    expect(pending).toHaveTextContent('1 Invoices Awaiting Payment')

    // สัญญาห้อง 102 หมดในอีก 12 วัน เป็นใบเดียวที่อยู่ในช่วง 30 วัน
    const renewals = screen.getByText('UPCOMING RENEWALS (30D)').closest('div')!.parentElement!
    expect(renewals).toHaveTextContent('1 Units')
    expect(renewals).toHaveTextContent('฿4,500.00')
  })

  it('filters invoices by All Status, Paid, and Pending', async () => {
    await renderPayments()

    fireEvent.click(screen.getByRole('button', { name: 'Paid' }))
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })

  it('does not display individual send invoice button in action column (SSK-130)', async () => {
    await renderPayments()
    expect(screen.queryByRole('button', { name: /Send invoice for/i })).not.toBeInTheDocument()
  })

  it('does not display individual download invoice button in action column (SSK-130)', async () => {
    await renderPayments()
    expect(screen.queryByRole('button', { name: /Download invoice for/i })).not.toBeInTheDocument()
  })

  it('allows selecting individual or all invoices to bulk send (SSK-130)', async () => {
    await renderPayments()

    const selectAllCheckbox = screen.getByLabelText('Select all invoices')
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /Select invoice for/i })

    expect(selectAllCheckbox).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Send All Invoices/i })).toBeInTheDocument()

    // Select first row
    fireEvent.click(rowCheckboxes[0])
    expect(rowCheckboxes[0]).toBeChecked()
    expect(screen.getByRole('button', { name: /Send Invoices \(1\)/i })).toBeInTheDocument()

    // Select all
    fireEvent.click(selectAllCheckbox)
    rowCheckboxes.forEach((cb) => expect(cb).toBeChecked())
    expect(screen.getByRole('button', { name: new RegExp(`Send Invoices \\(${rowCheckboxes.length}\\)`, 'i') })).toBeInTheDocument()

    // Open bulk send dialog
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Send Invoices \\(${rowCheckboxes.length}\\)`, 'i') }))
    const bulkDialog = screen.getByRole('dialog', { name: 'Send Invoices' })
    expect(bulkDialog).toBeInTheDocument()
    expect(within(bulkDialog).getByText(/Send Invoices to Tenants/i)).toBeInTheDocument()

    // Dispatch
    fireEvent.click(within(bulkDialog).getByRole('button', { name: /Send .* Invoice/i }))
    expect(await within(bulkDialog).findByText(/Prepared for Dispatch/i)).toBeInTheDocument()

    // Close
    fireEvent.click(within(bulkDialog).getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByRole('dialog', { name: 'Send Invoices' })).not.toBeInTheDocument()
  })

  it('opens scheduled auto-billing dialog and saves settings (SSK-130)', async () => {
    await renderPayments()

    // Open Schedule Auto-Billing
    fireEvent.click(screen.getByRole('button', { name: /Schedule Auto-Billing/i }))

    const scheduleDialog = screen.getByRole('dialog', { name: 'Scheduled Bulk Billing' })
    expect(scheduleDialog).toBeInTheDocument()
    expect(within(scheduleDialog).getByText('Scheduled Bulk Billing')).toBeInTheDocument()

    // Save schedule
    fireEvent.click(within(scheduleDialog).getByRole('button', { name: /Save Schedule/i }))
    expect(await within(scheduleDialog).findByText(/Saved!/i)).toBeInTheDocument()
  })
})

describe('Generate Receipt from the API receipt', () => {
  it('shows every line and the total exactly as calculated by hand', async () => {
    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Generate Receipt' })).toBeInTheDocument()
    expect(within(dialog).getByText('RC-2026-0001')).toBeInTheDocument()
    expect(within(dialog).getByText('180 units')).toBeInTheDocument()
    expect(within(dialog).getByText('12 units')).toBeInTheDocument()
    expect(within(dialog).getAllByTestId('receipt-item-amount').map((el) => el.textContent)).toEqual([
      '฿4,500.00',
      '฿300.00',
      '฿250.00',
      '฿9,000.00',
      '฿1,200.00',
    ])
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿15,250.00')
    expect(within(dialog).getByText('Paid')).toBeInTheDocument()
  })

  // SSK-114 ใบเสร็จดาวน์โหลดเป็น PDF เท่านั้น ตอนนี้เป็นไฟล์จาก backend ตาม docs/api-contract-billing.md
  it('downloads the PDF from the backend endpoint of the selected receipt', async () => {
    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Kenji Sato' }))

    const dialog = screen.getByRole('dialog')
    const kenji = (await fetchReceipts()).find((r) => r.tenantName === 'Kenji Sato')!
    expect(within(dialog).getByRole('link', { name: /^download/i })).toHaveAttribute(
      'href',
      `/api/receipts/${kenji.id}/pdf`,
    )
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿9,700.00')
  })

  it('opens the print page from the Print button in Generate Receipt (SSK-114)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: { write: vi.fn(), close: vi.fn() },
    } as unknown as Window)

    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /print/i }))

    expect(openSpy).toHaveBeenCalled()
  })

  it('marks a pending receipt as paid through the API and updates the list', async () => {
    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Kenji Sato' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as Paid' }))

    await waitFor(() => expect(within(dialog).getByText('Paid')).toBeInTheDocument())
    expect(within(dialog).queryByRole('button', { name: 'Mark as Paid' })).not.toBeInTheDocument()
    const kenji = (await fetchReceipts()).find((r) => r.tenantName === 'Kenji Sato')!
    expect(kenji.status).toBe('PAID')
  })

  it('does not offer Mark as Paid on a receipt that is already paid', async () => {
    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Mark as Paid' })).not.toBeInTheDocument()
  })
})

describe('Create Payment through POST /api/receipts', () => {
  it('previews the same total as the saved receipt and keeps it after reloading', async () => {
    await renderPayments()
    const createBill = await openCreateBill('207', '120', '33')

    expect(screen.getByLabelText('Tenant')).toHaveValue('Hiroshi Nakamura')
    // 3,500 + 300 + 250 + 120×50 (6,000) + 33×100 (3,300) = 13,350
    expect(screen.getByTestId('bill-total')).toHaveTextContent('฿13,350.00')
    fireEvent.click(createBill)

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Payment' })).not.toBeInTheDocument())
    fireEvent.click(await screen.findByRole('button', { name: 'View receipt for Hiroshi Nakamura' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('120 units')).toBeInTheDocument()
    expect(within(dialog).getByText('33 units')).toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿13,350.00')

    // บิลอยู่ที่ API ไม่ใช่แค่ใน state ของหน้า
    const saved = (await fetchReceipts()).find((r) => r.tenantName === 'Hiroshi Nakamura')!
    expect(saved).toMatchObject({ roomNumber: '207', billingMonth: todayInBangkok().slice(0, 7), totalAmount: 13350 })
  })

  it('shows the 409 from the API and stays open when the month is already billed', async () => {
    await renderPayments()
    const lastMonth = (await fetchReceipts()).find((r) => r.tenantName === 'Yuki Tanaka')!.billingMonth
    const createBill = await openCreateBill('102', '100', '10')
    fireEvent.change(screen.getByLabelText(/Billing Month/i), { target: { value: lastMonth } })
    fireEvent.click(createBill)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A receipt for this month has already been issued for this lease',
    )
    expect(screen.getByRole('heading', { name: 'Create Payment' })).toBeInTheDocument()
  })

  it('rejects negative units without sending anything to the API', async () => {
    await renderPayments()
    const createBill = await openCreateBill('207', '-5', '10')

    expect(screen.getByText('Electricity units cannot be negative')).toBeInTheDocument()
    expect(screen.getByTestId('bill-total')).toHaveTextContent('—')
    fireEvent.click(createBill)

    expect(await screen.findByRole('alert')).toHaveTextContent('Electricity units cannot be negative')
    expect(await fetchReceipts()).toHaveLength(2)
  })

  it('requires both meter readings instead of billing them as zero', async () => {
    await renderPayments()
    const createBill = await openCreateBill('207', '120', '')
    fireEvent.click(createBill)

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the water units')
    expect(await fetchReceipts()).toHaveLength(2)
  })

  it('refuses a room without an active contract', async () => {
    await renderPayments()
    const createBill = await openCreateBill('101', '120', '10')
    fireEvent.click(createBill)

    expect(await screen.findByRole('alert')).toHaveTextContent('Room 101 has no active contract')
  })

  /*
    QA: Config ตอนเซ็นเป็น 77 สร้างสัญญา เปลี่ยน Config เป็น 99 แล้วออกบิลของสัญญาเดิม ต้องเห็น 77
    ห้ามเปลี่ยน expected เป็น 99 เพื่อให้เทสผ่าน
  */
  it('bills with the rate locked on the contract, not the rate changed in Config later', async () => {
    const base = { waterRatePerUnit: 100, commonAreaFee: 300, internetFee: 250 }
    await updateApartmentConfig({ ...base, electricRatePerUnit: 77 })
    const room101 = (await fetchRooms()).find((r) => r.roomNumber === '101')!
    await createLease({
      roomId: room101.id,
      tenantId: 6,
      startDate: `${todayInBangkok().slice(0, 7)}-01`,
      endDate: null,
      billingCycle: 'MONTHLY',
    })
    await updateApartmentConfig({ ...base, electricRatePerUnit: 99 })

    await renderPayments()
    const createBill = await openCreateBill('101', '10', '0')
    expect(screen.getByText(/× 77\.00 \/ unit/)).toBeInTheDocument()
    fireEvent.click(createBill)

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Payment' })).not.toBeInTheDocument())
    const saved = (await fetchReceipts()).find((r) => r.roomNumber === '101')!
    expect(saved.items.find((row) => row.item === 'Electricity')).toMatchObject({ rate: 77, amount: 770 })
  })
})
