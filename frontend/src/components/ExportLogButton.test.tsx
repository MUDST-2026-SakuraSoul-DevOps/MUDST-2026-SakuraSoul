import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MaintenanceTicket } from '../api/types'
import { ExportLogButton } from './ExportLogButton'

/**
 * เทสปุ่ม Export Log ตาม US-18
 *
 * jsdom ไม่มี URL.createObjectURL กับการดาวน์โหลดจริง จึงปลอมสองอย่างนั้นไว้
 * แล้วเช็คว่าปุ่มสั่งดาวน์โหลดด้วยชื่อไฟล์และเนื้อหาที่ถูกต้องหรือไม่
 */

function ticket(overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket {
  return {
    id: 1,
    roomId: 6,
    roomNumber: '106',
    title: 'เปลี่ยนคอมเพรสเซอร์แอร์',
    detail: 'แอร์ไม่เย็น',
    status: 'IN_PROGRESS',
    reportedAt: '2026-09-01',
    ...overrides,
  }
}

let clicked: HTMLAnchorElement[] = []

beforeEach(() => {
  clicked = []
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
  // ดักการกดลิงก์ดาวน์โหลด เพราะ jsdom ดาวน์โหลดจริงไม่ได้
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('US-18-S1 กด Export แล้วได้ไฟล์', () => {
  it('สั่งดาวน์โหลดไฟล์ CSV ที่มีวันที่ในชื่อ', async () => {
    const user = userEvent.setup()
    render(<ExportLogButton tickets={[ticket()]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toMatch(/^maintenance-log-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

describe('US-18-S2 export เฉพาะรายการที่กรองไว้', () => {
  it('ไฟล์มีจำนวนแถวเท่ากับรายการที่ส่งเข้ามา ไม่ใช่ทุกรายการในระบบ', async () => {
    const user = userEvent.setup()
    // หน้าที่เรียกใช้เป็นคนกรองแล้วส่งผลลัพธ์เข้ามา ปุ่มไม่ได้ไปดึงเอง
    const filtered = [ticket({ id: 1, roomNumber: '106' }), ticket({ id: 2, roomNumber: '206' })]
    render(<ExportLogButton tickets={filtered} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(clicked).toHaveLength(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    const text = await blob.text()
    // หัวตารางหนึ่งบรรทัด บวกสองรายการ
    expect(text.replace('﻿', '').split('\r\n')).toHaveLength(3)
    expect(text).toContain('106')
    expect(text).toContain('206')
  })
})

describe('US-18-S3 ไม่มีข้อมูลให้ export', () => {
  it('แจ้งเตือนและไม่สร้างไฟล์เปล่า', async () => {
    const user = userEvent.setup()
    render(<ExportLogButton tickets={[]} />)

    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ยังไม่มีประวัติงานซ่อมให้ export',
    )
    expect(clicked).toHaveLength(0)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('พอมีข้อมูลแล้วกดใหม่ ข้อความเตือนต้องหายไป', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ExportLogButton tickets={[]} />)
    await user.click(screen.getByRole('button', { name: /Export Log/ }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<ExportLogButton tickets={[ticket()]} />)
    await user.click(screen.getByRole('button', { name: /Export Log/ }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
