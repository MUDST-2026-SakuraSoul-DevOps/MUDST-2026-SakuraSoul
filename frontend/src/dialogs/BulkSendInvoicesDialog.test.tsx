import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '../api/client'
import { createReceipt, fetchReceipts, sendReceipts, updateTenant } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { Receipt } from '../api/types'
import { displayBillingMonth, type PaymentStatus } from '../domain/billing'
import { baht, todayInBangkok } from '../format'
import { BulkSendInvoicesDialog, type BulkSendItem } from './BulkSendInvoicesDialog'

/*
  ป็อปอัปส่งใบแจ้งหนี้ทางอีเมล (SSK-143) เรนเดอร์ตรง ๆ ด้วยใบจริงจาก backend จำลอง ส่งผ่าน POST /api/receipts/send ของมัน
  แต่ละแถวสร้างแบบเดียวกับที่หน้า Payments ทำ (bulkItems ใน PaymentsPage) ยอดคิดด้วยมือจากข้อมูลตั้งต้นของ mock

  RC-2026-0001 Yuki Tanaka ห้อง 102 จ่ายแล้ว   15,250
  RC-2026-0002 Kenji Sato  ห้อง 201 เลยกำหนด   9,700
  ใบใหม่ของ Hiroshi Nakamura ห้อง 207 เดือนนี้ 100 หน่วยไฟ 10 หน่วยน้ำ
    3,500 + 300 + 250 + 100×50 (5,000) + 10×100 (1,000) = 10,050
  รวมสามใบ 15,250 + 9,700 + 10,050 = 35,000
*/

async function receiptNo(no: string): Promise<Receipt> {
  return (await fetchReceipts()).find((r) => r.receiptNo === no)!
}

function itemOf(receipt: Receipt, status: PaymentStatus): BulkSendItem {
  return {
    receiptId: receipt.id,
    tenant: receipt.tenantName,
    email: receipt.tenantEmail,
    unit: `Unit ${receipt.roomNumber}`,
    amount: baht(receipt.totalAmount),
    amountValue: receipt.totalAmount,
    cycle: 'Monthly',
    cycleDate: displayBillingMonth(receipt.billingMonth),
    status,
    sentCount: receipt.sentCount,
  }
}

function renderSend(items: BulkSendItem[]) {
  const onClose = vi.fn()
  const onSent = vi.fn()
  render(<BulkSendInvoicesDialog items={items} onClose={onClose} onSent={onSent} />)
  return { onClose, onSent }
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('list')).getAllByRole('listitem')
}

