import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { GenerateReceiptModal } from './GenerateReceiptModal'
import type { ReceiptData } from '../domain/receipt'

describe('GenerateReceiptModal', () => {
  it('renders the provided receipt instead of SAMPLE_RECEIPT', () => {
    const receipt: ReceiptData = {
      receiptNo: 'RC-TEST-112',
      tenant: 'Ada Tester',
      unit: '112',
      billingMonth: 'September 2026',
      dueDate: '5 Oct 2026',
      items: [{ id: 'rent', item: 'Room rent', amount: 3500 }],
      totalAmount: 3500,
      status: 'Pending',
    }

    render(<GenerateReceiptModal receipt={receipt} isOpen onClose={vi.fn()} trigger={false} />)
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText('Receipt no.').nextElementSibling).toHaveTextContent('RC-TEST-112')
    expect(within(dialog).getByText('Tenant').nextElementSibling).toHaveTextContent('Ada Tester')
    expect(within(dialog).getByText('Unit').nextElementSibling).toHaveTextContent('112')
    expect(within(dialog).getByText('Billing month').nextElementSibling).toHaveTextContent('September 2026')
    expect(within(dialog).getByText('Room rent')).toBeInTheDocument()
    expect(within(dialog).getByText('Pending')).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('Somchai P.')
  })

  it('calculates the displayed total from the line item amounts', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const lineItemAmounts = screen
      .getAllByTestId('receipt-item-amount')
      .map((el) => Number((el.textContent ?? '').replace(/[฿,]/g, '')))
    const totalShown = Number(
      (screen.getByTestId('receipt-total-amount').textContent ?? '').replace(/[฿,]/g, ''),
    )

    expect(totalShown).toBe(lineItemAmounts.reduce((sum, n) => sum + n, 0))
  })

  it('opens the print document from the modal', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window)

    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const printBtn = screen.getByRole('button', { name: /print/i })
    expect(printBtn).not.toBeDisabled()
    fireEvent.click(printBtn)

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('downloads a PDF directly from the modal (SSK-114)', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const downloadBtn = screen.getByRole('button', { name: /^download/i })
    expect(downloadBtn).not.toBeDisabled()
    fireEvent.click(downloadBtn)

    expect(createObjectURLSpy).toHaveBeenCalled()

    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })

  it('closes the modal with the Escape key', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
