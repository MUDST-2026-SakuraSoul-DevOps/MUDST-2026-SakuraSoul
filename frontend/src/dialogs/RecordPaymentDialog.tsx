import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { CustomSelect } from '../components/CustomSelect'
import { SlipPicker } from '../components/SlipPicker'
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
  /** slip ส่งมาเฉพาะเมื่อผู้ใช้เลือกไฟล์ (SSK-163 แนบสลิปได้แต่ไม่บังคับ) หน้าที่เรียกเป็นคนอัปโหลดหลังบันทึกการชำระแล้ว */
  onRecord: (record: Omit<PaymentRecord, 'id'>, slip?: File) => Promise<void> | void
}) {
  const [amount, setAmount] = useState(String(Math.min(1000, outstanding) || outstanding))
  const [slip, setSlip] = useState<File | null>(null)
  const [date, setDate] = useState(todayInBangkok())
  const [method, setMethod] = useState<'Bank transfer' | 'Cash' | 'PromptPay' | 'Other'>('Bank transfer')
  const [note, setNote] = useState('')
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

    if (!date || date > todayInBangkok()) {
      setError(date ? 'The payment date cannot be in the future' : 'Please choose the payment date')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const record = {
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        roomNumber: receipt.roomNumber,
        tenantName: receipt.tenantName,
        amount: parsedAmount,
        date,
        method,
        note: note.trim() || undefined,
      }
      if (slip) {
        await onRecord(record, slip)
      } else {
        await onRecord(record)
      }
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
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
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
              min="0"
              max={outstanding}
              step="100"
              required
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError(null)
              }}
              aria-label="Amount received (THB)"
              className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const curr = Number(amount) || 0
                  setAmount(String(Math.min(outstanding, Math.round(curr + 500))))
                  setError(null)
                }}
                aria-label="Add 500 THB"
                className="rounded border border-avatar-ring/60 bg-white px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-black/5 cursor-pointer shadow-2xs"
              >
                +500
              </button>
              <button
                type="button"
                onClick={() => {
                  const curr = Number(amount) || 0
                  setAmount(String(Math.min(outstanding, Math.round(curr + 1000))))
                  setError(null)
                }}
                aria-label="Add 1000 THB"
                className="rounded border border-avatar-ring/60 bg-white px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-black/5 cursor-pointer shadow-2xs"
              >
                +1,000
              </button>
              <button
                type="button"
                onClick={() => {
                  setAmount(String(outstanding))
                  setError(null)
                }}
                aria-label="Pay full balance"
                className="rounded border border-avatar-ring/60 bg-white px-2 py-0.5 text-[11px] font-medium text-brand hover:bg-accent-soft cursor-pointer shadow-2xs"
              >
                Full ({baht(outstanding)})
              </button>
            </div>
            <small className="block mt-1 text-[11px] text-body-muted">A partial payment is allowed (step: ±100 THB).</small>
          </div>

          <div>
            <label htmlFor="payment-date" className="block text-xs font-medium text-body-muted mb-1">
              Payment date
            </label>
            <input
              id="payment-date"
              type="date"
              required
              max={todayInBangkok()}
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
              onChange={(val) => setMethod(val as 'Bank transfer' | 'Cash' | 'PromptPay' | 'Other')}
              options={[
                { value: 'Bank transfer', label: 'Bank transfer' },
                { value: 'Cash', label: 'Cash' },
                { value: 'PromptPay', label: 'PromptPay' },
                { value: 'Other', label: 'Other' },
              ]}
              buttonClassName="flex w-full items-center justify-between gap-2.5 rounded-lg border border-avatar-ring/50 bg-sidebar px-3.5 py-2.5 text-sm text-ink outline-none hover:border-brand/40 focus:border-brand cursor-pointer transition shadow-xs"
              menuClassName="absolute top-full left-0 z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-avatar-ring/50 bg-white p-1.5 shadow-xl backdrop-blur-md"
            />
          </div>

          <div>
            <label htmlFor="payment-note" className="block text-xs font-medium text-body-muted mb-1">
              Note (optional)
            </label>
            <input
              id="payment-note"
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Payment note"
              placeholder="e.g. Paid via counter service"
              className="w-full rounded-md border border-avatar-ring/50 bg-sidebar px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
        </div>

        <div>
          <p className="block text-xs font-medium text-body-muted mb-1">Payment slip (optional)</p>
          <SlipPicker label="Payment slip (optional)" file={slip} onChange={setSlip} disabled={submitting} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-avatar-ring/30 bg-white/60 p-3.5">
          <span className="text-sm text-body-muted">Balance after this payment</span>
          <strong className="text-base font-semibold text-ink">{baht(balanceAfter)}</strong>
        </div>

        <div className="rounded-lg border border-sand-90 bg-sand-50/50 p-3 text-xs text-sand-530">
          A receipt is created for the amount received, not the full invoice.
        </div>

        <div className="flex justify-end gap-3 border-t border-avatar-ring/30 pt-4">
          <SecondaryButton type="button" onClick={onClose} aria-label="Cancel">
            Cancel
          </SecondaryButton>
          <PrimaryButton
            type="submit"
            disabled={submitting || !isValidAmount}
            aria-label="Record payment"
          >
            {submitting ? 'Recording...' : 'Record payment'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
