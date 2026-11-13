import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PaymentRecord } from '../domain/paymentPhase2'
import { PaymentHistoryTab } from './PaymentHistoryTab'

/**
 * SSK-163: คอลัมน์ PROOF ของประวัติการชำระ เปิดสลิปของการชำระทุกก้อนที่บันทึกแล้ว
 * ก้อนที่ void แล้วยังเปิดดูสลิปเดิมได้ (ป็อปอัปเป็นแบบดูอย่างเดียว) ใบที่ยังไม่จ่ายไม่มีสลิปให้เปิด
 */
const paid: PaymentRecord = {
  id: 'PAY-12',
  paymentId: 12,
  receiptId: 1,
  receiptNo: 'RC-1',
  roomNumber: '101',
  tenantName: 'Tenant',
  amount: 500,
  date: '2026-11-09',
  method: 'Cash',
  status: 'Paid',
  canVoid: true,
}
const voided: PaymentRecord = { ...paid, id: 'PAY-11', paymentId: 11, status: 'Voided', canVoid: false }
const awaiting: PaymentRecord = { ...paid, id: 'INV-3', paymentId: undefined, receiptNo: 'RC-3', status: 'Pending', canVoid: false }

describe('PaymentHistoryTab slips', () => {
  it('opens the slip of every recorded payment, and says a voided one can only be viewed', () => {
    const onViewSlip = vi.fn()
    render(<PaymentHistoryTab records={[paid, voided]} onOpenSettings={vi.fn()} onViewSlip={onViewSlip} />)

    const paidSlip = screen.getByRole('button', { name: 'Payment slip for PAY-12' })
    const voidedSlip = screen.getByRole('button', { name: 'Payment slip for PAY-11' })
    expect(paidSlip.textContent).toBe('View / attach slip')
    expect(voidedSlip.textContent).toBe('View slip')

    fireEvent.click(paidSlip)
    fireEvent.click(voidedSlip)

    expect(onViewSlip.mock.calls).toEqual([[paid], [voided]])
  })

  it('shows Unpaid instead of a slip for an invoice still awaiting payment', () => {
    render(<PaymentHistoryTab records={[awaiting]} onOpenSettings={vi.fn()} onViewSlip={vi.fn()} />)

    const row = screen.getByRole('row', { name: /INV-3/ })
    expect(within(row).getByText('Unpaid')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /Payment slip/ })).not.toBeInTheDocument()
  })

  it('has no slip button when the page cannot open slips', () => {
    render(<PaymentHistoryTab records={[paid]} onOpenSettings={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Payment slip for PAY-12' })).not.toBeInTheDocument()
  })
})
