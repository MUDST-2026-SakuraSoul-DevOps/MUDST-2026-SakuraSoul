import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import MaintenancePage from './MaintenancePage'
import { workWeekOf } from '../domain/maintenanceBoard'
import { displayDate, todayInBangkok } from '../format'
import * as downloadModule from '../lib/downloadFile'

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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('แท็บ Maintenance Log', () => {
  it('ดึงประวัติงานซ่อมจาก API มาแสดง ไม่ใช่ข้อมูลตัวอย่างในโค้ด', async () => {
    await openLogTab()

    expect(logRows()).toHaveLength(4)
    expect(screen.getByText('AC compressor replacement')).toBeInTheDocument()
    expect(screen.getByText('Bathroom tap dripping')).toBeInTheDocument()
  })

  /*
    US-18 ยังอยู่ ทีมยืนยันว่าแอดมินต้อง export ประวัติงานซ่อมออกเป็นไฟล์
    ไปทำรายงานหรือส่งต่อให้คนอื่นได้ ส่วนปุ่ม Create Log ไม่เอา
  */
  it('มีปุ่ม Export Log ตาม US-18 แต่ไม่มี Create Log', async () => {
    await openLogTab()

    expect(screen.getByRole('button', { name: /Export Log/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Log/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search the maintenance log')).toBeInTheDocument()
  })

  /*
    US-18-S2 ไฟล์ต้องมีเฉพาะรายการที่ค้นหาเห็นอยู่ ถ้าต่อสายผิด ปุ่มจะยัง
    export ได้ปกติแต่ไฟล์จะมีรายการที่ผู้ใช้กรองทิ้งไปแล้วปนมาโดยไม่มีใครเห็น
  */
  it('ค้นหาจนไม่เหลือรายการ แล้วกด Export ต้องไม่สร้างไฟล์เปล่า', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), 'no such task name')
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no maintenance history to export',
    )
  })

  it('exports only the maintenance rows that match the page search', async () => {
    const download = vi.spyOn(downloadModule, 'downloadTextFile').mockImplementation(() => {})
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), '201')
    expect(logRows()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(download).toHaveBeenCalledOnce()
    const [filename, csv, mimeType] = download.mock.calls[0]
    expect(filename).toMatch(/^maintenance-log-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(mimeType).toBe('text/csv;charset=utf-8')
    expect(csv.replace('﻿', '').split('\r\n')).toHaveLength(2)
    expect(csv).toContain('Bathroom tap dripping')
    expect(csv).toContain('201')
    expect(csv).not.toContain('AC compressor replacement')
  })

  it('การ์ดสรุปสี่ใบคำนวณจากใบแจ้งจริง', async () => {
    await openLogTab()

    expect(within(screen.getByRole('group', { name: 'Total Logs tasks' })).getByText('4')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Completed tasks' })).getByText('0')).toBeInTheDocument()
  })

  /**
   * US-13 ระบุว่าประวัติต้องเรียงจากวันที่ล่าสุดไปเก่าสุด mock เรียงไว้แล้วที่
   * GET /api/maintenance (mockApi.ts) แต่ก่อนหน้านี้ไม่มีเทสคุมจุดนี้เลย
   * QA ทักไว้ว่าถ้าใครเผลอเปลี่ยนลำดับใน mock หรือพอต่อ backend จริงแล้ว
   * endpoint ไม่ได้เรียงมาให้ จะไม่มีอะไรจับได้
   */
  it('เรียงรายการจากวันที่แจ้งล่าสุดไปเก่าสุด ตาม US-13', async () => {
    await openLogTab()

    const titles = logRows().map((row) => within(row).getAllByRole('cell')[0].textContent)
    expect(titles).toEqual([
      expect.stringContaining('Scheduled AC cleaning'),
      expect.stringContaining('Bathroom drain pipe leaking'),
      expect.stringContaining('Bathroom tap dripping'),
      expect.stringContaining('AC compressor replacement'),
    ])
  })
})

describe('ค้นหาในแท็บ Maintenance Log', () => {
  it('ค้นหาด้วยเลขห้องแล้วเหลือเฉพาะห้องนั้น', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), '201')

    const rows = logRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Bathroom tap dripping')).toBeInTheDocument()
  })

  it('ค้นหาจนไม่เหลือรายการ ต้องบอกผู้ใช้ ไม่ใช่ปล่อยตารางว่าง', async () => {
    const user = await openLogTab()

    await user.type(screen.getByLabelText('Search the maintenance log'), 'no such task name')

    expect(await screen.findByText('Nothing matches your filter')).toBeInTheDocument()
  })
})

