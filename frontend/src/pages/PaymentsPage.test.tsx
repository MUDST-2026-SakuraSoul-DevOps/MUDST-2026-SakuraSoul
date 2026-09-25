import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import PaymentsPage from './PaymentsPage'
import * as downloadModule from '../lib/downloadFile'

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

  it('กดปุ่ม Download ใน pop up Generate Receipt แล้วสั่งดาวน์โหลดไฟล์รูปภาพ PNG', () => {
    const downloadSpy = vi.spyOn(downloadModule, 'downloadDataUrl').mockImplementation(() => {})
    render(<PaymentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    const dialog = screen.getByRole('dialog')
    const downloadBtn = within(dialog).getByRole('button', { name: /^download/i })
    fireEvent.click(downloadBtn)

    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^RC-.*\.png$/),
      expect.stringMatching(/^data:image\/png;/),
    )
    downloadSpy.mockRestore()
  })


  it('ไม่มีปุ่ม Download รายแถวในคอลัมน์ Actions อีกต่อไป (ย้ายไปอยู่ใน receipt modal แล้ว)', () => {
    render(<PaymentsPage />)
    expect(screen.queryByRole('button', { name: /Download invoice for/i })).not.toBeInTheDocument()
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

  it('ไม่มีปุ่ม Send invoice แยกเป็นรายแถวในคอลัมน์ Actions (SSK-130)', () => {
    render(<PaymentsPage />)
    expect(screen.queryByRole('button', { name: /Send invoice for/i })).not.toBeInTheDocument()
  })

  it('สามารถเลือก checkbox ทีละรายการ หรือกด Select All เพื่อส่ง Invoice เป็นกลุ่มได้ (SSK-130)', async () => {
    render(<PaymentsPage />)

    const selectAllCheckbox = screen.getByLabelText('Select all invoices')
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /Select invoice for/i })

    expect(selectAllCheckbox).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Send All Invoices/i })).toBeInTheDocument()

    // ติ๊กเลือกรายการแรก
    fireEvent.click(rowCheckboxes[0])
    expect(rowCheckboxes[0]).toBeChecked()
    expect(screen.getByRole('button', { name: /Send Invoices \(1\)/i })).toBeInTheDocument()

    // กด Select all
    fireEvent.click(selectAllCheckbox)
    rowCheckboxes.forEach((cb) => expect(cb).toBeChecked())
    expect(screen.getByRole('button', { name: new RegExp(`Send Invoices \\(${rowCheckboxes.length}\\)`, 'i') })).toBeInTheDocument()

    // กดปุ่มส่ง Invoice เป็นกลุ่มเพื่อเปิด dialog
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Send Invoices \\(${rowCheckboxes.length}\\)`, 'i') }))
    const bulkDialog = screen.getByRole('dialog', { name: 'Send Invoices' })
    expect(bulkDialog).toBeInTheDocument()
    expect(within(bulkDialog).getByText(/Send Invoices to Tenants/i)).toBeInTheDocument()

    // กด Send Invoices Now
    fireEvent.click(within(bulkDialog).getByRole('button', { name: /Send .* Invoices Now/i }))
    expect(await within(bulkDialog).findByText(/Sent Successfully!/i)).toBeInTheDocument()

    // ปิด dialog
    fireEvent.click(within(bulkDialog).getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByRole('dialog', { name: 'Send Invoices' })).not.toBeInTheDocument()
  })

  it('สามารถเปิด dialog ตั้งเวลาส่ง Invoice อัตโนมัติและบันทึกการตั้งค่าได้ (SSK-130)', async () => {
    render(<PaymentsPage />)

    // กดปุ่ม Schedule Auto-Billing
    fireEvent.click(screen.getByRole('button', { name: /Schedule Auto-Billing/i }))

    const scheduleDialog = screen.getByRole('dialog', { name: 'Scheduled Bulk Billing' })
    expect(scheduleDialog).toBeInTheDocument()
    expect(within(scheduleDialog).getByText('Scheduled Bulk Billing')).toBeInTheDocument()

    // บันทึกการตั้งค่า
    fireEvent.click(within(scheduleDialog).getByRole('button', { name: /Save Schedule/i }))
    expect(await within(scheduleDialog).findByText(/Saved!/i)).toBeInTheDocument()
  })
})

