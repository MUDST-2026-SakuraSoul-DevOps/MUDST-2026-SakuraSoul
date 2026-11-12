import { useCallback, useEffect, useState } from 'react'
import { Receipt, Download, Printer, CheckCircle, QrCode, Banknote } from 'lucide-react'
import QRCode from 'qrcode'
import { API_MOCK_ENABLED, errorMessage, receiptPdfUrl } from '../api/client'
import { baht, bahtAmount } from '../format'
import { downloadReceipt, paidNote, printReceiptPdf, type ReceiptData, SAMPLE_RECEIPT } from '../domain/receipt'
import { Modal } from './Modal'
import { type BillingSettings, getBillingSettings, type InvoiceBalances, generatePromptPayPayload } from '../domain/paymentPhase2'

export function GenerateReceiptModal({
  receipt = SAMPLE_RECEIPT,
  isOpen,
  onClose,
  trigger = true,
  receiptId,
  onMarkPaid,
  onOpenRecordPayment,
  billingSettings: propSettings,
  balances,
}: {
  receipt?: ReceiptData
  isOpen?: boolean
  onClose?: () => void
  trigger?: boolean
  /** ใบเสร็จที่ออกผ่าน API แล้ว ปุ่ม Download จะโหลด PDF ของ backend แทนการสร้างเองในเบราว์เซอร์ */
  receiptId?: number
  onMarkPaid?: () => Promise<void>
  onOpenRecordPayment?: () => void
  billingSettings?: BillingSettings
  balances?: InvoiceBalances
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const isControlled = isOpen !== undefined
  const open = isControlled ? isOpen : internalOpen
  const settings = propSettings ?? getBillingSettings()
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)

  const effectiveStatus =
    balances?.status ??
    (receipt.status === 'Paid'
      ? 'Paid'
      : receipt.status === 'Overdue'
        ? 'Overdue'
        : 'Pending')
  const isPaidInFull = effectiveStatus === 'Paid' || (balances ? balances.outstanding === 0 : false)
  const isPartiallyPaid = effectiveStatus === 'Partially paid' || (balances ? balances.totalPaid > 0 && balances.outstanding > 0 : false)

  useEffect(() => {
    if (!open) return
    let active = true

    if (isPaidInFull || receipt.carriedToReceiptNo) {
      Promise.resolve().then(() => {
        if (active) setQrCodeUrl(null)
      })
      return
    }

    if (receipt.promptPayPayload) {
      QRCode.toDataURL(receipt.promptPayPayload, { width: 280, margin: 1 })
        .then((url) => {
          if (active) setQrCodeUrl(url)
        })
        .catch(() => {
          if (active) setQrCodeUrl(null)
        })
      return () => {
        active = false
      }
    }

    const amount = balances
      ? isPartiallyPaid
        ? balances.outstanding
        : balances.totalDue
      : receipt.totalAmount
    const target = receipt.bank?.promptPayId?.trim() || settings.promptPayId?.trim()
    if (!target) {
      Promise.resolve().then(() => {
        if (active) setQrCodeUrl(null)
      })
      return
    }
    try {
      const payload = generatePromptPayPayload(target, amount)
      QRCode.toDataURL(payload, { width: 280, margin: 1 })
        .then((url) => {
          if (active) setQrCodeUrl(url)
        })
        .catch(() => {
          if (active) setQrCodeUrl(null)
        })
    } catch {
      Promise.resolve().then(() => {
        if (active) setQrCodeUrl(null)
      })
    }
    return () => {
      active = false
    }
  }, [open, receipt.promptPayPayload, receipt.bank?.promptPayId, receipt.carriedToReceiptNo, settings.promptPayId, balances, receipt.totalAmount, isPartiallyPaid, isPaidInFull])

  const handleClose = useCallback(() => {
    if (isControlled && onClose) {
      onClose()
    } else {
      setInternalOpen(false)
    }
  }, [isControlled, onClose])

  function handleOpen() {
    if (!isControlled) {
      setInternalOpen(true)
    }
  }

  function handleDownloadPdf() {
    downloadReceipt(receipt, 'pdf')
  }

  function handlePrint() {
    printReceiptPdf(receipt)
  }

  async function handleMarkPaid() {
    if (!onMarkPaid) {
      return
    }
    setPaying(true)
    setPayError(null)
    try {
      await onMarkPaid()
    } catch (err) {
      setPayError(errorMessage(err, 'Could not record the payment'))
    } finally {
      setPaying(false)
    }
  }

  const downloadClass =
    'flex flex-1 items-center justify-center gap-2 rounded-lg bg-wine-720 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-wine-780 transition-colors cursor-pointer'

  return (
    <>
      {trigger && (
        <button
          type="button"
          aria-label="View invoice"
          className="icon-button hover:text-ink cursor-pointer"
          onClick={handleOpen}
        >
          <Receipt aria-hidden="true" className="ui-icon size-icon-control" />
        </button>
      )}

      {open && (
        <Modal
          title="Generate Receipt"
          onClose={handleClose}
          footer={
            <div className="flex w-full flex-wrap gap-3">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cancel"
                className="rounded-lg border border-avatar-ring/50 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-black/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrint}
                aria-label="Print receipt"
                className="flex items-center justify-center gap-2 rounded-lg border border-avatar-ring/50 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-black/5 cursor-pointer"
              >
                <Printer aria-hidden="true" className="ui-icon size-icon-control" />
                Print
              </button>
              {onOpenRecordPayment && !isPaidInFull && !receipt.carriedToReceiptNo && (
                <button
                  type="button"
                  onClick={onOpenRecordPayment}
                  aria-label="Record payment"
                  className="flex items-center justify-center gap-2 rounded-lg border border-honey-140 bg-accent-soft px-4 py-2.5 text-sm font-semibold text-brand hover:bg-accent-soft/80 cursor-pointer"
                >
                  <Banknote aria-hidden="true" className="ui-icon size-icon-control" />
                  Record payment
                </button>
              )}
              {onMarkPaid && !isPaidInFull && !receipt.carriedToReceiptNo && (
                <button
                  type="button"
                  onClick={handleMarkPaid}
                  disabled={paying}
                  aria-label="Mark as Paid"
                  className="flex items-center justify-center gap-2 rounded-lg border border-avatar-ring/50 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-black/5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle aria-hidden="true" className="ui-icon size-icon-control" />
                  {paying ? 'Saving...' : 'Mark as Paid'}
                </button>
              )}
              {/*
                SSK-16 ต่อ backend จริงใช้ PDF ของ backend (ฟอนต์ Sarabun ชื่อไทยไม่เพี้ยน) ส่วนโหมด backend
                จำลอง ลิงก์นี้เบราว์เซอร์โหลดเองไม่ผ่าน mock จะได้หน้า error แทนไฟล์ จึงใช้ PDF ที่สร้าง
                ในเบราว์เซอร์ของ SSK-114 แทน ปุ่มนี้จึงใช้ได้ทั้งสองโหมด
              */}
              {receiptId !== undefined && !API_MOCK_ENABLED ? (
                <a href={receiptPdfUrl(receiptId)} download aria-label="Download (PDF)" className={downloadClass}>
                  <Download aria-hidden="true" className="ui-icon size-icon-control" />
                  Download (PDF)
                </a>
              ) : (
                <button type="button" onClick={handleDownloadPdf} aria-label="Download (PDF)" className={downloadClass}>
                  <Download aria-hidden="true" className="ui-icon size-icon-control" />
                  Download (PDF)
                </button>
              )}
            </div>
          }
        >
          {receipt.carriedToReceiptNo && (
            <div className="mb-3 rounded-lg border border-honey-88/50 bg-honey-20 p-3 text-xs text-honey-600 font-medium">
              This invoice was carried forward to {receipt.carriedToReceiptNo}. Payment must be made on the latest bill.
            </div>
          )}
          {payError && (
            <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
              {payError}
            </p>
          )}
          <div className="flex flex-col gap-5 rounded-lg border border-avatar-ring/40 p-6">
            <div className="flex flex-col items-center gap-1 border-b border-avatar-ring/30 pb-4 text-center">
              <p className="text-lg font-semibold text-ink">Sakura Soul Apartment</p>
              <p className="text-sm text-body-muted">Payment Receipt</p>
            </div>

            <div className="flex flex-col gap-2 border-b border-avatar-ring/30 pb-4 text-sm">
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="text-body-muted">Receipt no.</span>
                <span className="text-ink">{receipt.receiptNo}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="text-body-muted">Tenant</span>
                <span className="text-ink">{receipt.tenant}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="text-body-muted">Unit</span>
                <span className="text-ink">{receipt.unit}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="text-body-muted">Billing month</span>
                <span className="text-ink">{receipt.billingMonth}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="text-body-muted">Due date</span>
                <span className="text-ink">{receipt.dueDate}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="flex min-w-[420px] flex-col gap-3">
                <div className="grid grid-cols-4 gap-2 text-xs font-medium tracking-[0.6px] text-body-muted uppercase">
                  <span>Item</span>
                  <span className="text-right">Usage</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Amount</span>
                </div>
                {receipt.items.map((row) => (
                  <div key={row.id} className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-ink">{row.item}</p>
                      {row.detail && <p className="text-xs text-body-muted">{row.detail}</p>}
                    </div>
                    <span className="text-right text-ink">
                      {row.usageValue != null ? `${row.usageValue} ${row.usageUnit || ''}` : '—'}
                    </span>
                    <span className="text-right text-ink">{row.rate != null ? bahtAmount(row.rate) : '—'}</span>
                    <span data-testid="receipt-item-amount" className="text-right text-ink">
                      {bahtAmount(row.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* SSK-164: Carryover & Interest breakdown */}
            {balances && (balances.carriedBalance > 0 || balances.totalPaid > 0) && (
              <div className="flex flex-col gap-2 rounded-lg border border-avatar-ring/30 bg-page-bg/60 p-3.5 text-xs">
                <div className="flex justify-between text-body-muted">
                  <span>Current month charges</span>
                  <strong className="text-ink font-semibold">{bahtAmount(balances.currentCharges)}</strong>
                </div>
                {balances.carriedBalance > 0 && (
                  <div className="flex justify-between text-body-muted">
                    <span>
                      Previous unpaid balance <small className="text-body-muted/70">(no duplicate charge)</small>
                    </span>
                    <strong className="text-ink font-semibold">{bahtAmount(balances.carriedBalance)}</strong>
                  </div>
                )}
                {balances.lateInterest > 0 && (
                  <div className="flex justify-between text-body-muted">
                    <span>
                      Late interest <small className="text-body-muted/70">({settings.interestRate}% monthly snapshot)</small>
                    </span>
                    <strong className="text-ink font-semibold">{bahtAmount(balances.lateInterest)}</strong>
                  </div>
                )}
                {balances.totalPaid > 0 && (
                  <div className="flex justify-between text-moss-545">
                    <span>Payments received</span>
                    <strong>− {bahtAmount(balances.totalPaid)}</strong>
                  </div>
                )}
                <div className="flex justify-between border-t border-avatar-ring/20 pt-2 text-sm font-semibold">
                  <span className="text-brand">Remaining balance</span>
                  <strong className="text-brand">{bahtAmount(balances.outstanding)}</strong>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-avatar-ring/30 pt-4">
              <span className="text-lg text-ink">
                {isPartiallyPaid ? 'Remaining balance to pay' : 'Total amount'}
              </span>
              <div className="flex items-center gap-2">
                <span data-testid="receipt-total-amount" className="font-heading text-3xl font-bold text-brand">
                  {bahtAmount(
                    isPartiallyPaid && balances
                      ? balances.outstanding
                      : balances
                        ? balances.totalDue
                        : receipt.totalAmount,
                  )}
                </span>
                {isPaidInFull && (
                  <span className="rounded-sm bg-moss-50 px-2.5 py-0.5 text-xs font-semibold text-moss-545 border border-moss-200">
                    Paid in full
                  </span>
                )}
              </div>
            </div>

            {/* Bank transfer & PromptPay QR card */}
            {(() => {
              const displayBank = receipt.bank ?? (settings.bankName ? {
                bankName: settings.bankName,
                accountName: settings.accountName ?? settings.accountHolder ?? '',
                accountNumber: settings.accountNumber,
                promptPayId: settings.promptPayId ?? null,
              } : null)
              const hasCustomImage = Boolean(settings.qrCodeImage && settings.qrCodeImage.trim().length > 0)
              const displayQrSrc = hasCustomImage ? settings.qrCodeImage : qrCodeUrl
              return (
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-avatar-ring/40 bg-sand-50/70 p-6 text-center">
                  {/* Top: Large, clean QR Code without cluttered borders */}
                  <div className="flex size-52 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-xs">
                    {displayQrSrc && (!isPaidInFull || hasCustomImage) && !receipt.carriedToReceiptNo ? (
                      <img
                        src={displayQrSrc}
                        alt="PromptPay QR"
                        className="size-full object-contain rounded-lg"
                      />
                    ) : isPaidInFull ? (
                      <div className="flex flex-col items-center justify-center text-moss-600 gap-2 p-3 text-center">
                        <CheckCircle className="size-12 text-moss-500" aria-hidden="true" />
                        <span className="text-xs font-semibold text-ink">Paid in full</span>
                      </div>
                    ) : receipt.carriedToReceiptNo ? (
                      <div className="flex flex-col items-center justify-center text-body-muted gap-2 p-3 text-center">
                        <span className="text-xs font-semibold text-ink">Carried forward</span>
                        <span className="text-[11px] text-body-muted leading-tight">
                          Balance carried to {receipt.carriedToReceiptNo}
                        </span>
                      </div>
                    ) : !hasCustomImage && !settings.promptPayId?.trim() && !displayBank?.promptPayId ? (
                      <div className="flex flex-col items-center justify-center text-body-muted gap-2 p-3 text-center">
                        <QrCode className="size-12 text-sand-530/50" aria-hidden="true" />
                        <span className="text-xs font-semibold text-ink">PromptPay QR not configured</span>
                        <span className="text-[11px] text-body-muted leading-tight">
                          Please configure PromptPay ID in Billing Settings to generate QR code.
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-body-muted gap-2">
                        <QrCode className="size-16 text-brand/70" aria-hidden="true" />
                        <span className="text-xs">Generating QR...</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom: Details & Account information */}
                  <div className="flex flex-col items-center gap-1.5 w-full max-w-sm">
                    <div className="flex items-center justify-center gap-2">
                      <strong className="text-base font-semibold text-ink">Bank transfer / PromptPay</strong>
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand uppercase tracking-wider">
                        PROMPTPAY
                      </span>
                    </div>

                    {isPaidInFull ? (
                      <div className="my-1 inline-flex items-center gap-1.5 rounded-full bg-moss-50 px-3 py-1 text-xs font-semibold text-moss-600 border border-moss-200">
                        <CheckCircle size={14} />
                        <span>Paid in full · ฿0.00 remaining</span>
                      </div>
                    ) : isPartiallyPaid ? (
                      <div className="my-1 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                        <span>Partially paid · Remaining due: {baht(balances?.outstanding ?? 0)}</span>
                      </div>
                    ) : null}

                    {displayBank && (
                      <>
                        <p className="text-sm font-medium text-ink">
                          {displayBank.bankName} · {displayBank.accountNumber}
                        </p>
                        <p className="text-xs text-body-muted">
                          {displayBank.accountName} · Reference: {receipt.receiptNo}
                        </p>
                        {displayBank.promptPayId && (
                          <p className="text-xs text-ink">
                            PromptPay ID: <span className="font-mono font-semibold text-brand">{displayBank.promptPayId}</span>
                          </p>
                        )}
                      </>
                    )}

                    <p className="text-xs text-body-muted mt-1">
                      Scan PromptPay QR code via your mobile banking app.
                    </p>
                    {isPartiallyPaid && (
                      <p className="text-xs text-amber-700 font-medium">
                        Amount to scan & pay: {baht(balances?.outstanding ?? 0)}
                      </p>
                    )}
                    {hasCustomImage && !settings.qrCodeImage?.startsWith('data:image') && (
                      <p className="text-[11px] text-body-muted/70">
                        QR file selected: {settings.qrCodeImage}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}

            <div className="flex items-center justify-between border-t border-avatar-ring/30 pt-4">
              <span
                className={`inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium ${
                  effectiveStatus === 'Paid'
                    ? 'bg-moss-50 text-moss-545'
                    : effectiveStatus === 'Overdue'
                      ? 'bg-blush-80 text-alert-525'
                      : effectiveStatus === 'Partially paid'
                        ? 'border border-amber-300 bg-amber-50 text-amber-700'
                        : 'bg-honey-20 text-honey-350'
                }`}
              >
                {effectiveStatus}
              </span>
              <span className="text-sm text-body-muted">
                {isPaidInFull
                  ? receipt.paidDate
                    ? paidNote(receipt)
                    : 'Paid in full'
                  : isPartiallyPaid
                    ? `Remaining: ${baht(balances?.outstanding ?? 0)}`
                    : 'Unpaid'}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
