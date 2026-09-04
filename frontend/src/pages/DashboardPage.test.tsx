import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import DashboardPage from './DashboardPage'

/**
 * เทสหน้าแดชบอร์ด ครอบ US-08 ภาพรวมห้องทั้ง 24 ห้อง
 *
 * ข้อมูลมาจาก backend จำลองผ่าน client ตัวจริง ไม่ได้ mock ฟังก์ชันทีละตัว
 * เพราะสิ่งที่อยากรู้คือ "หน้าจอต่อกับ API แล้วแสดงผลถูกไหม" ไม่ใช่แค่ว่า
 * component เรนเดอร์ props ที่ป้อนให้ได้
 */

async function renderDashboard() {
  render(<DashboardPage />)
  // รอให้การ์ดห้องแรกขึ้นก่อน แปลว่าโหลดข้อมูลเสร็จแล้ว
  await screen.findByRole('listitem', { name: 'ห้อง 101' })
}

beforeEach(() => {
  resetMockStore()
})

describe('US-08 ภาพรวมห้องทั้งหมด', () => {
  it('แสดงห้องครบ 24 ห้อง แยกเป็นสองชั้น', async () => {
    await renderDashboard()

    expect(screen.getAllByRole('listitem')).toHaveLength(24)
    expect(screen.getByText('Floor 1')).toBeInTheDocument()
    expect(screen.getByText('Floor 2')).toBeInTheDocument()
  })

  it('ตัวเลขสรุปด้านบนตรงกับสถานะห้องที่มาจาก API', async () => {
    const rooms = await fetchRooms()
    const expected = {
      available: rooms.filter((r) => r.status === 'AVAILABLE').length,
      occupied: rooms.filter((r) => r.status === 'OCCUPIED').length,
      maintenance: rooms.filter((r) => r.status === 'MAINTENANCE').length,
    }

    await renderDashboard()

    for (const [label, value] of [
      ['Available', expected.available],
      ['Occupied', expected.occupied],
      ['Maint.', expected.maintenance],
    ] as const) {
      const card = screen.getByRole('group', { name: `จำนวนห้อง ${label}` })
      expect(within(card).getByText(String(value))).toBeInTheDocument()
    }
  })

  it('ห้องที่มีผู้เช่าแสดงชื่อผู้เช่าบนการ์ด', async () => {
    await renderDashboard()
    const card = screen.getByRole('listitem', { name: 'ห้อง 102' })
    expect(within(card).getByText('ยูกิ ทานากะ')).toBeInTheDocument()
  })

  it('ห้องที่ปิดซ่อมขึ้นคำว่า Maintenance บนการ์ด', async () => {
    await renderDashboard()
    const card = screen.getByRole('listitem', { name: 'ห้อง 106' })
    expect(within(card).getByText('Maintenance')).toBeInTheDocument()
  })

  it('กรองเฉพาะห้องซ่อมบำรุงแล้วเหลือเฉพาะห้องที่ปิดซ่อม', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('listitem', { name: 'ห้อง 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('listitem', { name: 'ห้อง 106' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'ห้อง 206' })).toBeInTheDocument()
  })

  it('พิมพ์ชื่อผู้เช่าในช่องค้นหาแล้วเหลือเฉพาะห้องของคนนั้น', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.type(screen.getByLabelText('ค้นหาเลขห้องหรือชื่อผู้เช่า'), 'ยูกิ')

    await waitFor(() => {
      expect(screen.queryByRole('listitem', { name: 'ห้อง 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('listitem', { name: 'ห้อง 102' })).toBeInTheDocument()
  })

  it('ค้นหาแล้วไม่เจอห้องไหนเลย ต้องบอกผู้ใช้ ไม่ใช่ปล่อยหน้าว่าง', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.type(screen.getByLabelText('ค้นหาเลขห้องหรือชื่อผู้เช่า'), '999')

    expect(await screen.findByText('ไม่พบห้องที่ตรงกับคำค้นหาหรือตัวกรอง')).toBeInTheDocument()
  })
})