/**
 * เทสของแท็บ Tasks / Supplies / Schedule ตามดีไซน์รอบล่าสุดที่เพิ่มป็อปอัปเข้ามา
 *
 * แท็บ Tasks ต่อ API แล้ว (SSK-131) เทสจึงวิ่งผ่าน backend จำลองใน mockApi.ts ใช้ใบตัวอย่าง
 * สี่ใบชุดเดียวกับ DevDataSeeder ฝั่ง backend ตารางไม่มี state ของตัวเองแล้ว สิ่งที่เห็นหลัง
 * บันทึกจึงมาจาก API เท่านั้น ถ้าบันทึกไม่ถึง backend เทสจะไม่เห็นแถวใหม่
 *
 * ส่วน Supplies กับ Schedule ยังเก็บข้อมูลใน state ของหน้า เทสของสองแท็บนั้นพิสูจน์แค่ว่า
 * ป็อปอัปต่อสายกับตารางถูกต้อง ซึ่งเป็นส่วนที่จะพังเงียบที่สุดตอนย้ายไปใช้ API จริง
 */

async function openTab(label: string) {
  const user = userEvent.setup()
  render(<MaintenancePage />)
  await user.click(screen.getByRole('button', { name: label }))
  return user
}

/** แท็บ Tasks โหลดใบแจ้งซ่อมจาก API ต้องรอให้ตารางขึ้นก่อน */
async function openTasksTab() {
  const user = await openTab('Maintenance Tasks')
  await screen.findByRole('table')
  return user
}

/** ช่อง Unit Number โหลดห้องจากระบบก่อน ต้องรอให้ตัวเลือกขึ้นแล้วค่อยเลือก */
async function pickUnit(user: ReturnType<typeof userEvent.setup>, roomNumber: string) {
  const unitSelect = screen.getByLabelText('Unit Number')
  await within(unitSelect).findByRole('option', { name: roomNumber })
  await user.selectOptions(unitSelect, roomNumber)
}

function taskRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

function taskRow(title: string): HTMLElement {
  return screen.getByRole('button', { name: `View task ${title}` }).closest('tr') as HTMLElement
}

/** วันนัดของใบตัวอย่างนับจากวันนี้ (isoDate ใน mockApi.ts) เทสจึงต้องคิดแบบเดียวกัน */
function daysFromToday(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return todayInBangkok(d)
}

