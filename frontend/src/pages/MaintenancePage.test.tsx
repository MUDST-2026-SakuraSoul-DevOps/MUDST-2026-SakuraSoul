import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import MaintenancePage from './MaintenancePage'

/**
 * เทสแท็บ Maintenance Log ครอบ US-18 ในระดับหน้าจอ
 *
 * ตัวปุ่ม Export เองมีเทสของมันอยู่แล้วใน ExportLogButton.test.tsx ที่นี่จึงเน้น
 * ส่วนที่เทสนั้นครอบไม่ถึง คือหน้าจอต้องส่ง "รายการที่กรองแล้ว" ให้ปุ่ม ไม่ใช่
 * รายการทั้งหมด ซึ่งเป็นหัวใจของ US-18-S2 ถ้าต่อสายผิดปุ่มจะยัง export ได้ปกติ
 * แต่ไฟล์จะมีรายการที่ผู้ใช้กรองทิ้งไปแล้วปนมาด้วยโดยไม่มีใครเห็น
 */

async function openLogTab() {
  const user = userEvent.setup()
  render(<MaintenancePage />)
  await user.click(screen.getByRole('button', { name: 'Maintenance Log' }))
  await screen.findByRole('table')
  return user
}

function logRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

beforeEach(() => {
  resetMockStore()
})

describe('แท็บ Maintenance Log', () => {
  it('ดึงประวัติงานซ่อมจาก API มาแสดง ไม่ใช่ข้อมูลตัวอย่างในโค้ด', async () => {
    await openLogTab()

    expect(logRows()).toHaveLength(4)
    expect(screen.getByText('เปลี่ยนคอมเพรสเซอร์แอร์')).toBeInTheDocument()
    expect(screen.getByText('ก๊อกอ่างล้างหน้าหยด')).toBeInTheDocument()
  })

  it('มีปุ่ม Export Log อยู่ในแท็บนี้ตามที่ story ระบุ', async () => {
    await openLogTab()

    expect(screen.getByRole('button', { name: /Export Log/ })).toBeInTheDocument()
  })
})

describe('US-18-S2 กรองก่อน export', () => {
  it('กรองตามสถานะแล้วตารางเหลือเฉพาะรายการที่ตรง', async () => {
    const user = await openLogTab()

    await user.click(screen.getByRole('button', { name: 'In Progress' }))

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('เปลี่ยนคอมเพรสเซอร์แอร์')).toBeInTheDocument()
  })

  it('ค้นหาด้วยเลขห้องแล้วเหลือเฉพาะห้องนั้น', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('ค้นหาประวัติงานซ่อมบำรุง'), '201')

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('ก๊อกอ่างล้างหน้าหยด')).toBeInTheDocument()
  })

  it('กรองจนไม่เหลือรายการ แล้วกด Export ต้องไม่สร้างไฟล์เปล่า', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('ค้นหาประวัติงานซ่อมบำรุง'), 'ไม่มีงานซ่อมชื่อนี้')
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ยังไม่มีประวัติงานซ่อมให้ export')
  })
})

/**
 * เทสของแท็บ Tasks / Supplies / Schedule ตามดีไซน์รอบล่าสุดที่เพิ่มป็อปอัปเข้ามา
 *
 * สามแท็บนี้ยังไม่มี endpoint จริง ข้อมูลอยู่ใน state ของหน้า เทสจึงพิสูจน์แค่ว่า
 * ป็อปอัปต่อสายกับตารางถูกต้อง ซึ่งเป็นส่วนที่จะพังเงียบที่สุดตอนย้ายไปใช้ API
 * จริง ถ้าปุ่มเปิดป็อปอัปได้แต่บันทึกแล้วตารางไม่ขยับ จะไม่มีใครเห็นจนกดใช้เอง
 */

async function openTab(label: string) {
  const user = userEvent.setup()
  render(<MaintenancePage />)
  await user.click(screen.getByRole('button', { name: label }))
  return user
}

function taskRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

