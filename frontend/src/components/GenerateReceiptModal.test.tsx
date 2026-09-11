import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GenerateReceiptModal } from './GenerateReceiptModal'
import * as downloadModule from '../lib/downloadFile'

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

  it('กดปุ่ม Download ใน modal แล้วเรียก downloadTextFile', () => {
    const downloadSpy = vi.spyOn(downloadModule, 'downloadTextFile').mockImplementation(() => {})
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))

    const downloadBtn = screen.getByRole('button', { name: /^download$/i })
    expect(downloadBtn).not.toBeDisabled()
    fireEvent.click(downloadBtn)

    expect(downloadSpy).toHaveBeenCalled()
    downloadSpy.mockRestore()
  })

  it('ปิด modal ด้วยปุ่ม Esc ได้', () => {
    render(<GenerateReceiptModal />)
    fireEvent.click(screen.getByLabelText('View invoice'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
