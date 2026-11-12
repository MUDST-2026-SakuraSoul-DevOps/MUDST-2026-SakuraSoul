import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PaymentRecord } from '../domain/paymentPhase2'
import { PaymentHistoryTab } from './PaymentHistoryTab'

/** SSK-163: คอลัมน์ PROOF ของประวัติการชำระ เปิดสลิปของการชำระที่ยังไม่ void */
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

describe('PaymentHistoryTab slips', () => {
  it('opens the slip of a payment that is not voided, and offers none for a voided one', () => {
    const onViewSlip = vi.fn()
    render(<PaymentHistoryTab records={[paid, voided]} onOpenSettings={vi.fn()} onViewSlip={onViewSlip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Payment slip for PAY-12' }))

    expect(onViewSlip).toHaveBeenCalledWith(paid)
    expect(screen.queryByRole('button', { name: 'Payment slip for PAY-11' })).not.toBeInTheDocument()
  })

  it('has no slip button when the page cannot open slips', () => {
    render(<PaymentHistoryTab records={[paid]} onOpenSettings={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Payment slip for PAY-12' })).not.toBeInTheDocument()
  })
})
