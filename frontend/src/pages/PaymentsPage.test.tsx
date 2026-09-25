import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as receiptModule from '../domain/receipt'

vi.mock('../domain/receipt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/receipt')>()
  return { ...actual, downloadReceipt: vi.fn() }
})

import PaymentsPage from './PaymentsPage'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PaymentsPage (SSK-106)', () => {
  it('renders the Payment Management list and summary cards', () => {
    render(<PaymentsPage />)

    expect(screen.getByText('Payment Management')).toBeInTheDocument()
    expect(screen.getByText('TOTAL REVENUE (YTD)')).toBeInTheDocument()
    expect(screen.getByText('PENDING COLLECTIONS')).toBeInTheDocument()
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })

  it('opens Generate Receipt from the receipt action', () => {
    render(<PaymentsPage />)

    const viewReceiptBtn = screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' })
    fireEvent.click(viewReceiptBtn)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Generate Receipt' })).toBeInTheDocument()
    expect(within(dialog).getByText('Sakura Soul Apartment')).toBeInTheDocument()
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿49,000.00')
  })

  // SSK-114: the receipt downloads as PDF only (instructor feedback #6), never as an image
  it('sends the selected receipt details to the PDF download', () => {
    render(<PaymentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    const dialog = screen.getByRole('dialog')
    const downloadBtn = within(dialog).getByRole('button', { name: /^download/i })
    fireEvent.click(downloadBtn)

    expect(receiptModule.downloadReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptNo: 'RC-2026-1015',
        tenant: 'Yuki Tanaka',
        unit: '4A',
        billingMonth: 'Oct 2024',
        totalAmount: 49000,
        status: 'Paid',
        paidDate: '3 Nov 2026',
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'room-rent', item: 'Room rent', amount: 35000 }),
          expect.objectContaining({ id: 'electricity', amount: 6000 }),
          expect.objectContaining({ id: 'water', amount: 1500 }),
        ]),
      }),
      'pdf',
    )
  })

  it('sends the selected pending invoice details to the PDF download', () => {
    render(<PaymentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Kenji Sato' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^download/i }))

    expect(receiptModule.downloadReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptNo: 'RC-2026-1016',
        tenant: 'Kenji Sato',
        unit: '2B',
        billingMonth: '2024 - 2025',
        totalAmount: 514000,
        status: 'Pending',
        paidDate: undefined,
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'room-rent', amount: 500000 }),
          expect.objectContaining({ id: 'repair-charge', amount: 3500 }),
        ]),
      }),
      'pdf',
    )
  })

  it('opens the print page from the Print button in Generate Receipt (SSK-114)', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window)

    render(<PaymentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /print/i }))

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('creates a new invoice after entering a three-digit room number', async () => {
    render(<PaymentsPage />)

    // Open the New Invoice dialog.
    fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))

    expect(screen.getByRole('heading', { name: 'Create Payment' })).toBeInTheDocument()
    expect(screen.getByText("Build this month's bill for one room")).toBeInTheDocument()

    // Enter a three-digit room number.
    const roomInput = screen.getByLabelText(/Room/i)
    fireEvent.change(roomInput, { target: { value: '101' } })

    // Enter electricity and water usage.
    const electricInput = screen.getByLabelText(/Electric usage/i)
    fireEvent.change(electricInput, { target: { value: '150' } })

    const waterInput = screen.getByLabelText(/Water usage/i)
    fireEvent.change(waterInput, { target: { value: '20' } })

    // Rates load asynchronously (lease-locked rate, else Apartment Config),
    // so Create Bill stays disabled until they arrive.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Bill' })).not.toBeDisabled())

    // Create the bill.
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    // The dialog closes and the new row appears in the table.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Payment' })).not.toBeInTheDocument())
    expect(screen.getByText('Somchai P.')).toBeInTheDocument()
  })

  it('เมื่อสร้างบิลใหม่ ข้อมูลใน Receipt modal และ PDF จะอัปเดตตามข้อมูลที่กรอกในฟอร์ม (SSK-114)', async () => {
    render(<PaymentsPage />)

    // กดเปิด modal New Invoice
    fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))

    // กรอกค่าต่าง ๆ ตามหน้า Create Payment
    const roomInput = screen.getByLabelText(/Room/i)
    fireEvent.change(roomInput, { target: { value: '101' } })

    const electricInput = screen.getByLabelText(/Electric usage/i)
    fireEvent.change(electricInput, { target: { value: '120' } })

    const waterInput = screen.getByLabelText(/Water usage/i)
    fireEvent.change(waterInput, { target: { value: '33' } })

    // กด Create Bill ได้หลังโหลดอัตราค่าไฟค่าน้ำเสร็จ (SSK-133)
    const createBill = screen.getByRole('button', { name: 'Create Bill' })
    await waitFor(() => expect(createBill).toBeEnabled())

    // SSK-128 ยอดในฟอร์มก่อนกดสร้าง ต้องตรงกับที่คิดด้วยมือ
    // 45,000 + (120 × 50 = 6,000) + (33 × 100 = 3,300) + 3,000 + 3,500 = 60,800
    expect(screen.getByTestId('bill-total')).toHaveTextContent('฿60,800.00')
    fireEvent.click(createBill)

    // เปิด Receipt ของ Somchai P.
    const viewReceiptBtn = await screen.findByRole('button', { name: 'View receipt for Somchai P.' })
    fireEvent.click(viewReceiptBtn)

    // ห้อง 101 ไม่มีสัญญาที่ล็อกอัตรา จึงใช้อัตราจาก Config ของ mock (ไฟ 50 น้ำ 100)
    // 45,000 ค่าห้อง + 120×50 ค่าไฟ + 33×100 ค่าน้ำ + 6,500 ค่าเครื่องใช้/ซ่อม = 60,800
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('33 units')).toBeInTheDocument()
    expect(within(dialog).getByText('120 units')).toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿60,800.00')

    // กดปุ่ม Download (PDF) แล้วไฟล์ต้องเป็น PDF ที่ยอดตรงกับบิลที่เพิ่งสร้าง
    fireEvent.click(within(dialog).getByRole('button', { name: /^download/i }))

    expect(receiptModule.downloadReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: 'Somchai P.', totalAmount: 60800 }),
      'pdf',
    )
  })


  it('filters invoices by All Status, Paid, and Pending', () => {
    render(<PaymentsPage />)

    // All invoices are visible initially.
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()

    // Filter to Paid invoices.
    fireEvent.click(screen.getByRole('button', { name: 'Paid' }))
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()

    // Filter to Pending invoices.
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })

  it('keeps an invalid room number from adding an invoice', async () => {
    const user = userEvent.setup()
    render(<PaymentsPage />)

    await user.click(screen.getByRole('button', { name: 'New Invoice' }))
    const dialog = screen.getByRole('dialog', { name: 'Create Payment' })
    await user.clear(within(dialog).getByLabelText(/^Room/))
    await user.type(within(dialog).getByLabelText(/^Room/), '12')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Create Bill' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: 'Create Bill' }))

    expect(within(dialog).getByRole('alert')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Showing 3 of 3 entries')).toBeInTheDocument()
  })

  it('combines tenant search with status filtering and updates the result count', async () => {
    const user = userEvent.setup()
    render(<PaymentsPage />)

    await user.type(screen.getByPlaceholderText('Search by Tenant or Unit...'), 'Yuki')
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 3 entries')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 0 of 3 entries')).toBeInTheDocument()
  })
})
