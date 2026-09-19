import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('¥49,000')
  })

  it('sends the selected receipt details to the image renderer', () => {
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
      'image',
    )
  })

  it('sends the selected pending invoice details to the image renderer', () => {
    render(<PaymentsPage />)

    const downloadActionBtn = screen.getByRole('button', { name: 'Download invoice for Kenji Sato' })
    fireEvent.click(downloadActionBtn)

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
    )
  })

  it('creates a new invoice after entering a three-digit room number', () => {
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

    // Create the bill.
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    // The dialog closes and the new row appears in the table.
    expect(screen.queryByRole('heading', { name: 'Create Payment' })).not.toBeInTheDocument()
    expect(screen.getByText('Somchai P.')).toBeInTheDocument()
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
})