describe('แท็บ Maintenance Tasks', () => {
  it('filters tasks by task name and unit number', async () => {
    const user = await openTasksTab()
    const search = screen.getByLabelText('Search tasks')

    await user.type(search, 'AC compressor')
    expect(taskRows()).toHaveLength(1)
    expect(screen.getByText('AC compressor replacement')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, '201')
    expect(taskRows()).toHaveLength(1)
    expect(screen.getByText('Bathroom tap dripping')).toBeInTheDocument()
  })

  it('SSK-131 แสดงใบแจ้งซ่อมจาก API ไม่ใช่ข้อมูลตัวอย่างในโค้ด', async () => {
    await openTasksTab()

    expect(taskRows()).toHaveLength(4)
    expect(screen.getByText('AC compressor replacement')).toBeInTheDocument()
    // ป้ายคิดจากสถานะกับช่องช่าง ใบห้อง 201 ยังไม่มีช่างรับ
    expect(within(taskRow('Bathroom tap dripping')).getByText('Wait for Assign')).toBeInTheDocument()
    expect(within(taskRow('Bathroom drain pipe leaking')).getByText('In Progress')).toBeInTheDocument()
  })

  it('สร้างงานใหม่แล้วขึ้นในตาราง และตัวเลขสรุปขยับตาม', async () => {
    const user = await openTasksTab()

    const total = screen.getByRole('group', { name: 'Total Tasks tasks' })
    expect(within(total).getByText('4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Window Latch Broken')
    await pickUnit(user, '108')
    await user.selectOptions(screen.getByLabelText('Maintenance Type'), 'Plumbing')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(await screen.findByText('Window Latch Broken')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(taskRows()).toHaveLength(5)
    expect(
      within(screen.getByRole('group', { name: 'Total Tasks tasks' })).getByText('5'),
    ).toBeInTheDocument()
    expect(within(taskRow('Window Latch Broken')).getByText('108')).toBeInTheDocument()
    expect(within(taskRow('Window Latch Broken')).getByText('Wait for Assign')).toBeInTheDocument()
  })

  /*
    SSK-131 สองแท็บใช้ loader ตัวเดียวกัน เดิมแท็บ Tasks เก็บงานไว้ใน state ของตัวเอง
    เพิ่มงานแล้วแท็บ Log ไม่เห็น และ Today's Activity เทียบ reportedAt ที่เป็นเวลาเต็ม
    กับวันที่ล้วน จึงได้ศูนย์เสมอ ใบตัวอย่างแจ้งไว้หลายวันก่อน ใบนี้จึงเป็นใบเดียวของวันนี้
  */
  it('SSK-131 งานที่สร้างในแท็บ Tasks ขึ้นในแท็บ Log ทันที และนับเป็นกิจกรรมของวันนี้', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'Window Latch Broken')
    await pickUnit(user, '108')
    await user.selectOptions(screen.getByLabelText('Maintenance Type'), 'Plumbing')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))
    await screen.findByText('Window Latch Broken')

    await user.click(screen.getByRole('button', { name: 'Maintenance Log' }))

    expect(logRows()).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'View log Window Latch Broken' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: "Today's Activity tasks" })).getByText('1'),
    ).toBeInTheDocument()
  })

  /*
    SSK-117 เดิมช่อง Unit Number พิมพ์เลข 3 หลักอะไรก็ได้ เช่น 999 ซึ่งไม่มีห้องจริง
    ตอนนี้เป็น dropdown ที่มีแค่ห้องในระบบ และช่อง Type ใช้รายการเดียวกับ Dashboard
  */
  it('SSK-117 ช่อง Unit Number เลือกได้เฉพาะห้องที่มีอยู่จริง ไม่มีห้อง 999', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    const unitSelect = screen.getByLabelText('Unit Number')
    await within(unitSelect).findByRole('option', { name: '101' })

    const units = within(unitSelect)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean)
    expect(units).toHaveLength(24)
    expect(units).toContain('212')
    expect(units).not.toContain('999')
    expect(unitSelect.tagName).toBe('SELECT')
  })

  it('SSK-117 ไม่เลือกห้องแล้วกดสร้าง ต้องเตือนและไม่เพิ่มเข้าตาราง', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'No Unit')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('unit number')
    expect(screen.queryByText('No Unit')).not.toBeInTheDocument()
    expect(taskRows()).toHaveLength(4)
  })

  it('SSK-117 ช่อง Maintenance Type เป็น dropdown รายการเดียวกับ Create Maintenance ใน Dashboard', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    const typeSelect = screen.getByLabelText('Maintenance Type')

    expect(typeSelect.tagName).toBe('SELECT')
    const types = within(typeSelect)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean)
    expect(types).toEqual(['Air Conditioning', 'Plumbing', 'Electrical', 'Appliance', 'Furniture', 'Other'])
  })

  it('SSK-117 เปิดแก้งานเดิม ช่อง Unit กับ Type แสดงค่าที่บันทึกไว้', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Edit task AC compressor replacement' }))

    // ตอนแก้มีคำอธิบายใต้ช่องว่าทำไมเปลี่ยนห้องไม่ได้ ซึ่งอยู่ใน label ด้วย จึงจับแค่คำขึ้นต้น
    expect(screen.getByLabelText(/^Unit Number/)).toHaveValue('106')
    expect(screen.getByLabelText('Maintenance Type')).toHaveValue('Air Conditioning')
  })

  /*
    SSK-131 PATCH ไม่รับ roomId ใบแจ้งซ่อมผูกกับห้องตั้งแต่เปิด ช่องห้องจึงล็อกตอนแก้
    ส่วนช่อง Status มีเฉพาะตอนแก้ เพราะงานใหม่เป็น Open เสมอ
  */
  it('SSK-131 ตอนแก้งานเปลี่ยนห้องไม่ได้และมีช่อง Status ส่วนตอนสร้างไม่มี', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    expect(screen.getByLabelText('Unit Number')).toBeEnabled()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Edit task AC compressor replacement' }))
    expect(screen.getByLabelText(/^Unit Number/)).toBeDisabled()
    expect(screen.getByLabelText('Status')).toHaveValue('IN_PROGRESS')
  })

  it('SSK-131 ปิดงานเป็น Done แล้วแถวยังอยู่พร้อมป้าย Done และแท็บ Log นับเป็น Completed', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Edit task Scheduled AC cleaning' }))
    await user.selectOptions(screen.getByLabelText('Status'), 'DONE')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(within(taskRow('Scheduled AC cleaning')).getByText('Done')).toBeInTheDocument()
    })
    expect(taskRows()).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Maintenance Log' }))
    expect(within(screen.getByRole('group', { name: 'Completed tasks' })).getByText('1')).toBeInTheDocument()
    const logRow = screen.getByRole('button', { name: 'View log Scheduled AC cleaning' }).closest('tr') as HTMLElement
    expect(within(logRow).getByText('Completed')).toBeInTheDocument()
  })

  /*
    PATCH ล้างวันนัดไม่ได้ (ไม่ส่ง = ไม่แก้) ถ้าปล่อยผ่าน วันเดิมจะกลับมาเงียบ ๆ หลังบันทึก
    จึงต้องเตือนตั้งแต่ในป็อปอัป
  */
  it('SSK-131 ลบวันนัดของงานที่มีวันแล้วไม่ได้ ต้องบอกให้เลือกวันใหม่แทน', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Edit task AC compressor replacement' }))
    await user.clear(screen.getByLabelText('Date'))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The date cannot be removed once set')
    expect(screen.getByRole('heading', { name: 'Edit Maintenance Task' })).toBeInTheDocument()
  })

  /*
    QA ทักว่าช่อง Assigned To / Report By เป็นช่องพิมพ์อิสระ ทั้งที่ดีไซน์วาด
    เป็น dropdown ผลคือชื่อคนเดียวกันสะกดไม่ตรงกัน กรองรายงานทีหลังไม่ได้
    (SSK-94) ระบบยังไม่มี API พนักงาน จึงเสนอชื่อที่เคยใช้ในระบบให้เลือกแทน
  */
  it('ช่อง Assigned To / Report By เสนอชื่อที่เคยใช้ในระบบให้เลือก', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'New Task' }))

    const assignTo = screen.getByLabelText('Assigned To')
    const reportBy = screen.getByLabelText('Report By')
    // ผูกกับ datalist คนละชุด จะได้ไม่เสนอชื่อผู้แจ้งในช่องผู้รับงาน
    expect(assignTo).toHaveAttribute('list')
    expect(reportBy).toHaveAttribute('list')
    expect(assignTo.getAttribute('list')).not.toBe(reportBy.getAttribute('list'))

    const assignOptions = [
      ...document.querySelectorAll(`#${assignTo.getAttribute('list')} option`),
    ].map((o) => o.getAttribute('value'))
    expect(assignOptions).toEqual(['Kenji Tanaka', 'Mei Lin'])

    const reportOptions = [
      ...document.querySelectorAll(`#${reportBy.getAttribute('list')} option`),
    ].map((o) => o.getAttribute('value'))
    expect(reportOptions).toEqual(['Alex P.', 'David W.', 'Kenji Sato', 'Sarah J.'])
  })

  it('ยังพิมพ์ชื่อช่างคนใหม่ที่ไม่เคยมีในระบบได้ เพราะยังไม่มี API พนักงาน', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'New Task' }))
    await user.type(screen.getByLabelText('Task Title'), 'New Tech Job')
    await pickUnit(user, '110')
    await user.type(screen.getByLabelText('Assigned To'), 'Haruto Mori')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    await screen.findByText('New Tech Job')
    const row = taskRow('New Tech Job')
    expect(within(row).getByText('Haruto Mori')).toBeInTheDocument()
    // มีช่างรับตั้งแต่สร้าง จึงขึ้น Pending ไม่ใช่ Wait for Assign
    expect(within(row).getByText('Pending')).toBeInTheDocument()
  })

  /*
    ตารางไม่มีที่แสดงประเภทงาน ความสำคัญ และวันที่ ต้องกดดินสอเข้าโหมดแก้ไข
    ถึงจะเห็น ทีมขอให้กดแถวแล้วดูรายละเอียดได้เลยโดยไม่ต้องเข้าโหมดแก้ไข
  */
  it('กดแถวงานแล้วเปิดรายละเอียดครบ รวมช่องที่ตารางไม่ได้แสดง', async () => {
    const user = await openTasksTab()

    await user.click(within(taskRow('AC compressor replacement')).getByText('106'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('AC compressor replacement')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Air conditioner not cooling. Technician booked to swap the compressor; unit closed during the work.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Air Conditioning')).toBeInTheDocument()
    expect(within(dialog).getByText('High')).toBeInTheDocument()
    expect(within(dialog).getByText('Kenji Tanaka')).toBeInTheDocument()
    expect(within(dialog).getByText('Sarah J.')).toBeInTheDocument()
    expect(within(dialog).getByText('In Progress')).toBeInTheDocument()
    expect(within(dialog).getByText(displayDate(daysFromToday(1)))).toBeInTheDocument()
    // เป็นป็อปอัปดูอย่างเดียว ไม่มีช่องให้แก้
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('ชื่องานเป็นปุ่มเปิดรายละเอียด ใช้คีย์บอร์ดเข้าถึงได้', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'View task Bathroom drain pipe leaking' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Water seeping into the ceiling below. Waiting on the plumber to lift the tiles.'),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('กดปุ่มแก้ไขในแถว เปิดแค่ป็อปอัปแก้ไข ไม่เปิดรายละเอียดซ้อนขึ้นมา', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Edit task AC compressor replacement' }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Edit Maintenance Task' })).toBeInTheDocument()
  })

  it('แก้งานเดิมแล้วแถวนั้นเปลี่ยน ไม่ได้เพิ่มแถวใหม่', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Edit task Bathroom drain pipe leaking' }))
    const title = screen.getByLabelText('Task Title')
    await user.clear(title)
    await user.type(title, 'Drain pipe replaced')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Drain pipe replaced')).toBeInTheDocument()
    expect(taskRows()).toHaveLength(4)
    expect(screen.queryByText('Bathroom drain pipe leaking')).not.toBeInTheDocument()
  })

  /*
    ผู้ใช้ขอให้หน้า Maintenance Tasks มีปุ่มลบแบบเดียวกับแท็บอื่น (Supplies,
    Schedule & Reminder) ที่ต้องถามยืนยันก่อนลบเสมอ ไม่ใช่ลบทันทีตอนกดปุ่ม
    ใบที่ลบได้คือใบ Open ที่แอดมินเปิดเอง ในข้อมูลตัวอย่างคือใบห้อง 201
  */
  it('กดปุ่มลบแล้วต้องถามยืนยันก่อน ยังไม่ลบทันที', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Delete task Bathroom tap dripping' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Are you sure you want to delete this task/)).toBeInTheDocument()
    // แถวเดิมในตารางต้องยังอยู่ ไม่ใช่แค่ในป็อปอัปยืนยัน
    expect(screen.getAllByText('Bathroom tap dripping')).toHaveLength(2)
    expect(taskRows()).toHaveLength(4)
  })

  it('ยืนยันลบแล้วแถวหายไปจริง', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Delete task Bathroom tap dripping' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))

    await waitFor(() => {
      expect(screen.queryByText('Bathroom tap dripping')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(taskRows()).toHaveLength(3)
  })

  /*
    SSK-131 ใบที่เริ่มทำแล้วเป็นประวัติงานซ่อม backend ตอบ 409 พร้อมเหตุผล ป็อปอัปต้องค้างไว้
    และโชว์เหตุผลนั้น ไม่ใช่ปิดเงียบ ๆ จนผู้ใช้คิดว่าลบไปแล้ว
  */
  it('SSK-131 ลบงานที่กำลังทำไม่ได้ ป็อปอัปบอกเหตุผลจาก backend และแถวยังอยู่', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Delete task AC compressor replacement' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This ticket is in progress and cannot be deleted',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(taskRows()).toHaveLength(4)
  })

  it('กด Cancel ตอนถามยืนยัน แล้วแถวไม่ถูกลบ', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Delete task Bathroom tap dripping' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Bathroom tap dripping')).toBeInTheDocument()
    expect(taskRows()).toHaveLength(4)
  })
})

