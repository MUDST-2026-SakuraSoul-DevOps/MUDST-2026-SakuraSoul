import { beforeEach, describe, expect, it } from 'vitest'
import { createReceipt, fetchDebts, fetchReceipts, fetchSummaryReport, payReceipt, recordReceiptPayment, updateBankAccountConfig, updateLateInterestConfig, updateReceipt, voidPayment } from './client'
import { resetMockStore } from './mockApi'
import { todayInBangkok } from '../format'

beforeEach(() => resetMockStore())
describe('payment mock backend parity', () => {
  it('does not allow voiding an older active payment', async () => {
    const unpaid = (await fetchReceipts()).find(receipt => receipt.status !== 'PAID')!
    const first = await recordReceiptPayment(unpaid.id, { amount: 100, method: 'CASH' })
    const firstId = first.payments!.at(-1)!.id
    await recordReceiptPayment(unpaid.id, { amount: 100, method: 'CASH' })
    await expect(voidPayment(firstId)).rejects.toMatchObject({ status: 409, message: 'Only the most recent payment of this lease can be voided' })
  })

  it('keeps an existing invoice bank snapshot after bank configuration changes', async () => {
    const before = (await fetchReceipts())[0]
    await updateBankAccountConfig({ bankName: 'New bank', accountName: 'Apartment', accountNumber: '1234567890', promptPayId: null })
    const after = (await fetchReceipts()).find(receipt => receipt.id === before.id)!
    expect(after.bank).toEqual(before.bank)
    expect(after.previousBalance).toBe(0)
    expect(after.latest).toBe(true)
  })

  it('allocates a payment to the oldest debt first and restores it when voided', async () => {
    const old = (await fetchReceipts()).find(receipt => receipt.status !== 'PAID')!
    const latest = await createReceipt({ leaseId: old.leaseId, billingMonth: todayInBangkok().slice(0, 7), electricUnits: 0, waterUnits: 0 })
    expect(latest.previousBalance).toBe(old.balanceDue)
    const paid = await recordReceiptPayment(latest.id, { amount: 100, method: 'CASH' })
    let refreshed = await fetchReceipts()
    expect(refreshed.find(receipt => receipt.id === old.id)).toMatchObject({ latest: false, balanceDue: null, settledAmount: 100 })
    expect(paid).toMatchObject({ paidAmount: 100, settledAmount: 0 })
    const oldReport = await fetchSummaryReport({ groupBy: 'unit', from: old.billingMonth, to: old.billingMonth })
    const newReport = await fetchSummaryReport({ groupBy: 'unit', from: latest.billingMonth, to: latest.billingMonth })
    expect(oldReport.rows.find(row => row.key === old.roomNumber)?.received).toBe(100)
    expect(newReport.rows.find(row => row.key === old.roomNumber)?.received).toBe(0)
    const debt = (await fetchDebts()).find(debt => debt.leaseId === old.leaseId)!
    expect(debt.oldestUnpaidDueDate).toBe(old.dueDate)
    expect(debt.daysOverdue).toBe(Math.floor((new Date(todayInBangkok()).getTime() - new Date(old.dueDate).getTime()) / 86400000))
    await voidPayment(paid.payments!.at(-1)!.id)
    refreshed = await fetchReceipts()
    expect(refreshed.find(receipt => receipt.id === old.id)?.settledAmount).toBe(0)
  })

  it('recalculates balances and payment limits after editing an unpaid invoice', async () => {
    const old = (await fetchReceipts()).find(receipt => receipt.status !== 'PAID')!
    const latest = await createReceipt({ leaseId: old.leaseId, billingMonth: todayInBangkok().slice(0, 7), electricUnits: 0, waterUnits: 0 })
    const edited = await updateReceipt(latest.id, { billingMonth: latest.billingMonth, electricUnits: 10, waterUnits: 0 })
    expect(edited.balanceDue).toBe(edited.totalAmount)
    expect(edited.outstandingAmount).toBe(edited.totalAmount - (edited.previousBalance ?? 0))
    await expect(recordReceiptPayment(edited.id, { amount: edited.balanceDue!, method: 'CASH' })).resolves.toMatchObject({ balanceDue: 0 })
  })

  it('keeps a fully paid invoice settled after the next invoice is issued', async () => {
    const old = (await fetchReceipts()).find(receipt => receipt.status !== 'PAID')!
    await payReceipt(old.id, 'Cash')
    const latest = await createReceipt({ leaseId: old.leaseId, billingMonth: todayInBangkok().slice(0, 7), electricUnits: 0, waterUnits: 0 })
    expect(latest.previousBalance).toBe(0)
    expect((await fetchReceipts()).find(receipt => receipt.id === old.id)?.status).toBe('PAID')
  })

  it('does not invent interest on an existing invoice after a configuration change', async () => {
    const old = (await fetchReceipts()).find(receipt => receipt.status !== 'PAID')!
    const latest = await createReceipt({ leaseId: old.leaseId, billingMonth: todayInBangkok().slice(0, 7), electricUnits: 0, waterUnits: 0 })
    await updateLateInterestConfig({ lateInterestPercentPerMonth: 2, graceDays: 0 })
    const refreshed = (await fetchReceipts()).find(receipt => receipt.id === latest.id)!
    expect(refreshed.interestAmount).toBe(latest.interestAmount)
    expect(refreshed.totalAmount).toBe(latest.totalAmount)
  })

  /*
    LeaseAccount.isOverdue ฝั่ง backend: บิลล่าสุดยังมียอดต้องจ่าย และวันนี้เลยวันครบกำหนดของใบเก่าสุดที่ยังค้าง
    ใบเดือนก่อนของ Kenji เลยกำหนดมาเจ็ดวันแล้ว (ข้อมูลตั้งต้นของ mock) พอยกไปรวมในบิลเดือนนี้ซึ่งครบกำหนดวันที่ 5 ของเดือนหน้า
    บิลใหม่ต้องเป็น overdue ทั้งที่ตัวมันเองยังไม่ถึงกำหนด เพราะหนี้ที่ยกมาเลยกำหนดแล้ว
  */
  it('flags the latest bill overdue from the oldest unpaid due date of the lease, not its own', async () => {
    const late = (await fetchReceipts()).find(receipt => receipt.tenantName === 'Kenji Sato')!
    expect(late).toMatchObject({ latest: true, overdue: true })
    const next = await createReceipt({ leaseId: late.leaseId, billingMonth: todayInBangkok().slice(0, 7), electricUnits: 0, waterUnits: 0 })

    expect(next.dueDate > todayInBangkok()).toBe(true)
    expect(next).toMatchObject({ latest: true, previousBalance: late.balanceDue, overdue: true })
    const refreshed = await fetchReceipts()
    expect(refreshed.find(receipt => receipt.id === next.id)).toMatchObject({ overdue: true })
    expect(refreshed.find(receipt => receipt.id === late.id)).toMatchObject({ latest: false, overdue: false, carriedToReceiptNo: next.receiptNo })

    // จ่ายยอดที่ยกมาครบ เงินตัดเข้าใบเก่าก่อน ใบเก่าสุดที่ยังค้างกลายเป็นบิลใหม่ที่ยังไม่ถึงกำหนด ธงจึงหาย
    const paidOff = await recordReceiptPayment(next.id, { amount: late.balanceDue!, method: 'CASH' })
    expect(paidOff.balanceDue).toBeGreaterThan(0)
    expect(paidOff.overdue).toBe(false)
  })

  it('rejects edits after a partial payment and invalid report ranges', async () => {
    const unpaid = (await fetchReceipts()).find(receipt => receipt.status !== 'PAID')!
    await recordReceiptPayment(unpaid.id, { amount: 100, method: 'CASH' })
    await expect(updateReceipt(unpaid.id, { billingMonth: unpaid.billingMonth, electricUnits: 0, waterUnits: 0 })).rejects.toMatchObject({ status: 409, message: 'Receipts with payments cannot be edited' })
    await expect(fetchSummaryReport({ groupBy: 'unit', from: '2027-01', to: '2026-01' })).rejects.toMatchObject({ status: 400 })
  })
})
