import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GenerateReceiptModal } from './GenerateReceiptModal'

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

  it('กดปุ่ม Download (PDF) ใน modal แล้วเปิดหน้าพิมพ์เพื่อบันทึกเป็น PDF ในรูปแบบมาตรฐาน (SSK-114)', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window)

    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const downloadBtn = screen.getByRole('button', { name: /^download/i })
    expect(downloadBtn).not.toBeDisabled()
    fireEvent.click(downloadBtn)

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })


  it('ปิด modal ด้วยปุ่ม Esc ได้', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

