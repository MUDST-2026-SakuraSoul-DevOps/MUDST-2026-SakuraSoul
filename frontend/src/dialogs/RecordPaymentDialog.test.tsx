import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecordPaymentDialog } from './RecordPaymentDialog'

const receipt = { id: 42, receiptNo: 'INV-0042', roomNumber: '202', tenantName: 'Ada Tenant' }

function renderPayment(onRecord = vi.fn()) {
  const onClose = vi.fn()
  render(<RecordPaymentDialog isOpen receipt={receipt} outstanding={9700} onClose={onClose} onRecord={onRecord} />)
  return { user: userEvent.setup(), onClose, onRecord }
}

describe('RecordPaymentDialog amount boundaries', () => {
  it.each([
    ['empty', ''],
    ['zero', '0'],
    ['negative', '-1'],
    ['above outstanding', '9700.01'],
  ])('does not submit an %s amount', async (_caseName, amount) => {
    // ยอดที่ไม่อยู่ในช่วงรับชำระต้องปิดปุ่มและไม่เรียก callback บันทึกเงิน
    const { user, onRecord } = renderPayment()
    const input = screen.getByRole('spinbutton', { name: 'Amount received (THB)' })
    await user.clear(input)
    if (amount) await user.type(input, amount)
    const submit = screen.getByRole('button', { name: 'Record payment' })
    expect(submit).toBeDisabled()
    await user.click(submit)
    expect(onRecord).not.toHaveBeenCalled()
  })

  it.each([
    [0.01, '9,699.99'],
    [4000, '5,700.00'],
    [9700, '0.00'],
  ])('records %s with the correct invoice identity and remaining balance', async (amount, balance) => {
    // ยอดบางส่วนและยอดเต็มต้องส่งเลขใบกับห้องที่ถูกต้อง และแสดงยอดคงเหลือจากเงินที่กรอก
    const { user, onRecord, onClose } = renderPayment()
    const input = screen.getByRole('spinbutton', { name: 'Amount received (THB)' })
    await user.clear(input)
    await user.type(input, String(amount))
    expect(screen.getByText(balance)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(onRecord).toHaveBeenCalledOnce())
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({
      receiptId: receipt.id,
      receiptNo: receipt.receiptNo,
      roomNumber: receipt.roomNumber,
      tenantName: receipt.tenantName,
      amount,
      method: 'Bank transfer',
    }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('prevents a second submit while the first payment is pending', async () => {
    // ระหว่างรอบันทึก ปุ่มต้องกดซ้ำไม่ได้เพื่อป้องกันการเรียกบันทึกเงินสองครั้ง
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    const onRecord = vi.fn(() => pending)
    const { user, onClose } = renderPayment(onRecord)
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    const submit = screen.getByRole('button', { name: 'Record payment' })
    expect(submit).toHaveTextContent('Recording...')
    expect(submit).toBeDisabled()
    await user.click(submit)
    expect(onRecord).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => { finish(); await pending })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
