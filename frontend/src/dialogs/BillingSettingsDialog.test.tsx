import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('validates interest rate, grace days, and PromptPay ID with spaces', async () => {
    const onSaved = vi.fn()
    render(
      <BillingSettingsDialog
        isOpen
        initialSettings={{ ...DEFAULT_BILLING_SETTINGS, interestEnabled: true, interestRate: 1 }}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )

    // Invalid negative interest rate
    const rateInput = screen.getByLabelText(/Interest per month/i)
    fireEvent.change(rateInput, { target: { value: '-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()

    // Fix interest rate, enter PromptPay ID with space
    fireEvent.change(rateInput, { target: { value: '1.5' } })
    const promptPayInput = screen.getByLabelText('PromptPay ID')
    fireEvent.change(promptPayInput, { target: { value: '081 234 5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PromptPay ID must be a 10-digit phone number or a 13-digit ID',
    )
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('rejects account number with less than 10 digits and shows server/validation error', async () => {
    const onSaved = vi.fn()
    render(
      <BillingSettingsDialog
        isOpen
        initialSettings={DEFAULT_BILLING_SETTINGS}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Bank name/i), { target: { value: 'Kasikornbank' } })
    fireEvent.change(screen.getByLabelText(/Account name/i), { target: { value: 'Sakura Soul' } })
    fireEvent.change(screen.getByLabelText(/Account number/i), { target: { value: '12345' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Account number must contain 10 to 15 digits')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves updated grace days and allows clearing all bank account fields', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(
      <BillingSettingsDialog
        isOpen
        initialSettings={DEFAULT_BILLING_SETTINGS}
        onClose={onClose}
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
    await waitFor(() => {
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
    expect(onClose).toHaveBeenCalled()
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
})

describe('BillingSettingsDialog remaining rules', () => {
  beforeEach(() => {
    resetMockStore()
  })

  function open(settings = DEFAULT_BILLING_SETTINGS as typeof DEFAULT_BILLING_SETTINGS | undefined) {
    const onSaved = vi.fn()
    render(<BillingSettingsDialog isOpen initialSettings={settings} onClose={vi.fn()} onSaved={onSaved} />)
    return onSaved
  }

  it('uses the default settings when none are passed in', () => {
    open(undefined)
    expect(screen.getByLabelText('Bank name')).toHaveValue(DEFAULT_BILLING_SETTINGS.bankName)
  })

  it('refuses an interest rate over 100% and grace days over 31', () => {
    const onSaved = open()

    fireEvent.change(screen.getByLabelText(/Interest per month/i), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Interest rate cannot exceed 100%')

    fireEvent.change(screen.getByLabelText(/Interest per month/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Grace days'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Grace days must be between 0 and 31')
    expect(onSaved).not.toHaveBeenCalled()
  })
})
