import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as api from '../api/client'
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

/*
  เปิดแบบเดียวกับหน้า Payments คือไม่ส่ง initialSettings ป็อปอัปโหลด GET /api/apartment-config เอง
  Config ตั้งต้นของ backend จำลอง: ไม่คิดดอกเบี้ย (0%) ผ่อนผัน 0 วัน ยังไม่ได้ตั้งบัญชี (bank: null)
  spy ที่ client ไม่ได้แทนที่ของจริง คำขอยังวิ่งไป backend จำลอง จึงอ่านกลับมาดูได้ว่าบันทึกอะไรไว้
*/
describe('BillingSettingsDialog opened from the Payments page', () => {
  beforeEach(() => {
    resetMockStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function openFromPaymentsPage() {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    const saveInterest = vi.spyOn(api, 'updateLateInterestConfig')
    const saveBank = vi.spyOn(api, 'updateBankAccountConfig')
    render(<BillingSettingsDialog isOpen onClose={onClose} onSaved={onSaved} />)
    await screen.findByLabelText('Bank name')
    return { onSaved, onClose, saveInterest, saveBank }
  }

  function save() {
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  }

  it('turns late interest on, previews it on ฿2,000 and saves only the interest section', async () => {
    const { onSaved, onClose, saveInterest, saveBank } = await openFromPaymentsPage()
    const toggle = screen.getByRole('checkbox', { name: 'Apply interest to overdue principal' })
    const rate = screen.getByLabelText('Interest per month (%)')
    expect(toggle).not.toBeChecked()
    expect(rate).toBeDisabled()
    expect(screen.getByText(/^Illustration:/)).toHaveTextContent('Illustration: ฿2,000 overdue × 0% = 0.00 for one month.')

    fireEvent.click(toggle)
    expect(rate).toBeEnabled()
    fireEvent.change(rate, { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Grace days'), { target: { value: '5' } })
    // 2,000 × 1.5% = 30.00
    expect(screen.getByText(/^Illustration:/)).toHaveTextContent('Illustration: ฿2,000 overdue × 1.5% = 30.00 for one month.')
    save()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(saveInterest.mock.calls).toEqual([[{ lateInterestPercentPerMonth: 1.5, graceDays: 5 }]])
    expect(saveBank).not.toHaveBeenCalled()
    expect(onSaved.mock.calls).toEqual([[{
      interestEnabled: true,
      interestRate: 1.5,
      interestBasis: 'Simple interest · principal only',
      bankName: '',
      accountNumber: '',
      accountName: '',
      accountHolder: '',
      graceDays: 5,
      promptPayId: undefined,
    }]])
    expect(await api.fetchApartmentConfig()).toMatchObject({ lateInterestPercentPerMonth: 1.5, graceDays: 5, bank: null })
  })

  it('turns late interest off and saves 0%, ignoring the rate left in the disabled field', async () => {
    await api.updateLateInterestConfig({ lateInterestPercentPerMonth: 2, graceDays: 3 })
    const { onSaved, onClose, saveInterest } = await openFromPaymentsPage()
    const toggle = screen.getByRole('checkbox', { name: 'Apply interest to overdue principal' })
    expect(toggle).toBeChecked()
    expect(screen.getByLabelText('Interest per month (%)')).toHaveValue(2)
    expect(screen.getByLabelText('Grace days')).toHaveValue(3)

    // พิมพ์อัตราเกินไว้ก่อนแล้วค่อยปิดดอกเบี้ย ช่องที่ปิดอยู่ไม่ถูกตรวจและไม่ถูกส่ง
    fireEvent.change(screen.getByLabelText('Interest per month (%)'), { target: { value: '150' } })
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Interest per month (%)')).toBeDisabled()
    save()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(saveInterest.mock.calls).toEqual([[{ lateInterestPercentPerMonth: 0, graceDays: 3 }]])
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ interestEnabled: false, interestRate: 0, graceDays: 3 }))
    expect(await api.fetchApartmentConfig()).toMatchObject({ lateInterestPercentPerMonth: 0, graceDays: 3 })
  })

  it('refuses an interest rate above 100% and accepts exactly 100%', async () => {
    const { onSaved, onClose, saveInterest, saveBank } = await openFromPaymentsPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Apply interest to overdue principal' }))
    fireEvent.change(screen.getByLabelText('Interest per month (%)'), { target: { value: '100.5' } })
    save()

    expect(await screen.findByRole('alert')).toHaveTextContent('Interest rate cannot exceed 100%')
    expect(saveInterest).not.toHaveBeenCalled()
    expect(saveBank).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    // แก้ช่องแล้วข้อความเตือนหายทันที ไม่ต้องรอกดบันทึกใหม่
    fireEvent.change(screen.getByLabelText('Interest per month (%)'), { target: { value: '100' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    save()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(saveInterest.mock.calls).toEqual([[{ lateInterestPercentPerMonth: 100, graceDays: 0 }]])
  })

  it('keeps grace days between 0 and 31', async () => {
    const { onSaved, onClose, saveInterest } = await openFromPaymentsPage()
    const grace = screen.getByLabelText('Grace days')

    for (const outOfRange of ['32', '-1']) {
      fireEvent.change(grace, { target: { value: outOfRange } })
      save()
      expect(await screen.findByRole('alert')).toHaveTextContent('Grace days must be between 0 and 31')
    }
    expect(saveInterest).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()

    fireEvent.change(grace, { target: { value: '31' } })
    save()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(saveInterest.mock.calls).toEqual([[{ lateInterestPercentPerMonth: 0, graceDays: 31 }]])
  })

  it('asks for the whole bank account and a 10 to 15 digit number, then saves it with its PromptPay ID', async () => {
    const { onSaved, onClose, saveInterest, saveBank } = await openFromPaymentsPage()

    fireEvent.change(screen.getByLabelText('Bank name'), { target: { value: '  Kasikornbank  ' } })
    save()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please fill in the bank name, account name and account number together',
    )

    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: ' Sakura Soul Apartment ' } })
    // 16 หลัก เกินเพดาน 15
    fireEvent.change(screen.getByLabelText('Account number'), { target: { value: '0123-4567-8901-2345' } })
    save()
    expect(await screen.findByRole('alert')).toHaveTextContent('Account number must contain 10 to 15 digits')
    expect(saveBank).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Account number'), { target: { value: '012-3-45678-9' } })
    fireEvent.change(screen.getByLabelText('PromptPay ID'), { target: { value: ' 0812345678 ' } })
    save()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(saveBank.mock.calls).toEqual([[{
      bankName: 'Kasikornbank',
      accountName: 'Sakura Soul Apartment',
      accountNumber: '012-3-45678-9',
      promptPayId: '0812345678',
    }]])
    expect(saveInterest).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      bankName: 'Kasikornbank',
      accountName: 'Sakura Soul Apartment',
      accountHolder: 'Sakura Soul Apartment',
      accountNumber: '012-3-45678-9',
      promptPayId: '0812345678',
    }))
    expect((await api.fetchApartmentConfig()).bank).toEqual({
      bankName: 'Kasikornbank',
      accountName: 'Sakura Soul Apartment',
      accountNumber: '012-3-45678-9',
      promptPayId: '0812345678',
    })
  })

  it('refuses a PromptPay ID while there is no bank account to attach it to', async () => {
    const { onSaved, onClose, saveBank } = await openFromPaymentsPage()
    fireEvent.change(screen.getByLabelText('PromptPay ID'), { target: { value: '0812345678' } })
    save()

    expect(await screen.findByRole('alert')).toHaveTextContent('Please fill in the bank account before the PromptPay ID')
    expect(saveBank).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect((await api.fetchApartmentConfig()).bank).toBeNull()
  })
})
