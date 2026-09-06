import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import UnitsPage from './UnitsPage'

/**
 * เทสหน้า Unit Management ครอบ US-15 ล็อกสถานะห้องเป็นซ่อมบำรุงและปลดล็อกกลับ
 *
 * หน้านี้เป็นที่เดียวที่เห็นห้องครบ 24 ห้องพร้อมสถานะในตารางเดียว จึงเป็นจุดที่
 * แอดมินกดตั้งสถานะได้ไม่ว่าห้องจะอยู่สถานะไหน
 */

async function renderUnits() {
  render(<UnitsPage />)
  await screen.findByText('101')
}

function rowOf(roomNumber: string): HTMLElement {
  const row = screen.getByText(roomNumber).closest('tr')
  if (!row) {
    throw new Error(`ไม่พบแถวของห้อง ${roomNumber}`)
  }
  return row
}

beforeEach(() => {
  resetMockStore()
})

describe('ตารางห้อง', () => {
  it('แสดงสถานะห้องที่มาจาก API ไม่ใช่ขีดว่าง', async () => {
    await renderUnits()

    expect(within(rowOf('101')).getByText('Available')).toBeInTheDocument()
    expect(within(rowOf('102')).getByText('Occupied')).toBeInTheDocument()
    expect(within(rowOf('106')).getByText('Maintenance')).toBeInTheDocument()
  })

  it('ห้องที่มีผู้เช่าแสดงชื่อผู้เช่าในตาราง', async () => {
    await renderUnits()
    expect(within(rowOf('102')).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
  })
})

describe('US-15-S1 ล็อกห้องเป็นซ่อมบำรุง', () => {
  it('กดตั้งสถานะห้องว่างเป็นซ่อมบำรุง แล้วตารางเปลี่ยนทันที', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'ตั้งสถานะห้อง 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('สถานะห้อง 101')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('101')).getByText('Maintenance')).toBeInTheDocument()
    })
  })

  it('ล็อกห้องที่มีผู้เช่าอยู่ได้ ตามที่ story ระบุ', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('102')).getByRole('button', { name: 'ตั้งสถานะห้อง 102' }))
    const dialog = await screen.findByRole('dialog')
    // ป็อปอัปต้องบอกด้วยว่าห้องนี้มีใครอยู่ จะได้ไม่เผลอล็อกผิดห้อง
    expect(within(dialog).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))

    await waitFor(() => {
      expect(within(rowOf('102')).getByText('Maintenance')).toBeInTheDocument()
    })
  })

  it('ห้องที่ถูกล็อกแล้วจะไม่ถูกเสนอให้สร้างสัญญาใหม่', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'ตั้งสถานะห้อง 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // แดชบอร์ดตัดสินใจจากสถานะนี้ว่าจะเปิดฟอร์มเช็คอินหรือรายการงานซ่อม
    const room = (await fetchRooms()).find((r) => r.roomNumber === '101')
    expect(room?.status).toBe('MAINTENANCE')
  })

  it('กดปิดโดยไม่ยืนยัน สถานะไม่เปลี่ยน', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'ตั้งสถานะห้อง 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ปิด' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(within(rowOf('101')).getByText('Available')).toBeInTheDocument()
  })
})

describe('US-15-S2 ปลดล็อกห้องหลังซ่อมเสร็จ', () => {
  it('ห้องที่ปิดซ่อมอยู่ ป็อปอัปต้องเสนอปุ่มปิดงานซ่อม', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('106')).getByRole('button', { name: 'ตั้งสถานะห้อง 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('button', { name: 'ปิดงานซ่อม คืนห้องให้เช่าได้' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'ตั้งเป็นซ่อมบำรุง' }),
    ).not.toBeInTheDocument()
  })

  it('กดปิดงานซ่อมแล้วห้องกลับไปเป็นว่างทันที', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('106')).getByRole('button', { name: 'ตั้งสถานะห้อง 106' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ปิดงานซ่อม คืนห้องให้เช่าได้' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('106')).getByText('Available')).toBeInTheDocument()
    })
  })
})