describe('แท็บ Supplies & Inventory', () => {
  it('filters supplies by item name and SKU', async () => {
    const user = await openTab('Supplies & Inventory')
    const search = screen.getByLabelText('Search items')

    await user.type(search, 'Copper')
    expect(screen.getByText('Copper Pipe Fittings')).toBeInTheDocument()
    expect(screen.queryByText('LED Bulbs 60W')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'HV-042')
    expect(screen.getByText('Air Filters 16x20x1')).toBeInTheDocument()
    expect(screen.queryByText('Copper Pipe Fittings')).not.toBeInTheDocument()
  })

  it('เพิ่มอุปกรณ์ใหม่แล้วได้ SKU อัตโนมัติ ไม่มีแถวที่ SKU ว่าง', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'New Supply Item' }))
    await user.type(screen.getByLabelText('Item Name'), 'Shower Head')
    await user.selectOptions(screen.getByLabelText('Category'), 'Plumbing')
    await user.click(screen.getByRole('button', { name: 'Add Supply' }))

    expect(screen.getByText('Shower Head')).toBeInTheDocument()
    expect(screen.getByText('SKU: PL-004')).toBeInTheDocument()
  })

  // SSK-119 เดิมช่อง Category พิมพ์อิสระ ชื่อหมวดเดียวกันจึงสะกดต่างกันได้
  it('SSK-119 ช่อง Category เป็น dropdown เลือกได้เฉพาะหมวดที่กำหนด', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'New Supply Item' }))
    const category = screen.getByLabelText('Category')

    expect(category.tagName).toBe('SELECT')
    const options = within(category)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean)
    expect(options).toEqual(['Electrical', 'HVAC', 'Plumbing', 'Appliance', 'Cleaning', 'Hardware', 'Other'])
  })

  it('SSK-119 ไม่เลือกหมวดแล้วกดเพิ่ม ต้องเตือนและไม่เพิ่มเข้าตาราง', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'New Supply Item' }))
    await user.type(screen.getByLabelText('Item Name'), 'No Category Item')
    await user.click(screen.getByRole('button', { name: 'Add Supply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose the category')
    expect(screen.queryByText('No Category Item')).not.toBeInTheDocument()
  })

  it('SSK-119 เปิดแก้อุปกรณ์เดิม ช่อง Category แสดงหมวดที่บันทึกไว้', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Edit item Air Filters 16x20x1' }))

    expect(screen.getByLabelText('Category')).toHaveValue('HVAC')
  })

  it('เลือก Other แล้วมีช่องให้พิมพ์รายละเอียด หมวดอื่นไม่มี', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'New Supply Item' }))
    expect(screen.queryByLabelText('Other Category Details')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Category'), 'Other')
    expect(screen.getByLabelText('Other Category Details')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Category'), 'HVAC')
    expect(screen.queryByLabelText('Other Category Details')).not.toBeInTheDocument()
  })

  it('เพิ่มอุปกรณ์หมวด Other พร้อมรายละเอียด ตารางแสดงรายละเอียดด้วย และเปิดแก้แล้วยังอยู่', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'New Supply Item' }))
    await user.type(screen.getByLabelText('Item Name'), 'Hedge Shears')
    await user.selectOptions(screen.getByLabelText('Category'), 'Other')
    await user.type(screen.getByLabelText('Other Category Details'), 'Gardening tools')
    await user.click(screen.getByRole('button', { name: 'Add Supply' }))

    const row = screen.getByText('Hedge Shears').closest('tr') as HTMLElement
    expect(within(row).getByText('Other: Gardening tools')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit item Hedge Shears' }))
    expect(screen.getByLabelText('Category')).toHaveValue('Other')
    expect(screen.getByLabelText('Other Category Details')).toHaveValue('Gardening tools')
  })

  /**
   * US-17-S2 "กด restock ของอุปกรณ์นั้น แล้วกรอกAmount to add" — QA ทักไว้ว่า
   * ทั้งปุ่มและฟอร์มนี้ยังไม่มีเลยในทุก branch ก่อนหน้า รวมทั้งเวอร์ชันแรกของหน้า
   * นี้ด้วย
   */
  it('กด Restock แล้วจำนวนคงเหลือบวกเพิ่มจากของเดิม ไม่ใช่ถูกตั้งใหม่ทั้งก้อน', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '20')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('28')).toBeInTheDocument()
  })

  it('restock จนพ้นขั้นต่ำแล้ว ป้ายเปลี่ยนจาก Low Stock เป็น In Stock เอง', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '20')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(within(row as HTMLElement).getByText('In Stock')).toBeInTheDocument()
  })

  it('กรอกจำนวนติดลบหรือศูนย์แล้ว restock ไม่ได้ ตาม US-17-S5', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16x20x1' }))
    await user.type(screen.getByLabelText('Amount to add'), '-5')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('greater than 0')
    const row = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(within(row as HTMLElement).getByText('8')).toBeInTheDocument()
  })

  /*
    QA ทักว่าตั้ง Max Stock ไว้แล้วยังดันจำนวนคงเหลือทะลุเพดานได้ มีสองทางที่
    ทำได้ คือเติมของผ่าน Restock และพิมพ์จำนวนใหม่ในฟอร์ม Edit ปิดทั้งสองทาง
  */
  it('SSK-111 restock จนยอดรวมเกิน Max Stock ไม่ได้', async () => {
    const user = await openTab('Supplies & Inventory')

    // LED Bulbs มีของ 145 เพดาน 200 เติมได้อีกไม่เกิน 55
    await user.click(screen.getByRole('button', { name: 'Restock LED Bulbs 60W' }))
    await user.type(screen.getByLabelText('Amount to add'), '139')
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('above the maximum stock of 200')
    const row = screen.getByText('LED Bulbs 60W').closest('tr')
    expect(within(row as HTMLElement).getByText('145')).toBeInTheDocument()
  })

  it('SSK-111 ฟอร์ม restock บอกล่วงหน้าว่าเติมได้อีกเท่าไรก่อนชนเพดาน', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock LED Bulbs 60W' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/you can add up to 55 more/)).toBeInTheDocument()
  })

  it('SSK-111 แก้จำนวนคงเหลือให้เกิน Max Stock ไม่ได้', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Edit item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    const quantity = within(dialog).getByLabelText('Quantity')
    await user.clear(quantity)
    await user.type(quantity, '284')
    await user.click(within(dialog).getByRole('button', { name: 'Edit Supply' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Quantity cannot be higher than maximum stock',
    )
  })

  /*
    BUG-M6 ใน SSK-111 QA ทักว่าฟอร์มนี้ไม่มีที่กำหนดค่า Max Stock เลย มีแต่
    Min Stock ที่เตือนตอนของใกล้หมด แต่ไม่มีอะไรกันไม่ให้สั่งเข้ามาเกินจำเป็น
  */
  it('SSK-111 มีช่อง Max Stock ในฟอร์ม และตารางแสดงคอลัมน์นี้ด้วย', async () => {
    const user = await openTab('Supplies & Inventory')

    expect(screen.getByRole('columnheader', { name: 'MAX STOCK' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Max Stock')).toHaveValue(200)
  })

  it('SSK-111 แก้ Max Stock ต่ำกว่า Min Stock ต้องเตือนและไม่บันทึก', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Edit item Air Filters 16x20x1' }))
    const dialog = await screen.findByRole('dialog')
    const maxStock = within(dialog).getByLabelText('Max Stock')
    await user.clear(maxStock)
    await user.type(maxStock, '5')
    await user.click(within(dialog).getByRole('button', { name: 'Edit Supply' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'cannot be lower than minimum stock',
    )
  })

  /*
    BUG-M6 ใน SSK-111 ตาราง Current Inventory ไม่มีปุ่มลบเลยสักแถว
  */
  it('SSK-111 กดปุ่มลบแล้วต้องถามยืนยันก่อน ยังไม่ลบทันที', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Delete item LED Bulbs 60W' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Are you sure you want to delete this item/)).toBeInTheDocument()
    // แถวเดิมในตารางต้องยังอยู่ ไม่ใช่แค่ในป็อปอัปยืนยัน
    expect(screen.getAllByText('LED Bulbs 60W')).toHaveLength(2)
  })

  it('SSK-111 ยืนยันลบแล้วแถวหายไปจริง', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Delete item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete item' }))

    expect(screen.queryByText('LED Bulbs 60W')).not.toBeInTheDocument()
  })

  it('SSK-111 กด Cancel ตอนถามยืนยัน แล้วแถวไม่ถูกลบ', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Delete item LED Bulbs 60W' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('LED Bulbs 60W')).toBeInTheDocument()
  })

  it('ของที่ต่ำกว่าขั้นต่ำขึ้น Low Stock ตามจำนวนจริง ไม่ใช่ค่าที่เก็บไว้', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Edit item LED Bulbs 60W' }))
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
  /**
   * ป้ายวันไม่ใช่ค่าคงที่แล้ว ปฏิทินตามสัปดาห์จริงตามที่ QA ขอ เทสจึงคำนวณ
   * ป้ายที่คาดหวังจากฟังก์ชันเดียวกับที่หน้าจอใช้ ถ้าใครไปตรึงสัปดาห์กลับไป
   * เหมือนเดิม เทสนี้จะแดงทันที
   */
  it('ปฏิทินแสดงงานตามวันที่กำหนดไว้ บนสัปดาห์ปัจจุบัน', async () => {
    await openTab('Schedule & Reminder')

    const week = workWeekOf(todayInBangkok())
    const wednesday = screen.getByLabelText(`Schedule for ${week[2].label}`)
    const thursday = screen.getByLabelText(`Schedule for ${week[3].label}`)

    expect(within(wednesday).getByText('Plumbing Check')).toBeInTheDocument()
    expect(within(thursday).queryByText('Plumbing Check')).toBeNull()
  })

  it('การ์ดที่เลยกำหนดมานานติดป้าย Overdue ตามที่ QA ขอ', async () => {
    await openTab('Schedule & Reminder')

    const roofing = screen.getByText('Roofing Inspection').closest('div')?.parentElement
    expect(roofing).not.toBeNull()
    expect(within(roofing as HTMLElement).getByText('Overdue')).toBeInTheDocument()
  })

  it('หัวตารางบอก GMT+7 ไม่ใช่ GMT+9 เพราะอพาร์ตเมนต์อยู่ไทย', async () => {
    await openTab('Schedule & Reminder')

    expect(screen.getByText('GMT+7')).toBeInTheDocument()
    expect(screen.queryByText('GMT+9')).toBeNull()
  })

  it('เพิ่มการแจ้งเตือนแล้วขึ้นการ์ดใหม่ในแถบ Recurring', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'Gutter Cleaning')
    await user.type(screen.getByLabelText('Start Date'), '2026-11-02')
    // ช่องห้องเป็น dropdown ที่ดึงห้องจริงแล้ว ต้องรอโหลดก่อนถึงจะเลือกได้
    await screen.findByRole('option', { name: '101' })
    await user.selectOptions(screen.getByLabelText('Assigned Unit'), '101')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(screen.getByText('Gutter Cleaning')).toBeInTheDocument()
    expect(screen.getByText('Next: 2026-11-02')).toBeInTheDocument()
  })

  /*
    QA พิมพ์ตัวอักษรมั่ว ๆ ลงช่อง Assigned Unit แล้วบันทึกผ่าน ได้ reminder
    ผูกกับห้องที่ไม่มีจริง (SSK-92) ตอนนี้ช่องเป็น dropdown จึงพิมพ์มั่วไม่ได้
    แล้ว และถ้าไม่เลือกห้องเลยก็ต้องโดนเตือน ไม่ใช่บันทึกผ่านแบบเดิม
  */
  it('ไม่เลือกห้องแล้วบันทึกไม่ได้', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'No Unit')
    await user.type(screen.getByLabelText('Start Date'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose the unit')
  })

  it('ช่อง Assigned Unit เป็น dropdown ที่มีแต่ห้องจริง พิมพ์เองไม่ได้', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    const unitField = screen.getByLabelText('Assigned Unit')
    expect(unitField.tagName).toBe('SELECT')

    await screen.findByRole('option', { name: '101' })
    const offered = within(unitField).getAllByRole('option').map((o) => o.textContent)
    expect(offered).toContain('101')
    expect(offered).toContain('212')
    // ห้องที่ไม่มีจริงต้องไม่ถูกเสนอให้เลือก
    expect(offered).not.toContain('999')
  })

  it('ไม่เลือกวันเริ่มแล้วบันทึกไม่ได้', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Add Reminder' }))
    await user.type(screen.getByLabelText('Reminder Name'), 'No Start Date')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose a start date')
  })

  it('กดปุ่มจุดสามจุดบนการ์ด recurring แล้วเปิด pop up ยืนยันการลบ และกดยกเลิกได้', async () => {
    const user = await openTab('Schedule & Reminder')

    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()

    // เปิด popup ลบ
    await user.click(screen.getByRole('button', { name: 'Options for HVAC Inspection' }))

    expect(screen.getByRole('heading', { name: 'Delete Recurring Reminder' })).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to delete this reminder/i)).toBeInTheDocument()

    // กดยกเลิก
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('heading', { name: 'Delete Recurring Reminder' })).not.toBeInTheDocument()
    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()
  })

  it('กดยืนยันการลบแล้วรายการ recurring นั้นถูกลบออกจากแถบ', async () => {
    const user = await openTab('Schedule & Reminder')

    expect(screen.getByText('HVAC Inspection')).toBeInTheDocument()

    // เปิด popup ลบ
    await user.click(screen.getByRole('button', { name: 'Options for HVAC Inspection' }))
    // กดยืนยันลบ
    await user.click(screen.getByRole('button', { name: 'Delete reminder' }))

    expect(screen.queryByRole('heading', { name: 'Delete Recurring Reminder' })).not.toBeInTheDocument()
    expect(screen.queryByText('HVAC Inspection')).not.toBeInTheDocument()
    expect(screen.getByText('Fire Safety Audit')).toBeInTheDocument()
  })
})

