import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '../api/client'
import type { Attachment, Receipt, ReceiptPayment } from '../api/types'
import { resetMockStore } from '../api/mockApi'
import { todayInBangkok } from '../format'
import { pngFile } from '../test/files'
import PaymentsPage from './PaymentsPage'

/**
 * SSK-163: แนบสลิปตอนบันทึกการชำระ (ไม่บังคับ) ลำดับตามสัญญา: บันทึกการชำระก่อน แล้วอัปโหลดด้วย id ของการชำระนั้น
 * POST /api/receipts/{id}/payments ตอบทั้งใบ ไม่ได้ตอบ id ของการชำระ หน้าเว็บจึงเอา id สูงสุดที่ยังไม่ void
 */
function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return { id: 1, receiptNo: 'RC-1', leaseId: 1, roomNumber: '101', tenantName: 'Live Tenant', tenantEmail: null,
    billingMonth: todayInBangkok().slice(0, 7), issuedAt: todayInBangkok(), dueDate: '2099-01-01', status: 'PENDING',
    items: [{ item: 'Rent', detail: null, usageValue: null, usageUnit: null, rate: null, amount: 1000 }], totalAmount: 1000,
    paidAt: null, paymentMethod: null, lastSentAt: null, sentCount: 0, latest: true, overdue: false,
    balanceDue: 1000, outstandingAmount: 1000, previousBalance: 0, interestAmount: 0, paidAmount: 0, settledAmount: 0,
    bank: null, promptPayPayload: null, payments: [], ...overrides }
}
function payment(id: number, overrides: Partial<ReceiptPayment> = {}): ReceiptPayment {
  return { id, amount: 1000, paidOn: todayInBangkok(), method: 'TRANSFER', reference: null, note: null, recordedAt: new Date().toISOString(), voidedAt: null, ...overrides }
}
function attachment(id: number, ownerId: number): Attachment {
  return { id, ownerType: 'PAYMENT', ownerId, fileName: 'slip.png', contentType: 'image/png', sizeBytes: 1024, sha256: 'x',
    uploadedAt: new Date().toISOString(), uploadedBy: 'admin', contentUrl: `/api/attachments/${id}/content` }
}
/** ใบที่ POST payments ตอบกลับ: จ่ายครบแล้ว มีการชำระเก่าที่ void ไปแล้ว (id 7) กับก้อนใหม่ (id 9) */
const paidReceipt = receipt({
  status: 'PAID', balanceDue: 0, outstandingAmount: 0, paidAmount: 1000, settledAmount: 1000,
  payments: [payment(7, { voidedAt: '2026-11-10T00:00:00Z' }), payment(9)],
})

/** เปิดหน้า Payments แล้วคืน spy ของ fetchReceipts ไว้นับว่าหน้าโหลดใหม่หลังบันทึก */
async function openPayments(receipts: Receipt[]) {
  const loadReceipts = vi.spyOn(api, 'fetchReceipts').mockResolvedValue(receipts)
  vi.spyOn(api, 'fetchRooms').mockResolvedValue([])
  vi.spyOn(api, 'fetchLeases').mockResolvedValue([])
  vi.spyOn(api, 'fetchDebts').mockResolvedValue([])
  render(<PaymentsPage />)
  await screen.findByText(receipts[0].tenantName)
  return loadReceipts
}

