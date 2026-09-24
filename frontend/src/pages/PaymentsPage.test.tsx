import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentsPage from './PaymentsPage'

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
  })

  it('downloads a PDF from the Generate Receipt popup (SSK-114)', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<PaymentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    const dialog = screen.getByRole('dialog')
    const downloadBtn = within(dialog).getByRole('button', { name: /^download/i })
    fireEvent.click(downloadBtn)

    expect(createObjectURLSpy).toHaveBeenCalled()

    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })

  it('opens the print document from the Generate Receipt popup (SSK-114)', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window)

    render(<PaymentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    const dialog = screen.getByRole('dialog')
    const printBtn = within(dialog).getByRole('button', { name: /print/i })
    fireEvent.click(printBtn)

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('adds the entered invoice to the page state without claiming API persistence', () => {
    render(<PaymentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))

    expect(screen.getByRole('heading', { name: 'Create Payment' })).toBeInTheDocument()
    expect(screen.getByText("Build this month's bill for one room")).toBeInTheDocument()
    expect(
      screen.getByText((text, element) => element?.tagName === 'P' && text.startsWith('*')),
    ).toBeInTheDocument()

    const roomInput = screen.getByLabelText(/Room/i)
    fireEvent.change(roomInput, { target: { value: '112' } })
    fireEvent.change(screen.getByLabelText(/Tenant/i), { target: { value: 'Ada Tester' } })

    const electricInput = screen.getByLabelText(/Electric usage/i)
    fireEvent.change(electricInput, { target: { value: '150' } })

    const waterInput = screen.getByLabelText(/Water usage/i)
    fireEvent.change(waterInput, { target: { value: '20' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    expect(screen.queryByRole('heading', { name: 'Create Payment' })).not.toBeInTheDocument()
    const row = screen.getByText('Ada Tester').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Unit 112')).toBeInTheDocument()
    expect(screen.getByText('Showing 4 of 4 entries')).toBeInTheDocument()
  })

  it('shows validation and does not add an invoice for a short room number', async () => {
    const user = userEvent.setup()
    render(<PaymentsPage />)

    await user.click(screen.getByRole('button', { name: 'New Invoice' }))
    const dialog = screen.getByRole('dialog', { name: 'Create Payment' })
    await user.clear(within(dialog).getByLabelText(/^Room/))
    await user.type(within(dialog).getByLabelText(/^Room/), '12')
    await user.click(within(dialog).getByRole('button', { name: 'Create Bill' }))

    expect(within(dialog).getByRole('alert')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Showing 3 of 3 entries')).toBeInTheDocument()
  })

  it('updates the receipt modal and PDF with the newly created invoice data (SSK-114)', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<PaymentsPage />)

    // Open the New Invoice modal.
    fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))

    // Enter values in the Create Payment form.
    const roomInput = screen.getByLabelText(/Room/i)
    fireEvent.change(roomInput, { target: { value: '101' } })

    const electricInput = screen.getByLabelText(/Electric usage/i)
    fireEvent.change(electricInput, { target: { value: '120' } })

    const waterInput = screen.getByLabelText(/Water usage/i)
    fireEvent.change(waterInput, { target: { value: '33' } })

    // Create the bill.
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    // Open Somchai P.'s receipt.
    const viewReceiptBtn = screen.getByRole('button', { name: 'View receipt for Somchai P.' })
    fireEvent.click(viewReceiptBtn)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('33 units')).toBeInTheDocument()
    expect(within(dialog).getByText('120 units')).toBeInTheDocument()
    expect(within(dialog).getByText('฿60,800.00')).toBeInTheDocument()

    // Download the PDF.
    const downloadBtn = within(dialog).getByRole('button', { name: /^download/i })
    fireEvent.click(downloadBtn)

    expect(createObjectURLSpy).toHaveBeenCalled()
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })


  it('filters invoices by All Status, Paid, and Pending', () => {
    render(<PaymentsPage />)

    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Paid' }))
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
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