/*
  ทีมขอให้ทุกแท็บในหน้า Maintenance กดดูรายละเอียดได้ ไม่ต้องเข้าโหมดแก้ไข
  และให้ตาราง Maintenance Tasks มีคอลัมน์ Date เพราะเดิมไม่มีที่แสดงวันนัดซ่อมเลย
*/
describe('ดูรายละเอียดได้ทุกแท็บ', () => {
  it('ตาราง Maintenance Tasks มีคอลัมน์ Date และแสดงวันนัดซ่อมของแต่ละงาน', async () => {
    await openTasksTab()

    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument()
    expect(within(taskRow('Bathroom drain pipe leaking')).getByText(displayDate(daysFromToday(2)))).toBeInTheDocument()
  })

  it('Supplies & Inventory กดชื่ออุปกรณ์แล้วเห็นรายละเอียดครบ', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'View item LED Bulbs 60W' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Supply item details')).toBeInTheDocument()
    expect(within(dialog).getByText('EL-001')).toBeInTheDocument()
    expect(within(dialog).getByText('Electrical')).toBeInTheDocument()
    expect(within(dialog).getByText('200')).toBeInTheDocument()
  })

  it('Supplies & Inventory กดปุ่ม Restock ในแถว ไม่เปิดรายละเอียดซ้อนขึ้นมา', async () => {
    const user = await openTab('Supplies & Inventory')

    await user.click(screen.getByRole('button', { name: 'Restock LED Bulbs 60W' }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByText('Supply item details')).not.toBeInTheDocument()
  })

  it('Schedule & Reminder กดการ์ดแล้วเห็นรายละเอียดของรอบแจ้งเตือน', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'View reminder Fire Safety Audit' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Reminder details')).toBeInTheDocument()
    expect(within(dialog).getByText('Quarterly')).toBeInTheDocument()
    expect(within(dialog).getByText('Test alarms and verify extinguisher expiration dates.')).toBeInTheDocument()
    expect(within(dialog).getByText('High')).toBeInTheDocument()
  })

  it('Schedule & Reminder กดปุ่มสามจุด เปิดแค่ป็อปอัปลบ ไม่เปิดรายละเอียด', async () => {
    const user = await openTab('Schedule & Reminder')

    await user.click(screen.getByRole('button', { name: 'Options for HVAC Inspection' }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByText('Reminder details')).not.toBeInTheDocument()
  })

  it('Maintenance Log กดแถวแล้วเห็นรายละเอียดของใบแจ้งซ่อม', async () => {
    const user = await openLogTab()

    await user.click(screen.getByRole('button', { name: 'View log Bathroom tap dripping' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Maintenance log details')).toBeInTheDocument()
    expect(within(dialog).getByText('Tenant reports the tap drips constantly.')).toBeInTheDocument()
    expect(within(dialog).getByText('201')).toBeInTheDocument()
  })

  it('Maintenance Log opens the details when any cell of the row is clicked, not only the title (SSK-122 onRowClick)', async () => {
    const user = await openLogTab()

    const row = screen.getByRole('button', { name: 'View log Bathroom tap dripping' }).closest('tr') as HTMLElement
    await user.click(within(row).getByText('201'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Maintenance log details')).toBeInTheDocument()
    expect(within(dialog).getByText('Tenant reports the tap drips constantly.')).toBeInTheDocument()
  })

  it('Maintenance Tasks Edit button opens only the edit dialog, not the details as well', async () => {
    const user = await openTasksTab()

    await user.click(screen.getByRole('button', { name: 'Edit task Bathroom drain pipe leaking' }))

    expect(await screen.findAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByText('Maintenance task details')).not.toBeInTheDocument()
  })
})
