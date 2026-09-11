import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GenerateReceiptModal } from './GenerateReceiptModal'

/**
 * Covers QA review items #1 and #9 for SSK-16: the total must always be
 * calculated from line items, preventing a regression to the old hand-typed
 * constant that was off by 2,300 baht.
 */
describe('GenerateReceiptModal', () => {
  it('shows a total equal to the sum of line items instead of a hand-typed constant', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const lineItemAmounts = screen
      .getAllByTestId('receipt-item-amount')
      .map((el) => Number((el.textContent ?? '').replace(/[¥,]/g, '')))
    const totalShown = Number(
      (screen.getByTestId('receipt-total-amount').textContent ?? '').replace(/[¥,]/g, ''),
    )

    expect(totalShown).toBe(lineItemAmounts.reduce((sum, n) => sum + n, 0))
  })

  it('keeps Download disabled until a real endpoint exists', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()
  })

  it('closes the modal with the Escape key', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
