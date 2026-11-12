import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

async function openPayments(receipts: Receipt[]) {
  vi.spyOn(api, 'fetchReceipts').mockResolvedValue(receipts)
  vi.spyOn(api, 'fetchRooms').mockResolvedValue([])
  vi.spyOn(api, 'fetchLeases').mockResolvedValue([])
  vi.spyOn(api, 'fetchDebts').mockResolvedValue([])
  render(<PaymentsPage />)
  await screen.findByText(receipts[0].tenantName)
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
afterEach(() => vi.restoreAllMocks())

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

  it('keeps the recorded payment and says where to attach again when the slip upload fails', async () => {
    await openPayments([receipt()])
    const record = vi.spyOn(api, 'recordReceiptPayment').mockResolvedValue(paidReceipt)
    vi.spyOn(api, 'uploadAttachment').mockRejectedValue(new api.ApiError(413, 'The file is larger than 5 MB'))

    await recordWith(pngFile('slip.png'))

    expect(
      await screen.findByText(
        'Payment of ฿1,000.00 recorded for Unit 101, but the slip was not uploaded: The file is larger than 5 MB. Attach it from Payment history.',
      ),
    ).toBeInTheDocument()
    expect(record).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Record payment' })).not.toBeInTheDocument())
  })

  it('uploads nothing when no slip is chosen', async () => {
    await openPayments([receipt()])
    vi.spyOn(api, 'recordReceiptPayment').mockResolvedValue(paidReceipt)
    const upload = vi.spyOn(api, 'uploadAttachment')

    await recordWith(null)

    expect(await screen.findByText('Payment of ฿1,000.00 recorded for Unit 101. Remaining: ฿0.00')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('opens the slip of a payment from the history tab', async () => {
    await openPayments([paidReceipt])
    const list = vi.spyOn(api, 'fetchAttachments').mockResolvedValue([])

    fireEvent.click(screen.getByRole('button', { name: 'Payment history tab' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Payment slip for PAY-9' }))

    expect(await screen.findByText('No slip attached to this payment yet.')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith('PAYMENT', 9)
    expect(screen.queryByRole('button', { name: 'Payment slip for PAY-7' })).not.toBeInTheDocument()
  })
})