async function recordWith(slip: File | null) {
  fireEvent.click(screen.getByRole('button', { name: 'Record payment for unit 101' }))
  if (slip) {
    fireEvent.change(screen.getByLabelText('Payment slip (optional)'), { target: { files: [slip] } })
    await screen.findByRole('button', { name: `Remove ${slip.name}` })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
}

beforeEach(() => { resetMockStore(); localStorage.clear(); window.history.replaceState({}, '', '/') })
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Payments page slip upload (SSK-163)', () => {
  it('records the payment first, then attaches the slip to the payment it just created', async () => {
    await openPayments([receipt()])
    const record = vi.spyOn(api, 'recordReceiptPayment').mockResolvedValue(paidReceipt)
    const upload = vi.spyOn(api, 'uploadAttachment').mockResolvedValue(attachment(30, 9))
    const slip = pngFile('slip.png')

    await recordWith(slip)

    expect(await screen.findByText('Payment of ฿1,000.00 recorded for Unit 101 with the slip attached. Remaining: ฿0.00')).toBeInTheDocument()
    expect(record).toHaveBeenCalledWith(1, expect.objectContaining({ amount: 1000, method: 'TRANSFER' }))
    expect(upload).toHaveBeenCalledWith(slip, 'PAYMENT', 9)
    expect(record.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0])
  })

  it('keeps the recorded payment and opens its slip with the same file to try again when the upload fails', async () => {
    const loadReceipts = await openPayments([receipt()])
    const record = vi.spyOn(api, 'recordReceiptPayment').mockResolvedValue(paidReceipt)
    const upload = vi
      .spyOn(api, 'uploadAttachment')
      .mockRejectedValueOnce(new api.ApiError(503, 'Attachments are unavailable'))
      .mockResolvedValueOnce(attachment(30, 9))
    vi.spyOn(api, 'fetchAttachments').mockResolvedValue([])
    const slip = pngFile('slip.png')

    await recordWith(slip)

    expect(
      await screen.findByText(
        'Payment of ฿1,000.00 recorded for Unit 101, but the slip was not uploaded: Attachments are unavailable. Attach it from Payment history.',
      ),
    ).toBeInTheDocument()
    const dialog = await screen.findByRole('dialog', { name: 'Payment slip' })
    expect(within(dialog).getByText('PAY-9 · Unit 101 · RC-1')).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The payment was recorded, but the slip was not uploaded: Attachments are unavailable. Press Attach slip to try again, or attach it later from Payment history.',
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Record payment' })).not.toBeInTheDocument())
    // การชำระถูกบันทึกแล้วจริง หน้าต้องโหลดใหม่ให้เห็นยอดล่าสุด แม้สลิปยังไม่ขึ้น
    await waitFor(() => expect(loadReceipts).toHaveBeenCalledTimes(2))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Attach slip' }))

    expect(await within(dialog).findByText('Slip attached.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(upload.mock.calls).toEqual([
      [slip, 'PAYMENT', 9],
      [slip, 'PAYMENT', 9],
    ])
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('says the slip was not uploaded when the new payment cannot be found on the receipt', async () => {
    await openPayments([receipt()])
    vi.spyOn(api, 'recordReceiptPayment').mockResolvedValue({ ...paidReceipt, payments: [payment(7, { voidedAt: '2026-11-10T00:00:00Z' })] })
    const upload = vi.spyOn(api, 'uploadAttachment')

    await recordWith(pngFile('slip.png'))

    expect(
      await screen.findByText(
        'Payment of ฿1,000.00 recorded for Unit 101, but the slip was not uploaded: the new payment was not found on the receipt. Attach it from Payment history.',
      ),
    ).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Payment slip' })).not.toBeInTheDocument()
  })

  it('uploads nothing when no slip is chosen', async () => {
    await openPayments([receipt()])
    vi.spyOn(api, 'recordReceiptPayment').mockResolvedValue(paidReceipt)
    const upload = vi.spyOn(api, 'uploadAttachment')

    await recordWith(null)

    expect(await screen.findByText('Payment of ฿1,000.00 recorded for Unit 101. Remaining: ฿0.00')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('opens the slip of a payment from the history tab, and a voided payment read-only', async () => {
    await openPayments([paidReceipt])
    const list = vi.spyOn(api, 'fetchAttachments').mockResolvedValue([])

    fireEvent.click(screen.getByRole('button', { name: 'Payment history tab' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Payment slip for PAY-9' }))

    const dialog = await screen.findByRole('dialog', { name: 'Payment slip' })
    expect(await within(dialog).findByText('No slip attached to this payment yet.')).toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith('PAYMENT', 9)
    expect(within(dialog).getByRole('button', { name: 'Attach slip' })).toBeDisabled()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Payment slip' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Payment slip for PAY-7' }))

    const voidedDialog = await screen.findByRole('dialog', { name: 'Payment slip' })
    expect(await within(voidedDialog).findByText('No slip attached to this payment yet.')).toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith('PAYMENT', 7)
    expect(
      within(voidedDialog).getByText('This payment was voided. Its slips stay here for the record and no new slip can be attached.'),
    ).toBeInTheDocument()
    expect(within(voidedDialog).queryByRole('button', { name: 'Attach slip' })).not.toBeInTheDocument()
    expect(within(voidedDialog).queryByLabelText('Slip file to attach')).not.toBeInTheDocument()
  })
})

describe('Payments page messages', () => {
  it('keeps the newest message for its full four seconds when payments are recorded back to back', async () => {
    await openPayments([receipt(), receipt({ id: 2, receiptNo: 'RC-2', leaseId: 2, roomNumber: '102', tenantName: 'Second Tenant' })])
    vi.spyOn(api, 'recordReceiptPayment').mockResolvedValue(paidReceipt)
    // ปลอมแค่ตัวจับเวลาของข้อความ คำขอและการ render ยังเดินตามจริง
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const first = 'Payment of ฿1,000.00 recorded for Unit 101. Remaining: ฿0.00'
    const second = 'Payment of ฿1,000.00 recorded for Unit 102. Remaining: ฿0.00'

    fireEvent.click(screen.getByRole('button', { name: 'Record payment for unit 101' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    await vi.waitFor(() => expect(screen.getByText(first)).toBeInTheDocument())
    act(() => vi.advanceTimersByTime(3000))

    fireEvent.click(screen.getByRole('button', { name: 'Record payment for unit 102' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    await vi.waitFor(() => expect(screen.getByText(second)).toBeInTheDocument())
    // ตัวจับเวลาของข้อความแรกครบสี่วินาทีตรงนี้ ข้อความที่สองต้องยังอยู่
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByText(second)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2500))
    expect(screen.queryByText(second)).not.toBeInTheDocument()
  })
})
