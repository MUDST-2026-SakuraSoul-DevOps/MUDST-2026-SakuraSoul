import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as client from '../api/client'
import { ApiError } from '../api/client'
import type { Receipt } from '../api/types'
import { EditPaymentDialog } from './EditPaymentDialog'

/*
  แก้ใบแจ้งหนี้ (SSK-155) แก้ได้แค่หน่วยไฟ หน่วยน้ำ และเดือน คิดยอดใหม่ด้วยอัตราที่ล็อกในใบเดิม
  ตรงนี้คุมข้อความเตือนทุกข้อ ตัวอย่างยอดตอนหน่วยผิด และใบที่ไม่มีบางรายการ
*/

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 7,
    receiptNo: 'RC-2026-0007',
    leaseId: 3,
    roomNumber: '201',
    tenantName: 'Kenji Sato',
    billingMonth: '2026-10',
    status: 'PENDING',
    totalAmount: 5560,
    items: [
      { item: 'Room rent', usageValue: null, rate: null, amount: 3500 },
      { item: 'Electricity', usageValue: 100, rate: 8, amount: 800 },
      { item: 'Water', usageValue: 10, rate: 18, amount: 180 },
      { item: 'Common area fee', usageValue: null, rate: null, amount: 300 },
      { item: 'Internet', usageValue: null, rate: null, amount: 250 },
    ],
    ...overrides,
  } as Receipt
}

function setup(r: Receipt = receipt()) {
  const onClose = vi.fn()
  const onUpdated = vi.fn()
  const user = userEvent.setup()
  render(<EditPaymentDialog receipt={r} onClose={onClose} onUpdated={onUpdated} />)
  return { user, onClose, onUpdated }
}

const form = () => screen.getByLabelText(/Receipt/i, { selector: 'input' }).closest('form')!
const total = () => screen.getByTestId('edit-bill-total')

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('EditPaymentDialog', () => {
  it('recalculates the total with the rates locked on the bill', async () => {
    const { user } = setup()
    expect(total()).toHaveTextContent('฿5,030.00')

    await user.clear(screen.getByLabelText(/Electric/i))
    await user.type(screen.getByLabelText(/Electric/i), '150')
    // 3,500 + 300 + 250 + 150×8 + 10×18
    expect(total()).toHaveTextContent('฿5,430.00')
  })

  it('shows dashes instead of a total while a meter value is wrong, and names the meter', async () => {
    const { user } = setup()

    await user.clear(screen.getByLabelText(/Water/i))
    expect(total()).toHaveTextContent('—')
    fireEvent.submit(form())
    expect(await screen.findByText('Please enter the water units')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Water/i), '5')
    await user.clear(screen.getByLabelText(/Electric/i))
    await user.type(screen.getByLabelText(/Electric/i), '-1')
    fireEvent.submit(form())
    // ข้อความขึ้นทั้งใต้ช่องและกล่องเตือนบนฟอร์ม
    expect(await screen.findAllByText('Electricity units cannot be negative')).toHaveLength(2)
  })

  it('refuses to edit a paid bill', async () => {
    setup(receipt({ status: 'PAID' }))
    fireEvent.submit(form())
    expect(await screen.findByText('Paid receipts cannot be edited')).toBeInTheDocument()
  })

  it('refuses an empty or future billing month', async () => {
    setup(receipt({ billingMonth: '' }))
    fireEvent.submit(form())
    expect(await screen.findByText('Please choose the billing month')).toBeInTheDocument()
  })

  it('refuses a billing month after this month', async () => {
    setup(receipt({ billingMonth: '2999-01' }))
    fireEvent.submit(form())
    expect(await screen.findByText('The billing month cannot be in the future')).toBeInTheDocument()
  })

  it('opens a bill without meter lines at zero units', () => {
    setup(receipt({ items: [{ item: 'Room rent', usageValue: null, rate: null, amount: 3500 }] as Receipt['items'] }))
    expect(screen.getByLabelText(/Electric/i)).toHaveValue(0)
    expect(total()).toHaveTextContent('฿3,500.00')
  })

  it('saves the new units and closes', async () => {
    const updated = receipt({ totalAmount: 5430 })
    const update = vi.spyOn(client, 'updateReceipt').mockResolvedValue(updated)
    const { user, onUpdated, onClose } = setup()

    await user.clear(screen.getByLabelText(/Electric/i))
    await user.type(screen.getByLabelText(/Electric/i), '150')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated))
    expect(update).toHaveBeenCalledWith(7, { billingMonth: '2026-10', electricUnits: 150, waterUnits: 10 })
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the dialog open with the server message when saving fails', async () => {
    vi.spyOn(client, 'updateReceipt').mockRejectedValue(new ApiError(409, 'This bill was paid in the meantime'))
    const { user, onUpdated } = setup()

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('This bill was paid in the meantime')).toBeInTheDocument()
    expect(onUpdated).not.toHaveBeenCalled()
  })
})
