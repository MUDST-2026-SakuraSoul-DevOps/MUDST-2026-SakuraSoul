import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import QRCode from 'qrcode'
import { GenerateReceiptModal } from './GenerateReceiptModal'
import type { Receipt, ReceiptBankAccount, ReceiptPayment } from '../api/types'
import { toReceiptData } from '../domain/billing'
import { canRecordPayment, invoiceBalances } from '../domain/paymentLedger'
import { generatePromptPayPayload } from '../domain/paymentPhase2'
import { receiptTotal, SAMPLE_RECEIPT, utilityCharge, type ReceiptData } from '../domain/receipt'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GenerateReceiptModal', () => {
  it('shows the supplied receipt details instead of sample data', () => {
    const receipt: ReceiptData = {
      ...SAMPLE_RECEIPT,
      receiptNo: 'RC-TEST-112',
      tenant: 'Ada Tester',
      unit: '112',
      billingMonth: 'September 2026',
      items: [{ id: 'rent', item: 'Room rent', amount: 3500 }],
      totalAmount: 3500,
      status: 'Pending',
      paidDate: undefined,
    }

    render(<GenerateReceiptModal receipt={receipt} isOpen onClose={vi.fn()} trigger={false} />)
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText('Receipt no.').nextElementSibling).toHaveTextContent('RC-TEST-112')
    expect(within(dialog).getByText('Tenant').nextElementSibling).toHaveTextContent('Ada Tester')
    expect(within(dialog).getByText('Unit').nextElementSibling).toHaveTextContent('112')
    expect(within(dialog).getByText('Billing month').nextElementSibling).toHaveTextContent('September 2026')
    expect(within(dialog).getByText('Room rent')).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('Somchai P.')
  })

  /*
    SSK-128 เทสเดิมเอายอดของแต่ละรายการที่หน้าจอแสดงมาบวกกัน แล้วเทียบกับยอดรวมที่หน้าจอ
    แสดงเอง (tautology) ถ้าสูตรผิดทั้งคู่ก็ยังผ่าน และใบเสร็จตั้งต้นก็คำนวณยอดรวมจาก
    รายการของตัวเองอยู่แล้ว เทสจึงไม่เคยตรวจอะไรเลย
    ตอนนี้ส่งใบเสร็จที่รู้ค่าเข้าไป แล้วเทียบทุกตัวเลขกับค่าที่คิดด้วยมือ
  */
  it('แสดงยอดของทุกรายการและยอดรวมตรงกับตัวเลขที่คิดด้วยมือ', () => {
    const receipt: ReceiptData = {
      ...SAMPLE_RECEIPT,
      items: [
        { id: 'room-rent', item: 'Room rent', amount: 3500 },
        { id: 'electricity', item: 'Electricity', usageValue: 120, usageUnit: 'units', rate: 8, amount: utilityCharge(120, 8) },
        { id: 'water', item: 'Water', usageValue: 10, usageUnit: 'units', rate: 18, amount: utilityCharge(10, 18) },
      ],
      totalAmount: 0,
    }
    receipt.totalAmount = receiptTotal(receipt.items)

    render(<GenerateReceiptModal receipt={receipt} />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    // 3,500 / 120 × 8 = 960 / 10 × 18 = 180 / รวม 4,640
    expect(screen.getAllByTestId('receipt-item-amount').map((el) => el.textContent)).toEqual([
      '฿3,500.00',
      '฿960.00',
      '฿180.00',
    ])
    expect(screen.getByTestId('receipt-total-amount')).toHaveTextContent('฿4,640.00')
  })

  it('ใบเสร็จตั้งต้นแสดงยอดรวม ฿59,000.00 (45,000 + 6,000 + 1,500 + 3,000 + 3,500)', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    expect(screen.getByTestId('receipt-total-amount')).toHaveTextContent('฿59,000.00')
  })

  it('กดปุ่ม Print ใน modal แล้วเปิดหน้าพิมพ์เอกสารสำหรับสั่งพิมพ์', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window)

    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const printBtn = screen.getByRole('button', { name: /print/i })
    expect(printBtn).not.toBeDisabled()
    fireEvent.click(printBtn)

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('กดปุ่ม Download (PDF) ใน modal แล้วสั่งดาวน์โหลดไฟล์ PDF เข้าเครื่องโดยตรง (SSK-114)', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const downloadBtn = screen.getByRole('button', { name: /^download/i })
    expect(downloadBtn).not.toBeDisabled()
    fireEvent.click(downloadBtn)

    expect(createObjectURLSpy).toHaveBeenCalled()

    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })

  it('ปิด modal ด้วยปุ่ม Esc ได้', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows carriedToReceiptNo notice and suppresses QR and payment button', () => {
    const carriedReceipt: ReceiptData = {
      ...SAMPLE_RECEIPT,
      status: 'Pending',
      carriedToReceiptNo: 'RC-2026-0099',
      bank: {
        bankName: 'SCB',
        accountName: 'Sakura Co.',
        accountNumber: '111-2-33333-4',
        promptPayId: '0812345678',
      },
      promptPayPayload: '000201010212...',
    }

    render(
      <GenerateReceiptModal
        receipt={carriedReceipt}
        isOpen
        onClose={vi.fn()}
        onOpenRecordPayment={vi.fn()}
        trigger={false}
      />,
    )

    expect(screen.getByText(/This invoice was carried forward to RC-2026-0099/i)).toBeInTheDocument()
    expect(screen.getByText(/Balance carried to RC-2026-0099/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Record payment/i })).not.toBeInTheDocument()
    expect(screen.queryByAltText(/PromptPay QR/i)).not.toBeInTheDocument()
  })

  it('shows the bank snapshot, opens Record payment and reports a failed Mark as Paid', async () => {
    const onMarkPaid = vi.fn().mockRejectedValue(new Error('Backend rejected payment'))
    const onOpenRecordPayment = vi.fn()
    const unpaidWithBank: ReceiptData = {
      ...SAMPLE_RECEIPT,
      status: 'Pending',
      paidDate: undefined,
      bank: {
        bankName: 'Bangkok Bank',
        accountName: 'Sakura Residence',
        accountNumber: '555-6-77777-8',
        promptPayId: '0898765432',
      },
      promptPayPayload: '00020101021229370016A000000677010111011300668987654325802TH530376454073500.006304ABCD',
    }

    render(
      <GenerateReceiptModal
        receipt={unpaidWithBank}
        isOpen
        onClose={vi.fn()}
        onMarkPaid={onMarkPaid}
        onOpenRecordPayment={onOpenRecordPayment}
        trigger={false}
      />,
    )

    expect(screen.getByText(/Bangkok Bank · 555-6-77777-8/i)).toBeInTheDocument()
    expect(screen.getByText(/Scan PromptPay QR code/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Record payment/i }))
    expect(onOpenRecordPayment).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Mark as Paid/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not record the payment'))
  })

  it('shows the bank snapshot but draws no QR when the server sent no PromptPay payload, and Close calls onClose', async () => {
    const toDataURL = vi.spyOn(QRCode, 'toDataURL')
    const onClose = vi.fn()
    render(
      <GenerateReceiptModal
        receipt={{
          ...SAMPLE_RECEIPT,
          status: 'Pending',
          bank: {
            bankName: 'SCB',
            accountName: 'Sakura Soul',
            accountNumber: '111-2-33333-4',
            promptPayId: '0812345678',
          },
          promptPayPayload: undefined,
        }}
        isOpen
        onClose={onClose}
        trigger={false}
      />,
    )

    await waitFor(() => expect(screen.getByText(/SCB · 111-2-33333-4/i)).toBeInTheDocument())
    // ไม่มี payload ก็ไม่วาด QR เอาเองจาก PromptPay ID ในสำเนาบัญชี
    expect(toDataURL).not.toHaveBeenCalled()
    expect(screen.queryByRole('img', { name: 'PromptPay QR' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

/*
  ใบเสร็จในชุดนี้หน้าตาเหมือนที่ GET /api/receipts ตอบจริง แล้วเปิดป็อปอัปแบบเดียวกับ PaymentsPage
  (toReceiptData + invoiceBalances ส่วนปุ่มรับเงินส่งให้เฉพาะใบที่ canRecordPayment) ไม่ประกอบสถานะที่ backend ไม่มีวันส่ง

  RC-2026-0021 ห้อง 305 เดือน ต.ค. 2026: 3,500 + 300 + 250 + 60×8 (480) + 6×18 (108) = 4,638
  จ่ายเงินสดไปแล้ว 1,500 เหลือ 4,638 − 1,500 = 3,138
  payload ของ QR ทำแบบเดียวกับ backend คือจาก PromptPay ID ของสำเนาบัญชีกับยอด balanceDue ณ ตอนนั้น
*/
describe('GenerateReceiptModal with a receipt from /api/receipts', () => {
  const bank: ReceiptBankAccount = {
    bankName: 'Kasikornbank',
    accountName: 'Sakura Soul Apartment',
    accountNumber: '012-3-45678-9',
    promptPayId: '0812345678',
  }
  const cashPayment: ReceiptPayment = {
    id: 31,
    amount: 1500,
    paidOn: '2026-11-10',
    method: 'CASH',
    reference: null,
    note: null,
    recordedAt: '2026-11-10T03:00:00Z',
    voidedAt: null,
  }

  function apiReceipt(overrides: Partial<Receipt> = {}): Receipt {
    return {
      id: 21,
      receiptNo: 'RC-2026-0021',
      leaseId: 4,
      roomNumber: '305',
      tenantName: 'Mai Suzuki',
      tenantEmail: null,
      billingMonth: '2026-10',
      issuedAt: '2026-11-01T02:00:00Z',
      dueDate: '2026-11-20',
      status: 'PENDING',
      items: [
        { item: 'Room rent', detail: null, usageValue: null, usageUnit: null, rate: null, amount: 3500 },
        { item: 'Common area fee', detail: null, usageValue: null, usageUnit: null, rate: null, amount: 300 },
        { item: 'Internet', detail: null, usageValue: null, usageUnit: null, rate: null, amount: 250 },
        { item: 'Electricity', detail: null, usageValue: 60, usageUnit: 'units', rate: 8, amount: 480 },
        { item: 'Water', detail: null, usageValue: 6, usageUnit: 'units', rate: 18, amount: 108 },
      ],
      totalAmount: 4638,
      paidAt: null,
      paymentMethod: null,
      lastSentAt: null,
      sentCount: 0,
      latest: true,
      previousBalance: 0,
      interestAmount: 0,
      paidAmount: 0,
      settledAmount: 0,
      balanceDue: 4638,
      outstandingAmount: 4638,
      overdue: false,
      carriedToReceiptNo: null,
      paidOn: null,
      payments: [],
      bank,
      promptPayPayload: generatePromptPayPayload('0812345678', 4638),
      ...overrides,
    }
  }

  /** ต่อสายแบบเดียวกับ <GenerateReceiptModal> ใน PaymentsPage */
  function openLikePaymentsPage(receipt: Receipt) {
    const onClose = vi.fn()
    const onMarkPaid = vi.fn().mockResolvedValue(undefined)
    const onOpenRecordPayment = vi.fn()
    const payable = canRecordPayment(receipt)
    render(
      <GenerateReceiptModal
        receipt={toReceiptData(receipt)}
        receiptId={receipt.id}
        isOpen
        onClose={onClose}
        onMarkPaid={payable ? onMarkPaid : undefined}
        onOpenRecordPayment={payable ? onOpenRecordPayment : undefined}
        balances={invoiceBalances(receipt)}
        trigger={false}
      />,
    )
    return { dialog: screen.getByRole('dialog'), onClose, onMarkPaid, onOpenRecordPayment }
  }

  it('draws the PromptPay QR from the exact payload the server sent for the latest unpaid bill', async () => {
    const receipt = apiReceipt()
    const { dialog } = openLikePaymentsPage(receipt)

    const qr = await within(dialog).findByRole('img', { name: 'PromptPay QR' })
    // รูปต้องเป็น QR ของข้อความที่ server ส่งมาเป๊ะ (ยอด 4,638.00 ของใบนี้) ไม่ใช่ข้อความที่หน้าเว็บประกอบเอง
    expect(qr).toHaveAttribute('src', await QRCode.toDataURL(receipt.promptPayPayload!, { width: 280, margin: 1 }))
    expect(within(dialog).getByText('Kasikornbank · 012-3-45678-9')).toBeInTheDocument()
    expect(within(dialog).getByText('Sakura Soul Apartment · Reference: RC-2026-0021')).toBeInTheDocument()
    expect(within(dialog).getByText('0812345678').parentElement).toHaveTextContent('PromptPay ID: 0812345678')
    expect(within(dialog).getByText('Total amount')).toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿4,638.00')
    expect(within(dialog).getByText('Pending')).toBeInTheDocument()
    expect(within(dialog).getByText('Unpaid')).toBeInTheDocument()
    expect(within(dialog).queryByText('Paid in full')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Record payment' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Mark as Paid' })).toBeInTheDocument()
  })

  it('asks only for what is left on a bill paid in part, in the total, the QR and the status line', async () => {
    const receipt = apiReceipt({
      status: 'PARTIAL',
      paidAmount: 1500,
      settledAmount: 1500,
      balanceDue: 3138,
      outstandingAmount: 3138,
      payments: [cashPayment],
      promptPayPayload: generatePromptPayPayload('0812345678', 3138),
    })
    const { dialog } = openLikePaymentsPage(receipt)

    // QR ของยอดที่เหลือ 3,138 ไม่ใช่ยอดเต็มของใบ ไม่งั้นผู้เช่าสแกนแล้วจ่ายเกิน
    const qr = await within(dialog).findByRole('img', { name: 'PromptPay QR' })
    expect(qr).toHaveAttribute('src', await QRCode.toDataURL(receipt.promptPayPayload!, { width: 280, margin: 1 }))
    expect(within(dialog).getByText('Current month charges').nextElementSibling).toHaveTextContent('฿4,638.00')
    expect(within(dialog).getByText('Payments received').nextElementSibling).toHaveTextContent('− ฿1,500.00')
    expect(within(dialog).getByText('Remaining balance').nextElementSibling).toHaveTextContent('฿3,138.00')
    expect(within(dialog).getByText('Remaining balance to pay')).toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿3,138.00')
    expect(within(dialog).getByText('Partially paid · Remaining due: 3,138.00')).toBeInTheDocument()
    expect(within(dialog).getByText('Amount to scan & pay: 3,138.00')).toBeInTheDocument()
    expect(within(dialog).getByText('Partially paid')).toBeInTheDocument()
    expect(within(dialog).getByText('Remaining: 3,138.00')).toBeInTheDocument()
    expect(within(dialog).queryByText('Total amount')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Unpaid')).not.toBeInTheDocument()
  })

  it('labels a bill paid in part and now past due as Overdue, like the table, and still asks only for the rest', () => {
    // ครบกำหนด 5 พ.ย. วันนี้ 13 พ.ย. ยังเหลือ 3,138 backend จึงส่ง overdue: true มากับใบล่าสุด (SSK-16)
    const receipt = apiReceipt({
      dueDate: '2026-11-05',
      overdue: true,
      status: 'PARTIAL',
      paidAmount: 1500,
      settledAmount: 1500,
      balanceDue: 3138,
      outstandingAmount: 3138,
      payments: [cashPayment],
      promptPayPayload: generatePromptPayPayload('0812345678', 3138),
    })
    const { dialog } = openLikePaymentsPage(receipt)

    expect(within(dialog).getByText('Overdue')).toBeInTheDocument()
    expect(within(dialog).queryByText('Partially paid')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Remaining balance to pay')).toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿3,138.00')
    expect(within(dialog).getByText('Partially paid · Remaining due: 3,138.00')).toBeInTheDocument()
    expect(within(dialog).getByText('Remaining: 3,138.00')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Record payment' })).toBeInTheDocument()
  })

  it('shows a fully paid bill as settled, with its payment date and method and no QR or payment actions', async () => {
    const toDataURL = vi.spyOn(QRCode, 'toDataURL')
    const receipt = apiReceipt({
      status: 'PAID',
      paidAmount: 4638,
      settledAmount: 4638,
      balanceDue: 0,
      outstandingAmount: 0,
      paidAt: '2026-11-10T06:00:00Z',
      paymentMethod: 'Bank transfer',
      paidOn: '2026-11-10',
      payments: [{ ...cashPayment, id: 32, amount: 4638, method: 'TRANSFER' }],
      promptPayPayload: null,
    })
    const { dialog } = openLikePaymentsPage(receipt)

    expect(within(dialog).getByText('Paid in full · ฿0.00 remaining')).toBeInTheDocument()
    // ป้ายข้างยอดรวม กับช่องที่ปกติเป็น QR
    expect(within(dialog).getAllByText('Paid in full')).toHaveLength(2)
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿4,638.00')
    expect(within(dialog).getByText('Payments received').nextElementSibling).toHaveTextContent('− ฿4,638.00')
    expect(within(dialog).getByText('Remaining balance').nextElementSibling).toHaveTextContent('฿0.00')
    expect(within(dialog).getByText('Paid')).toBeInTheDocument()
    expect(within(dialog).getByText('10 Nov 2026 · Bank transfer')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Mark as Paid' })).not.toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getAllByText('Paid in full')).toHaveLength(2))
    expect(toDataURL).not.toHaveBeenCalled()
    expect(within(dialog).queryByRole('img', { name: 'PromptPay QR' })).not.toBeInTheDocument()
  })

  it('tells the admin to set a PromptPay ID when the bill was issued with a bank account but no PromptPay', async () => {
    const toDataURL = vi.spyOn(QRCode, 'toDataURL')
    const receipt = apiReceipt({ bank: { ...bank, promptPayId: null }, promptPayPayload: null })
    const { dialog, onOpenRecordPayment } = openLikePaymentsPage(receipt)

    expect(within(dialog).getByText('PromptPay QR not configured')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Please configure PromptPay ID in Billing Settings to generate QR code.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Kasikornbank · 012-3-45678-9')).toBeInTheDocument()
    expect(within(dialog).queryByText(/PromptPay ID:/)).not.toBeInTheDocument()
    // ไม่มี QR ก็ยังรับเงินสดหรือโอนได้ ปุ่มบันทึกการชำระจึงยังอยู่
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(onOpenRecordPayment).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(within(dialog).getByText('Unpaid')).toBeInTheDocument())
    expect(toDataURL).not.toHaveBeenCalled()
    expect(within(dialog).queryByRole('img', { name: 'PromptPay QR' })).not.toBeInTheDocument()
  })

  it('sends the tenant to the newer bill when this bill was carried forward, without calling it paid', async () => {
    const toDataURL = vi.spyOn(QRCode, 'toDataURL')
    // ใบเดือน ก.ย. ที่ยังไม่ได้จ่าย ยอดถูกยกไปรวมในใบ ต.ค. แล้ว ใบนี้จึงไม่ใช่ใบล่าสุดและ balanceDue เป็น null
    const receipt = apiReceipt({
      id: 20,
      receiptNo: 'RC-2026-0020',
      billingMonth: '2026-09',
      dueDate: '2026-10-05',
      latest: false,
      balanceDue: null,
      carriedToReceiptNo: 'RC-2026-0021',
      promptPayPayload: null,
    })
    const { dialog } = openLikePaymentsPage(receipt)

    expect(
      within(dialog).getByText(
        'This invoice was carried forward to RC-2026-0021. Payment must be made on the latest bill.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Carried forward')).toBeInTheDocument()
    expect(within(dialog).getByText('Balance carried to RC-2026-0021')).toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿4,638.00')
    // ยอดของใบนี้ยังค้างอยู่ (ย้ายไปจ่ายที่ใบใหม่) ห้ามขึ้นว่าจ่ายครบ
    expect(within(dialog).getByText('Unpaid')).toBeInTheDocument()
    expect(within(dialog).queryByText('Paid in full')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Mark as Paid' })).not.toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByText('Carried forward')).toBeInTheDocument())
    expect(toDataURL).not.toHaveBeenCalled()
  })

  it('does not open itself from the trigger button while the parent controls it', () => {
    const onClose = vi.fn()
    render(<GenerateReceiptModal receipt={toReceiptData(apiReceipt())} isOpen={false} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'View invoice' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
