import { useState } from 'react'
import { Mail, Send } from 'lucide-react'
import { errorMessage, sendReceipts } from '../api/client'
import type { SendReceiptsResult, SendSkipReason } from '../api/types'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { Modal } from '../components/Modal'
import type { PaymentStatus } from '../domain/billing'
import { baht } from '../format'

/** หนึ่งใบในป็อปอัป Send Invoices หน้า Payments เป็นคนเลือกว่าใบไหนเข้ามา (SSK-143) */
export interface BulkSendItem {
  receiptId: number
  tenant: string
  /** อีเมลของผู้เช่า null คือไม่มี backend จะข้ามใบนี้ด้วยเหตุผล NO_EMAIL */
  email: string | null
  unit: string
  amount: string
  amountValue: number
  cycle: string
  cycleDate: string
  status: PaymentStatus
  /** เคยส่งอีเมลใบนี้ไปแล้วกี่ครั้งก่อนเปิดป็อปอัป */
  sentCount: number
}

/** ข้อความรายแถวของใบที่ไม่ได้ส่ง ตามเหตุผลที่ backend ตอบ (docs/api-contract-billing.md) */
const SKIP_REASON_TEXT: Record<SendSkipReason, string> = {
  NO_EMAIL: 'No email address on file',
  SEND_FAILED: 'Could not be sent — try again later',
}

/** สีป้ายสถานะชุดเดียวกับตารางหน้า Payments ใบที่เลยกำหนดต้องเห็นว่าเลยกำหนดตั้งแต่ก่อนกดส่ง */
const STATUS_BADGE: Record<PaymentStatus, string> = {
  Paid: 'bg-moss-50 text-moss-545',
  Pending: 'border border-honey-88/50 bg-honey-20 text-honey-350',
  Overdue: 'border border-accent-soft bg-blush-80 text-alert-525',
}

type Phase = 'review' | 'sending' | 'done'

/**
 * ป็อปอัปส่งใบแจ้งหนี้ทางอีเมลพร้อม PDF (SSK-143) เดิมเป็นแบบจำลองที่รอ timer แล้วขึ้นว่าส่งแล้ว (#123)
 *
 * ส่งทุกใบที่หน้า Payments ส่งมา รวมใบของผู้เช่าที่ไม่มีอีเมลด้วย ไม่ได้ตัดทิ้งเองฝั่งนี้ เพราะ backend
 * เป็นคนตัดสินจากอีเมลปัจจุบันของผู้เช่า แล้วตอบกลับว่าใบไหนข้ามเพราะอะไร ป็อปอัปแค่บอกล่วงหน้าให้รู้ตัว
 *
 * ส่งไม่สำเร็จทั้งคำขอ (เช่นเมลเซิร์ฟเวอร์ล่ม 503) ข้อความจาก backend ขึ้นใน role="alert" และป็อปอัปไม่ปิด
 * จะได้กดส่งใหม่ได้ทันที ส่งเสร็จแล้วบอกผลรายใบ หน้า Payments โหลดใหม่ตอนปิดป็อปอัป (onSent)
 */