describe('แท็บ Maintenance Tasks', () => {
  it('สร้างงานใหม่แล้วขึ้นในตาราง และตัวเลขสรุปขยับตาม', async () => {
    const user = await openTab('Maintenance Tasks')

    expect(taskRows()).toHaveLength(3)
    const total = screen.getByRole('group', { name: 'จำนวนงานซ่อม Total Tasks' })
    expect(within(total).getByText('3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Window Latch Broken')
    await user.type(screen.getByLabelText('Unit Number'), '108')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(taskRows()).toHaveLength(4)
    expect(screen.getByText('Window Latch Broken')).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'จำนวนงานซ่อม Total Tasks' })).getByText('4'),
    ).toBeInTheDocument()
  })

  it('เลขห้องที่ไม่ใช่ตัวเลขสามหลักถูกปฏิเสธ ไม่ถูกเพิ่มเข้าตาราง', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Bad Unit')
    await user.type(screen.getByLabelText('Unit Number'), '9')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('สามหลัก')
    expect(screen.queryByText('Bad Unit')).not.toBeInTheDocument()
  })

  it('แก้งานเดิมแล้วแถวนั้นเปลี่ยน ไม่ได้เพิ่มแถวใหม่', async () => {
    const user = await openTab('Maintenance Tasks')

    await user.click(screen.getByRole('button', { name: 'แก้ไขงาน Leaking Faucet' }))
    const title = screen.getByLabelText('Task Title')
    await user.clear(title)
    await user.type(title, 'Leaking Faucet (urgent)')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(taskRows()).toHaveLength(3)
    expect(screen.getByText('Leaking Faucet (urgent)')).toBeInTheDocument()
    expect(screen.queryByText('Leaking Faucet')).not.toBeInTheDocument()
  })
})

describe('แท็บ Supplies & Inventory', () => {
  it('เพิ่มอุปกรณ์ใหม่แล้วได้ SKU อัตโนมัติ ไม่มีแถวที่ SKU ว่าง', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'New Supply Item' }))
    await user.type(screen.getByLabelText('Item Name'), 'Shower Head')
    await user.type(screen.getByLabelText('Category'), 'Plumbing')
    await user.click(screen.getByRole('button', { name: 'Add Supply' }))

    expect(screen.getByText('Shower Head')).toBeInTheDocument()
    expect(screen.getByText('SKU: PL-004')).toBeInTheDocument()
  })

  it('ของที่ต่ำกว่าขั้นต่ำขึ้น Low Stock ตามจำนวนจริง ไม่ใช่ค่าที่เก็บไว้', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'แก้ไขอะไหล่ LED Bulbs 60W' }))
    const quantity = screen.getByLabelText('Quantity')
    await user.clear(quantity)
    await user.type(quantity, '1')
    await user.click(screen.getByRole('button', { name: 'Edit Supply' }))

    const row = screen.getByText('LED Bulbs 60W').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Low Stock')).toBeInTheDocument()
  })
})

describe('แท็บ Schedule & Reminder', () => {
  it('ปฏิทินแสดงงานตามวันที่กำหนดไว้', async () => {
    await openTab('Schedule & Reminder')

    const wednesday = screen.getByLabelText('ตารางงานวัน Wed 16')
    expect(within(wednesday).getByText('Plumbing Check')).toBeInTheDocument()
    expect(within(screen.getByLabelText('ตารางงานวัน Thu 17')).queryByText('Plumbing Check')).toBeNull()
  })

  it('เพิ่มการแจ้งเตือนแล้วขึ้นการ์ดใหม่ในแถบ Recurring', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'Gutter Cleaning')
    await user.type(screen.getByLabelText('Start Date'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(screen.getByText('Gutter Cleaning')).toBeInTheDocument()
    expect(screen.getByText('Next: 2026-11-02')).toBeInTheDocument()
  })

  it('ไม่เลือกวันเริ่มแล้วบันทึกไม่ได้', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'No Start Date')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ต้องเลือกวันเริ่ม')
  })
})
