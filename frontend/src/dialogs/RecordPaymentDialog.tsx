import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { CustomSelect } from '../components/CustomSelect'
import { type PaymentRecord } from '../domain/paymentPhase2'
import { roundMoney } from '../domain/billing'
import { baht, todayInBangkok } from '../format'

export function RecordPaymentDialog({
  isOpen,
  receipt,
  outstanding,
  onClose,
  onRecord,
}: {
  isOpen: boolean
  receipt: {
    id: number
    receiptNo: string
    roomNumber: string
    tenantName: string
  }
  outstanding: number
  onClose: () => void
  onRecord: (record: Omit<PaymentRecord, 'id'>) => Promise<void> | void
}) {
  const [amount, setAmount] = useState(String(Math.min(1000, outstanding) || outstanding))
  const [date, setDate] = useState(todayInBangkok())
  const [method, setMethod] = useState<'Bank transfer' | 'Cash' | 'PromptPay'>('Bank transfer')
  const [slip, setSlip] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const parsedAmount = roundMoney(Number(amount) || 0)
  const balanceAfter = Math.max(0, roundMoney(outstanding - parsedAmount))
  const isValidAmount = parsedAmount > 0 && parsedAmount <= outstanding

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValidAmount) {
      setError(`Amount must be between ฿0.01 and ${baht(outstanding)}`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onRecord({
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        roomNumber: receipt.roomNumber,
        tenantName: receipt.tenantName,
        amount: parsedAmount,
        date,
        method,
        slipName: slip || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Record payment"
      subtitle={`${receipt.receiptNo} · Unit ${receipt.roomNumber} · ${receipt.tenantName}`}
      onClose={onClose}
      width="default"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between rounded-lg border border-avatar-ring/40 bg-sand-50/50 p-3.5">
          <span className="text-sm text-body-muted">Outstanding balance</span>
          <strong className="text-base font-semibold text-brand">{baht(outstanding)}</strong>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="payment-amount" className="block text-xs font-medium text-body-muted mb-1">
              Amount received (THB)
            </label>
            <input
              id="payment-amount"
              type="number"
              min="0.01"
              max={outstanding}
              step="0.01"
              required
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError(null)
              }}
              aria-label="Amount received (THB)"
              className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <small className="block mt-1 text-[11px] text-body-muted">A partial payment is allowed.</small>
          </div>

          <div>
            <label htmlFor="payment-date" className="block text-xs font-medium text-body-muted mb-1">
              Payment date
            </label>
            <input
              id="payment-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Payment date"
              className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="payment-method" className="block text-xs font-medium text-body-muted mb-1">
              Payment method
            </label>
            <CustomSelect
              id="payment-method"
              aria-label="Payment method"
              value={method}
              onChange={(val) => setMethod(val as 'Bank transfer' | 'Cash' | 'PromptPay')}
              options={[
                { value: 'Bank transfer', label: 'Bank transfer' },
                { value: 'Cash', label: 'Cash' },
                { value: 'PromptPay', label: 'PromptPay' },
              ]}
              buttonClassName="flex w-full items-center justify-between gap-2.5 rounded-lg border border-avatar-ring/50 bg-sidebar px-3.5 py-2.5 text-sm text-ink outline-none hover:border-brand/40 focus:border-brand cursor-pointer transition shadow-xs"
              menuClassName="absolute top-full left-0 z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-avatar-ring/50 bg-white p-1.5 shadow-xl backdrop-blur-md"
            />
          </div>

          <div>
            <label htmlFor="payment-slip" className="block text-xs font-medium text-body-muted mb-1">
              Payment proof (optional)
            </label>
            <input
              id="payment-slip"
              type="file"
              accept="image/*,application/pdf"
              aria-label="Payment proof (optional)"
              onChange={(e) => setSlip(e.target.files?.[0]?.name ?? '')}
              className="w-full text-xs text-body-muted file:mr-2 file:rounded-md file:border file:border-avatar-ring/60 file:bg-white file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-black/5 cursor-pointer"
            />
            {slip && <p className="mt-1 text-xs text-moss-545 font-medium">Attached: {slip}</p>}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-avatar-ring/30 bg-white/60 p-3.5">
          <span className="text-sm text-body-muted">Balance after this payment</span>
          <strong className="text-base font-semibold text-ink">{baht(balanceAfter)}</strong>
        </div>

        <div className="rounded-lg border border-sand-90 bg-sand-50/50 p-3 text-xs text-sand-530">
          A receipt is created for the amount received, not the full invoice. Selected proof remains in this session.
        </div>

        <div className="flex justify-end gap-3 border-t border-avatar-ring/30 pt-4">
          <SecondaryButton type="button" onClick={onClose} aria-label="Cancel">
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting || !isValidAmount} aria-label="Record payment">
            {submitting ? 'Recording...' : 'Record payment'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
