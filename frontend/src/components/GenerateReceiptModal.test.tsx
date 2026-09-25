import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { GenerateReceiptModal } from './GenerateReceiptModal'
import { receiptTotal, SAMPLE_RECEIPT, utilityCharge, type ReceiptData } from '../domain/receipt'

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
})
