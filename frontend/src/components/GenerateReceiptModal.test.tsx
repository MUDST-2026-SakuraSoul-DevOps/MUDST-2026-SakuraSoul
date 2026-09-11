import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GenerateReceiptModal } from './GenerateReceiptModal'

/**
 * เทสตาม QA review (SSK-16) ข้อ #1 และ #9: คุมยอดรวมให้บวกจาก items เสมอ
 * กันไม่ให้กลับไปเป็นค่าคงที่พิมพ์มือแบบเดิมอีก (ครั้งก่อนต่างไป 2,300 บาท)
 */
describe('GenerateReceiptModal', () => {
  it('ยอดรวมที่แสดงต้องเท่ากับผลบวกของยอดแต่ละรายการ ไม่ใช่ค่าคงที่พิมพ์มือ', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const lineItemAmounts = screen
      .getAllByTestId('receipt-item-amount')
      .map((el) => Number((el.textContent ?? '').replace(/[¥,]/g, '')))
    const totalShown = Number(
      (screen.getByTestId('receipt-total-amount').textContent ?? '').replace(/[¥,]/g, ''),
    )

    expect(totalShown).toBe(lineItemAmounts.reduce((sum, n) => sum + n, 0))
  })

  it('ปุ่ม Download ต้อง disabled ไว้ก่อนจนกว่าจะมี endpoint จริง (กันเข้าใจผิดว่ากดแล้วได้ไฟล์)', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()
  })

  it('ปิด modal ด้วยปุ่ม Esc ได้', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
