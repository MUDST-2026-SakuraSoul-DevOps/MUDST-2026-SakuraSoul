import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import {
  type BillingSettings,
  DEFAULT_BILLING_SETTINGS,
  calculateInterest,
} from '../domain/paymentPhase2'
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
  const settings = initialSettings ?? DEFAULT_BILLING_SETTINGS
  const [interestEnabled, setInterestEnabled] = useState(settings.interestEnabled)
  const [interestRate, setInterestRate] = useState(String(settings.interestRate))
  const [bankName, setBankName] = useState(settings.bankName)
  const [accountNumber, setAccountNumber] = useState(settings.accountNumber)
  const [accountHolder, setAccountHolder] = useState(settings.accountHolder)
  const [qrFile, setQrFile] = useState(settings.qrCodeImage ?? '')

  if (!isOpen) return null

  const parsedRate = Number(interestRate) || 0
  const sampleInterest = interestEnabled ? calculateInterest(2000, parsedRate) : 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const updated: BillingSettings = {
      interestEnabled,
      interestRate: Math.max(0, Math.min(100, parsedRate)),
      interestBasis: 'Simple interest · principal only',
      bankName: bankName.trim() || 'Kasikornbank',
      accountNumber: accountNumber.trim() || '012-3-45678-9',
      accountHolder: accountHolder.trim() || 'Sakura Soul Apartment',
      qrCodeImage: qrFile,
    }
    onSaved(updated)
  }

  return (
    <Modal title="Billing Settings" subtitle="SSK-164 · SSK-168" onClose={onClose} width="default">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                onChange={(e) => setInterestRate(e.target.value)}
                required={interestEnabled}
                aria-label="Interest per month (%)"
                className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand disabled:opacity-50"
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
            Illustration: ฿2,000 overdue × {interestEnabled ? parsedRate : 0}% = {baht(sampleInterest)} for one month.
            Existing invoices keep their original interest snapshot.
          </div>
        </section>

        {/* SSK-168 Section */}
        <section className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-brand">Bank Transfer Details</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="bank-name" className="block text-xs font-medium text-body-muted mb-1">
                Bank name
              </label>
              <input
                id="bank-name"
                type="text"
                required
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
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
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                aria-label="Account number"
                placeholder="e.g. 012-3-45678-9"
                className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
          </div>

          <div>
            <label htmlFor="account-holder" className="block text-xs font-medium text-body-muted mb-1">
              Account holder
            </label>
            <input
              id="account-holder"
              type="text"
              required
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              aria-label="Account holder"
              className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="qr-code-file" className="block text-xs font-medium text-body-muted mb-1">
              Payment QR image (optional)
            </label>
            <input
              id="qr-code-file"
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Payment QR image (optional)"
              onChange={(e) => setQrFile(e.target.files?.[0]?.name ?? '')}
              className="w-full text-xs text-body-muted file:mr-3 file:rounded-md file:border file:border-avatar-ring/60 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-black/5 cursor-pointer"
            />
            {qrFile && (
              <p className="mt-1 text-xs text-moss-545 font-medium">Selected QR: {qrFile}</p>
            )}
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-avatar-ring/30 pt-4">
          <SecondaryButton type="button" onClick={onClose} aria-label="Cancel">
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" aria-label="Save Settings">
            Save Settings
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