export function BulkSendInvoicesDialog({
  items,
  onClose,
  onSent,
}: {
  items: BulkSendItem[]
  /** ปิดโดยยังไม่ได้ส่ง */
  onClose: () => void
  /** ปิดหลังส่งเสร็จ หน้า Payments ต้องโหลดใบเสร็จใหม่เพราะจำนวนครั้งที่ส่งเปลี่ยนแล้ว */
  onSent: (result: SendReceiptsResult) => void
}) {
  const [phase, setPhase] = useState<Phase>('review')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SendReceiptsResult | null>(null)

  const recipients = items.filter((item) => item.email !== null).length
  const withoutEmail = items.length - recipients
  const totalAmount = items.reduce((sum, item) => sum + item.amountValue, 0)

  async function handleSend() {
    setPhase('sending')
    setError(null)
    try {
      setResult(await sendReceipts(items.map((item) => item.receiptId)))
      setPhase('done')
    } catch (err) {
      setError(errorMessage(err, 'Could not send the invoices'))
      setPhase('review')
    }
  }

  // ระหว่างส่งปิดไม่ได้ ถ้าปิดกลางทาง ผู้ใช้จะไม่รู้ว่าใบไหนออกไปแล้ว
  // ส่งเสร็จแล้วปิดทางไหนก็ตาม (Done, กากบาท, Esc, คลิกนอกป็อปอัป) ต้องให้หน้า Payments โหลดใหม่
  function handleClose() {
    if (phase === 'sending') {
      return
    }
    if (result) {
      onSent(result)
      return
    }
    onClose()
  }

  function rowNote(item: BulkSendItem) {
    if (result) {
      const sent = result.sent.find((s) => s.receiptId === item.receiptId)
      if (sent) {
        return <span className="text-moss-545">Sent to {sent.email}</span>
      }
      const skipped = result.skipped.find((s) => s.receiptId === item.receiptId)
      if (skipped) {
        return (
          <span className={skipped.reason === 'SEND_FAILED' ? 'text-rose-700' : 'text-honey-350'}>
            {SKIP_REASON_TEXT[skipped.reason]}
          </span>
        )
      }
    }
    return item.email ? (
      <span className="text-sand-530">To {item.email}</span>
    ) : (
      <span className="text-honey-350">No email on file — will be skipped</span>
    )
  }

  const footer =
    phase === 'done' ? (
      <PrimaryButton onClick={handleClose}>Done</PrimaryButton>
    ) : (
      <>
        <SecondaryButton onClick={handleClose} disabled={phase === 'sending'}>
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={handleSend} disabled={phase === 'sending' || recipients === 0}>
          <Send size={14} />
          {phase === 'sending' ? 'Sending...' : `Send ${recipients} ${recipients === 1 ? 'Invoice' : 'Invoices'}`}
        </PrimaryButton>
      </>
    )

  return (
    <Modal
      title="Send Invoices"
      subtitle="Each tenant receives an email with their invoice PDF attached"
      onClose={handleClose}
      footer={footer}
      width="wide"
    >
      <div className="space-y-5 text-xs text-sand-830">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-honey-140 bg-page-bg p-4">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-sand-530 uppercase">Invoices to Send</p>
            <p className="mt-0.5 font-heading text-2xl font-bold text-sand-830">
              {items.length} <span className="text-xs font-normal text-sand-530">Invoices</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wider text-sand-530 uppercase">Total Value</p>
            <p className="mt-0.5 font-heading text-xl font-bold text-brand">{baht(totalAmount)}</p>
          </div>
        </div>

        <p className="flex items-center gap-2 text-sand-530">
          <Mail size={16} className="text-brand" />
          Email with the invoice PDF attached
        </p>

        {withoutEmail > 0 && phase !== 'done' && (
          <p className="rounded-lg border border-honey-88/50 bg-honey-20 px-4 py-3 text-honey-350">
            {withoutEmail} {withoutEmail === 1 ? 'tenant has' : 'tenants have'} no email on file and will be skipped.
          </p>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-bold tracking-wider text-sand-530 uppercase">Recipients ({items.length})</h3>
          <ul className="max-h-60 divide-y divide-sand-65 overflow-y-auto rounded-xl border border-honey-140/60 bg-white">
            {items.map((item) => (
              <li key={item.receiptId} className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={item.tenant} size={36} />
                  <div>
                    <p className="text-xs font-bold text-sand-830">{item.tenant}</p>
                    <p className="text-[11px] text-sand-530">
                      {item.unit} · {item.cycleDate} ({item.cycle})
                    </p>
                    <p className="text-[11px]">{rowNote(item)}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <p className="text-xs font-bold text-sand-830">{item.amount}</p>
                  <div className="flex items-center gap-1">
                    {item.sentCount > 0 && (
                      <span className="rounded-xs bg-sand-50 px-2 py-0.5 text-[10px] font-medium text-sand-530">
                        Sent ×{item.sentCount}
                      </span>
                    )}
                    <span className={`rounded-xs px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {result && (
          <p role="status" className="rounded-lg border border-moss-120 bg-moss-50 px-4 py-3 text-sm text-moss-545">
            Sent {result.sent.length} of {items.length}
            {result.skipped.length > 0 && ` · ${result.skipped.length} skipped`}
          </p>
        )}
      </div>
    </Modal>
  )
}
