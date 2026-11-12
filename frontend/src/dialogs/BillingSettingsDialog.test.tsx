import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BillingSettingsDialog } from './BillingSettingsDialog'
import { DEFAULT_BILLING_SETTINGS } from '../domain/paymentPhase2'
import { resetMockStore } from '../api/mockApi'

describe('BillingSettingsDialog', () => {
  beforeEach(() => {
    resetMockStore()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <BillingSettingsDialog
        isOpen={false}
        initialSettings={DEFAULT_BILLING_SETTINGS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('validates interest rate, grace days, and PromptPay ID with spaces', () => {
    const onSaved = vi.fn()
    render(
      <BillingSettingsDialog
        isOpen
        initialSettings={DEFAULT_BILLING_SETTINGS}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )

    // Invalid negative interest rate
    const rateInput = screen.getByLabelText(/Interest per month/i)
    fireEvent.change(rateInput, { target: { value: '-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()

    // Fix interest rate, enter PromptPay ID with space
    fireEvent.change(rateInput, { target: { value: '1.5' } })
    const promptPayInput = screen.getByLabelText('PromptPay ID')
    fireEvent.change(promptPayInput, { target: { value: '081 234 5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'PromptPay ID must be a 10-digit phone number or a 13-digit ID',
    )
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves updated grace days and allows clearing all bank account fields', () => {
    const onSaved = vi.fn()
    render(
      <BillingSettingsDialog
        isOpen
        initialSettings={DEFAULT_BILLING_SETTINGS}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )

    const graceInput = screen.getByLabelText(/Grace days/i)
    fireEvent.change(graceInput, { target: { value: '5' } })

    fireEvent.change(screen.getByLabelText(/Bank name/i), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/Account name/i), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/Account number/i), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('PromptPay ID'), { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        graceDays: 5,
        bankName: '',
        accountName: '',
        accountNumber: '',
        promptPayId: undefined,
      }),
    )
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <BillingSettingsDialog
        isOpen
        initialSettings={DEFAULT_BILLING_SETTINGS}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('uploads and removes a QR image preview', async () => {
    render(
      <BillingSettingsDialog
        isOpen
        initialSettings={DEFAULT_BILLING_SETTINGS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['png-bytes'], 'qr.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    const preview = await screen.findByAltText('QR Preview')
    expect(preview).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByAltText('QR Preview')).not.toBeInTheDocument()
  })
})
