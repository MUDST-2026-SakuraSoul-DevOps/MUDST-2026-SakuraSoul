import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReceiptData } from '../domain/receipt'
import { GenerateReceiptModal } from './GenerateReceiptModal'

/**
 * SSK-16 ตอนต่อ backend จริง ปุ่ม Download ต้องเป็นลิงก์ไปที่ PDF ของ backend (ฟอนต์ไทยครบ)
 * เทสทั้งชุดรันในโหมด backend จำลอง จึงปิดธงนั้นเฉพาะไฟล์นี้ ทางของโหมด mock เทสอยู่ใน PaymentsPage.test.tsx
 */
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, API_MOCK_ENABLED: false }
})

const receipt: ReceiptData = {
  receiptNo: 'RC-2026-0002',
  tenant: 'ปิยะดา แสงทอง',
  unit: '102',
  billingMonth: 'August 2026',
  dueDate: '18 Sep 2026',
  items: [{ id: 'Room rent', item: 'Room rent', amount: 3500 }],
  totalAmount: 3500,
  status: 'Overdue',
}

describe('GenerateReceiptModal on the real backend', () => {
  it('links Download to the backend PDF of that receipt', () => {
    render(<GenerateReceiptModal receipt={receipt} receiptId={2} isOpen onClose={() => {}} trigger={false} />)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: /^download/i })).toHaveAttribute('href', '/api/receipts/2/pdf')
  })

  it('still builds the PDF in the browser for a receipt that has no id yet', () => {
    render(<GenerateReceiptModal receipt={receipt} isOpen onClose={() => {}} trigger={false} />)

    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /^download/i })).toBeInTheDocument()
  })
})