beforeEach(() => {
  resetMockStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BulkSendInvoicesDialog', () => {
  it('warns that two tenants without email will be skipped, shows earlier sends, and reports each invoice', async () => {
    const user = userEvent.setup()
    // ลบอีเมลของ Kenji กับ Hiroshi (PUT แทนทั้งก้อน ต้องส่งช่องเดิมกลับไปด้วย)
    await updateTenant(2, { fullName: 'Kenji Sato', phone: '082-345-6789', nationalId: '1100400234561', email: null })
    await updateTenant(3, { fullName: 'Hiroshi Nakamura', phone: '083-456-7890', nationalId: '1100400345673', email: null })
    const hiroshiBill = await createReceipt({ leaseId: 3, billingMonth: todayInBangkok().slice(0, 7), electricUnits: 100, waterUnits: 10 })
    // ใบที่จ่ายแล้วของ Yuki เคยส่งเป็นสำเนาไปแล้วสองครั้ง
    await sendReceipts([1])
    await sendReceipts([1])
    const yuki = await receiptNo('RC-2026-0001')
    const kenji = await receiptNo('RC-2026-0002')
    const hiroshi = await receiptNo(hiroshiBill.receiptNo)
    const send = vi.spyOn(api, 'sendReceipts')
    const { onClose, onSent } = renderSend([itemOf(yuki, 'Paid'), itemOf(kenji, 'Overdue'), itemOf(hiroshi, 'Pending')])

    expect(screen.getByText('Invoices to Send').nextElementSibling).toHaveTextContent('3 Invoices')
    expect(screen.getByText('35,000.00')).toBeInTheDocument()
    expect(screen.getByText('2 tenants have no email on file and will be skipped.')).toBeInTheDocument()
    expect(screen.getByText('Recipients (3)')).toBeInTheDocument()
    const [yukiRow, kenjiRow, hiroshiRow] = rows()
    expect(within(yukiRow).getByText(`Unit 102 · ${displayBillingMonth(yuki.billingMonth)} (Monthly)`)).toBeInTheDocument()
    expect(within(yukiRow).getByText('To yuki.t@example.com')).toBeInTheDocument()
    expect(within(yukiRow).getByText('Sent ×2')).toBeInTheDocument()
    expect(within(yukiRow).getByText('Paid')).toBeInTheDocument()
    expect(within(yukiRow).getByText('15,250.00')).toBeInTheDocument()
    expect(within(kenjiRow).getByText('No email on file — will be skipped')).toBeInTheDocument()
    expect(within(kenjiRow).getByText('Overdue')).toBeInTheDocument()
    expect(within(kenjiRow).queryByText(/^Sent ×/)).not.toBeInTheDocument()
    expect(within(hiroshiRow).getByText('No email on file — will be skipped')).toBeInTheDocument()
    expect(within(hiroshiRow).getByText('Pending')).toBeInTheDocument()
    expect(within(hiroshiRow).getByText('10,050.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Send 1 Invoice' }))

    // ส่งไปทั้งสามใบ backend เป็นคนตัดสินจากอีเมลปัจจุบันว่าใบไหนข้าม
    expect(send).toHaveBeenCalledWith([yuki.id, kenji.id, hiroshi.id])
    expect((await screen.findByRole('status')).textContent).toBe('Sent 1 of 3 · 2 skipped')
    expect(within(yukiRow).getByText('Sent to yuki.t@example.com')).toBeInTheDocument()
    expect(within(kenjiRow).getByText('No email address on file')).toBeInTheDocument()
    expect(within(hiroshiRow).getByText('No email address on file')).toBeInTheDocument()
    expect(screen.queryByText('2 tenants have no email on file and will be skipped.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(onSent).toHaveBeenCalledWith({
      sent: [expect.objectContaining({ receiptId: yuki.id, email: 'yuki.t@example.com', sentCount: 3 })],
      skipped: [
        { receiptId: kenji.id, receiptNo: 'RC-2026-0002', tenantName: 'Kenji Sato', reason: 'NO_EMAIL' },
        { receiptId: hiroshi.id, receiptNo: hiroshi.receiptNo, tenantName: 'Hiroshi Nakamura', reason: 'NO_EMAIL' },
      ],
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without sending anything from Cancel, the close button or Escape', async () => {
    const user = userEvent.setup()
    const send = vi.spyOn(api, 'sendReceipts')
    const { onClose, onSent } = renderSend([itemOf(await receiptNo('RC-2026-0002'), 'Overdue')])
    expect(screen.getByRole('button', { name: 'Send 1 Invoice' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(3)
    expect(onSent).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect((await receiptNo('RC-2026-0002')).sentCount).toBe(0)
  })

  it('cannot be closed while the invoices are going out, and hands back the result when closed afterwards', async () => {
    const user = userEvent.setup()
    const kenji = await receiptNo('RC-2026-0002')
    const realSend = api.sendReceipts
    let finishSending: () => void = () => {}
    const sending = new Promise<void>((resolve) => {
      finishSending = resolve
    })
    vi.spyOn(api, 'sendReceipts').mockImplementation(async (ids) => {
      await sending
      return realSend(ids)
    })
    const { onClose, onSent } = renderSend([itemOf(kenji, 'Overdue')])

    await user.click(screen.getByRole('button', { name: 'Send 1 Invoice' }))

    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    // ปิดกลางทางผู้ใช้จะไม่รู้ว่าใบไหนออกไปแล้ว Esc กับปุ่มกากบาทจึงไม่ทำอะไร
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(onSent).not.toHaveBeenCalled()

    finishSending()

    expect((await screen.findByRole('status')).textContent).toBe('Sent 1 of 1')
    expect(screen.getByText('Sent to kenji.s@example.com')).toBeInTheDocument()
    // ส่งเสร็จแล้วปิดด้วย Esc ก็ต้องส่งผลกลับให้หน้า Payments โหลดตารางใหม่ ไม่ใช่ปิดเฉย ๆ
    await user.keyboard('{Escape}')
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1))
    expect(onSent).toHaveBeenCalledWith({
      sent: [expect.objectContaining({ receiptId: kenji.id, email: 'kenji.s@example.com', sentCount: 1 })],
      skipped: [],
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
