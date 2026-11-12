import { useState, useEffect, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import {
  type BillingSettings,
  calculateInterest,
  formatPromptPayTarget,
} from '../domain/paymentPhase2'
import { updateLateInterestConfig, updateBankAccountConfig, fetchApartmentConfig } from '../api/client'
import { baht } from '../format'

export function BillingSettingsDialog({
  isOpen,
  initialSettings,
  onClose,
  onSaved,
}: {
  isOpen: boolean
  initialSettings?: BillingSettings
  onClose: () => void
  onSaved: (settings: BillingSettings) => void
}) {
  const [interestEnabled, setInterestEnabled] = useState(initialSettings?.interestEnabled ?? false)
  const [interestRate, setInterestRate] = useState(String(initialSettings?.interestRate ?? 0))
  const [graceDays, setGraceDays] = useState(String(initialSettings?.graceDays ?? 0))
  const [bankName, setBankName] = useState(initialSettings?.bankName ?? '')
  const [accountNumber, setAccountNumber] = useState(initialSettings?.accountNumber ?? '')
  const [accountName, setAccountName] = useState(initialSettings?.accountName ?? initialSettings?.accountHolder ?? '')
  const [accountHolder, setAccountHolder] = useState(initialSettings?.accountName ?? initialSettings?.accountHolder ?? '')
  const [promptPayId, setPromptPayId] = useState(initialSettings?.promptPayId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen || initialSettings) return
    let active = true
    fetchApartmentConfig()
      .then((cfg) => {
        if (!active) return
        setInterestEnabled((cfg.lateInterestPercentPerMonth ?? 0) > 0)
        setInterestRate(String(cfg.lateInterestPercentPerMonth ?? 0))
        setGraceDays(String(cfg.graceDays ?? 0))
        setBankName(cfg.bank?.bankName ?? '')
        setAccountNumber(cfg.bank?.accountNumber ?? '')
        setAccountName(cfg.bank?.accountName ?? '')
        setAccountHolder(cfg.bank?.accountName ?? '')
        setPromptPayId(cfg.bank?.promptPayId ?? '')
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isOpen, initialSettings])

  if (!isOpen) return null

  const parsedRate = Number(interestRate)
  const parsedGraceDays = Number(graceDays) || 0
  const sampleInterest = interestEnabled && !isNaN(parsedRate) && parsedRate > 0 ? calculateInterest(2000, parsedRate) : 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // SSK-164: Validate interest rate is not negative and not NaN
    if (interestEnabled) {
      if (isNaN(parsedRate) || parsedRate < 0) {
        setError('Interest rate cannot be negative')
        return
      }
      if (parsedRate > 100) {
        setError('Interest rate cannot exceed 100%')
        return
      }
    }

    if (parsedGraceDays < 0 || parsedGraceDays > 31) {
      setError('Grace days must be between 0 and 31')
      return
    }

    // SSK-168: Validate PromptPay ID
    const trimmedPromptPay = promptPayId.trim()
    if (trimmedPromptPay) {
      try {
        formatPromptPayTarget(trimmedPromptPay)
      } catch {
        setError('PromptPay ID must be a 10-digit phone number or a 13-digit ID')
        return
      }
    }

    const trimmedBankName = bankName.trim()
    const effectiveAccountName = (accountName.trim() || accountHolder.trim())
    const trimmedAccountNumber = accountNumber.trim()

    const bankFields = (trimmedBankName ? 1 : 0) + (effectiveAccountName ? 1 : 0) + (trimmedAccountNumber ? 1 : 0)
    if (bankFields > 0 && bankFields < 3) {
      setError('Please fill in the bank name, account name and account number together')
      return
    }
    if (bankFields === 0 && trimmedPromptPay) {
      setError('Please fill in the bank account before the PromptPay ID')
      return
    }
    if (trimmedAccountNumber) {
      const digits = trimmedAccountNumber.replace(/[^0-9]/g, '')
      if (digits.length < 10 || digits.length > 15) {
        setError('Account number must contain 10 to 15 digits')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const isAllEmpty = bankFields === 0 && !trimmedPromptPay
      await Promise.all([
        updateLateInterestConfig({
          lateInterestPercentPerMonth: interestEnabled ? parsedRate : 0,
          graceDays: parsedGraceDays,
        }),
        updateBankAccountConfig(
          isAllEmpty
            ? { bankName: '', accountName: '', accountNumber: '', promptPayId: null }
            : {
                bankName: trimmedBankName,
                accountName: effectiveAccountName,
                accountNumber: trimmedAccountNumber,
                promptPayId: trimmedPromptPay || null,
              },
        ),
      ])

      const updated: BillingSettings = {
        interestEnabled,
        interestRate: interestEnabled ? parsedRate : 0,
        interestBasis: 'Simple interest · principal only',
        bankName: trimmedBankName,
        accountNumber: trimmedAccountNumber,
        accountName: effectiveAccountName,
        accountHolder: effectiveAccountName,
        graceDays: parsedGraceDays,
        promptPayId: trimmedPromptPay || undefined,
      }
      onSaved(updated)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update billing settings'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Billing Settings" onClose={onClose} width="default">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-alert-525 font-medium">
            {error}
          </div>
        )}

        {/* SSK-164 Section */}
        <section className="flex flex-col gap-4 border-b border-avatar-ring/30 pb-5">
          <h3 className="text-base font-semibold text-brand">Carryover & Late Interest</h3>

          <label className="flex items-center gap-2.5 text-sm font-medium text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={interestEnabled}
              onChange={(e) => setInterestEnabled(e.target.checked)}
              aria-label="Apply interest to overdue principal"
              className="size-4 rounded border-honey-140 accent-brand cursor-pointer"
            />
            <span>Apply interest to overdue principal</span>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="interest-rate" className="block text-xs font-medium text-body-muted mb-1">
                Interest per month (%)
              </label>
              <input
                id="interest-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                disabled={!interestEnabled}
                value={interestRate}
                onChange={(e) => {
                  setInterestRate(e.target.value)
                  setError(null)
                }}
                required={interestEnabled}
                aria-label="Interest per month (%)"
                className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="grace-days" className="block text-xs font-medium text-body-muted mb-1">
                Grace days (0–31)
              </label>
              <input
                id="grace-days"
                type="number"
                min="0"
                max="31"
                step="1"
                value={graceDays}
                onChange={(e) => {
                  setGraceDays(e.target.value)
                  setError(null)
                }}
                aria-label="Grace days"
                className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label htmlFor="interest-basis" className="block text-xs font-medium text-body-muted mb-1">
                Interest basis
              </label>
              <input
                id="interest-basis"
                type="text"
                readOnly
                value="Simple interest · principal only"
                aria-label="Interest basis"
                className="w-full rounded-md border border-avatar-ring/50 bg-black/5 px-3 py-2 text-sm text-body-muted outline-none cursor-default"
              />
            </div>
          </div>

          <div className="rounded-lg border border-honey-140/60 bg-honey-20/40 p-3 text-xs text-honey-600">
            Illustration: ฿2,000 overdue × {interestEnabled && !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : 0}% = {baht(sampleInterest)} for one month.
            Existing invoices keep their original interest snapshot.
          </div>
        </section>

        {/* SSK-168 Section */}
        <section className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-brand">Bank Transfer & PromptPay</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="bank-name" className="block text-xs font-medium text-body-muted mb-1">
                Bank name
              </label>
              <input
                id="bank-name"
                type="text"
                value={bankName}
                onChange={(e) => {
                  setBankName(e.target.value)
                  setError(null)
                }}
                aria-label="Bank name"
                placeholder="e.g. Kasikornbank"
                className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label htmlFor="account-number" className="block text-xs font-medium text-body-muted mb-1">
                Account number
              </label>
              <input
                id="account-number"
                type="text"
                value={accountNumber}
                onChange={(e) => {
                  setAccountNumber(e.target.value)
                  setError(null)
                }}
                aria-label="Account number"
                placeholder="e.g. 012-3-45678-9"
                className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="account-name" className="block text-xs font-medium text-body-muted mb-1">
                Account name
              </label>
              <input
                id="account-name"
                name="accountName"
                type="text"
                value={accountName}
                onChange={(e) => {
                  setAccountName(e.target.value)
                  setAccountHolder(e.target.value)
                  setError(null)
                }}
                aria-label="Account name"
                placeholder="e.g. Sakura Soul Apartment"
                className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label htmlFor="promptpay-id" className="block text-xs font-medium text-body-muted mb-1">
                PromptPay ID (mobile or national ID)
              </label>
              <input
                id="promptpay-id"
                type="text"
                value={promptPayId}
                onChange={(e) => {
                  setPromptPayId(e.target.value)
                  setError(null)
                }}
                aria-label="PromptPay ID"
                placeholder="e.g. 0812345678 or 13-digit ID"
                className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-avatar-ring/30 pt-4">
          <SecondaryButton type="button" onClick={onClose} aria-label="Cancel">
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting} aria-label="Save Settings">
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
