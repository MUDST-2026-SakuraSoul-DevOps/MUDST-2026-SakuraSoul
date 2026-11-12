import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import * as paymentPhase2 from '../domain/paymentPhase2'

const receipt = { id: 42, receiptNo: 'INV-0042', roomNumber: '202', tenantName: 'Ada Tenant' }

function renderPayment(onRecord = vi.fn()) {
  const onClose = vi.fn()
  render(<RecordPaymentDialog isOpen receipt={receipt} outstanding={9700} onClose={onClose} onRecord={onRecord} />)
  return { user: userEvent.setup(), onClose, onRecord }
}
describe('RecordPaymentDialog file size checks', () => {
  const mockReceipt = {
    id: 101,
    receiptNo: 'INV-2026-101',
    roomNumber: '101',
    tenantName: 'Kenji Sato',
    totalAmount: 5000,
  }

  it('rejects PDF file larger than 350 KB at the first gate', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const pdf500k = new File([new ArrayBuffer(500 * 1024)], 'statement.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [pdf500k] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PDF file size exceeds 350 KB limit (500 KB). Please select a smaller file.',
    )
  })

  // Round 5 Issue: 1 MB PDF without mock must hit the 350 KB gate directly
  it('rejects 1 MB PDF at the first gate without mocking compressImageSlip', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const real1MbPdf = new File([new ArrayBuffer(1024 * 1024)], 'bank_statement_1mb.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [real1MbPdf] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PDF file size exceeds 350 KB limit (1.0 MB). Please select a smaller file.',
    )
  })

  it('allows small PDF under 350 KB without mocking compressImageSlip', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const smallPdf = new File([new ArrayBuffer(50 * 1024)], 'small_receipt.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [smallPdf] } })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/Attached: small_receipt.pdf/i)).toBeInTheDocument()
    })
  })

  it('allows image file between 2 MB and 10 MB because canvas compresses it', async () => {
    vi.spyOn(paymentPhase2, 'compressImageSlip').mockResolvedValue('data:image/jpeg;base64,mockSmallData')

    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const phonePhoto = new File([new ArrayBuffer(4 * 1024 * 1024)], 'phone_slip.jpg', {
      type: 'image/jpeg',
    })

    fireEvent.change(fileInput, { target: { files: [phonePhoto] } })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/Attached: phone_slip.jpg/i)).toBeInTheDocument()
    })
  })

  it('rejects image file larger than 10 MB', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const hugeImage = new File([new ArrayBuffer(12 * 1024 * 1024)], 'huge_photo.png', {
      type: 'image/png',
    })

    fireEvent.change(fileInput, { target: { files: [hugeImage] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Image file size exceeds 10 MB limit (12.0 MB). Please select a smaller file.',
    )
  })

  it('rejects file post-compression if resulting data URL exceeds 500 KB', async () => {
    const hugeDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(600 * 1024)
    vi.spyOn(paymentPhase2, 'compressImageSlip').mockResolvedValue(hugeDataUrl)

    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const file = new File([new ArrayBuffer(100 * 1024)], 'uncompressed.png', {
      type: 'image/png',
    })

    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Image is too large to store in browser archive. Please select a smaller image.',
    )
  })

  // Boundary probes from QA (probe-qa-slip-boundary.test.tsx)
  it('accepts a PDF at exactly 350 KB and the data URL still fits the archive gate', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const exact350KbPdf = new File([new ArrayBuffer(350 * 1024)], 'exact_350kb.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [exact350KbPdf] } })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/Attached: exact_350kb.pdf/i)).toBeInTheDocument()
    })
  })

  it('rejects a PDF one byte over the limit at the first gate', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const oneByteOverPdf = new File([new ArrayBuffer(350 * 1024 + 1)], 'over_350kb.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [oneByteOverPdf] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PDF file size exceeds 350 KB limit (351 KB). Please select a smaller file.',
    )
  })
})

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
