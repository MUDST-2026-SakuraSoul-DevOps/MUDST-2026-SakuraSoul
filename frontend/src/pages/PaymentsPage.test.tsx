import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import PaymentsPage from './PaymentsPage'

describe('PaymentsPage (SSK-106)', () => {
  it('แสดงรายการ Payment Management และการ์ดสถิติครบถ้วน', () => {
    render(<PaymentsPage />)

    expect(screen.getByText('Payment Management')).toBeInTheDocument()
    expect(screen.getByText('TOTAL REVENUE (YTD)')).toBeInTheDocument()
    expect(screen.getByText('PENDING COLLECTIONS')).toBeInTheDocument()
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })

  it('กดไอคอนแรกในคอลัมน์ Actions (Receipt) แล้วเปิด pop up Generate Receipt', () => {
    render(<PaymentsPage />)

    const viewReceiptBtn = screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' })
    fireEvent.click(viewReceiptBtn)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Generate Receipt' })).toBeInTheDocument()
    expect(within(dialog).getByText('Sakura Soul Apartment')).toBeInTheDocument()
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
  })

  it('กดปุ่ม Download ใน pop up Generate Receipt แล้วสั่งเปิดพิมพ์เป็น PDF (SSK-114)', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window)

    render(<PaymentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    const dialog = screen.getByRole('dialog')
    const downloadBtn = within(dialog).getByRole('button', { name: /^download/i })
    fireEvent.click(downloadBtn)

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('กดไอคอนที่สองในแถบ Action (Download) แล้วสั่งเปิดพิมพ์เป็น PDF ทันที (SSK-114)', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window)

    render(<PaymentsPage />)

    const downloadActionBtn = screen.getByRole('button', { name: 'Download invoice for Kenji Sato' })
    fireEvent.click(downloadActionBtn)

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('กดปุ่ม New Invoice ตรวจสอบช่องกรอกห้องเป็นตัวเลข 3 หลัก และสร้างบิลใหม่ได้', () => {
    render(<PaymentsPage />)

    // กดเปิด modal New Invoice
    fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))

    expect(screen.getByRole('heading', { name: 'Create Payment' })).toBeInTheDocument()
    expect(screen.getByText("Build this month's bill for one room")).toBeInTheDocument()
    expect(screen.getByText(/\*กรอกเลขห้องเป็นตัวเลขสามตัวเลข/i)).toBeInTheDocument()

    // เปลี่ยนเลขห้องเป็นตัวเลข 3 หลัก
    const roomInput = screen.getByLabelText(/Room/i)
    fireEvent.change(roomInput, { target: { value: '101' } })

    // เปลี่ยนค่าไฟฟ้าและค่าน้ำ
    const electricInput = screen.getByLabelText(/Electric usage/i)
    fireEvent.change(electricInput, { target: { value: '150' } })

    const waterInput = screen.getByLabelText(/Water usage/i)
    fireEvent.change(waterInput, { target: { value: '20' } })

    // กด Create Bill
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    // modal ปิด และมีรายการใหม่ในตาราง
    expect(screen.queryByRole('heading', { name: 'Create Payment' })).not.toBeInTheDocument()
    expect(screen.getByText('Somchai P.')).toBeInTheDocument()
  })

  it('เมื่อสร้างบิลใหม่ ข้อมูลใน Receipt modal และ PDF จะอัปเดตตามข้อมูลที่กรอกในฟอร์ม (SSK-114)', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as unknown as Window)

    render(<PaymentsPage />)

    // กดเปิด modal New Invoice
    fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))

    // กรอกค่าต่าง ๆ ตามหน้า Create Payment
    const roomInput = screen.getByLabelText(/Room/i)
    fireEvent.change(roomInput, { target: { value: '101' } })

    const electricInput = screen.getByLabelText(/Electric usage/i)
    fireEvent.change(electricInput, { target: { value: '120' } })

    const waterInput = screen.getByLabelText(/Water usage/i)
    fireEvent.change(waterInput, { target: { value: '33' } })

    // กด Create Bill
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    // เปิด Receipt ของ Somchai P.
    const viewReceiptBtn = screen.getByRole('button', { name: 'View receipt for Somchai P.' })
    fireEvent.click(viewReceiptBtn)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('33 units')).toBeInTheDocument()
    expect(within(dialog).getByText('120 units')).toBeInTheDocument()
    expect(within(dialog).getByText('¥60,800')).toBeInTheDocument()

    // กดปุ่ม Download (PDF)
    const downloadBtn = within(dialog).getByRole('button', { name: /^download/i })
    fireEvent.click(downloadBtn)

    expect(openSpy).toHaveBeenCalled()
    openSpy.mockRestore()
  })


  it('สามารถกรองสถานะด้วยปุ่ม All Status, Paid, Pending ได้', () => {
    render(<PaymentsPage />)

    // เริ่มต้นแสดงทั้งหมด
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()

    // กรองเฉพาะ Paid
    fireEvent.click(screen.getByRole('button', { name: 'Paid' }))
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()

    // กรองเฉพาะ Pending
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })
})

