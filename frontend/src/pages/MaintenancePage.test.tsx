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

  /**
   * US-13 ระบุว่าประวัติต้องเรียงจากวันที่ล่าสุดไปเก่าสุด mock เรียงไว้แล้วที่
   * GET /api/maintenance (mockApi.ts) แต่ก่อนหน้านี้ไม่มีเทสคุมจุดนี้เลย
   * QA ทักไว้ว่าถ้าใครเผลอเปลี่ยนลำดับใน mock หรือพอต่อ backend จริงแล้ว
   * endpoint ไม่ได้เรียงมาให้ จะไม่มีอะไรจับได้
   */
  it('เรียงรายการจากวันที่แจ้งล่าสุดไปเก่าสุด ตาม US-13', async () => {
    await openLogTab()

    const titles = logRows().map((row) => within(row).getAllByRole('cell')[1].textContent)
    expect(titles).toEqual([
      expect.stringContaining('ล้างแอร์ตามรอบ'),
      expect.stringContaining('ท่อน้ำทิ้งห้องน้ำรั่ว'),
      expect.stringContaining('ก๊อกอ่างล้างหน้าหยด'),
      expect.stringContaining('เปลี่ยนคอมเพรสเซอร์แอร์'),
    ])
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
