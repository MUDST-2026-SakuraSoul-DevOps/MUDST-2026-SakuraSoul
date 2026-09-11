import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createLease, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import DashboardPage from './DashboardPage'

/**
 * เทสหน้าแดชบอร์ด ครอบ US-08 ภาพรวมห้องทั้ง 24 ห้อง, US-09 คลิกห้องแล้วได้
 * ป็อปอัปที่ต่างกันตามสถานะห้อง และ US-05 กันสร้างสัญญาทับช่วงเวลากัน
 */

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function renderDashboard() {
  render(<DashboardPage />)
  // รอให้การ์ดห้องแรกขึ้นก่อน แปลว่าโหลดข้อมูลเสร็จแล้ว
  await screen.findByRole('button', { name: 'Unit 101' })
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
      const card = screen.getByRole('group', { name: `${label} units` })
      expect(within(card).getByText(String(value))).toBeInTheDocument()
    }
  })

  it('ห้องที่มีTenantแสดงชื่อTenantบนการ์ด', async () => {
    await renderDashboard()
    const card = screen.getByRole('button', { name: 'Unit 102' })
    expect(within(card).getByText('Yuki Tanaka')).toBeInTheDocument()
  })

  it('ห้องที่ปิดซ่อมขึ้นคำว่า Maintenance บนการ์ด', async () => {
    await renderDashboard()
    const card = screen.getByRole('button', { name: 'Unit 106' })
    expect(within(card).getByText('Maintenance')).toBeInTheDocument()
  })

  it('กรองเฉพาะห้องซ่อมบำรุงแล้วเหลือเฉพาะห้องที่ปิดซ่อม', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unit 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Unit 106' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unit 206' })).toBeInTheDocument()
  })

  it('พิมพ์ชื่อTenantในช่องค้นหาแล้วเหลือเฉพาะห้องของคนนั้น', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.type(screen.getByLabelText('Search room or tenant'), 'Yuki')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unit 101' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Unit 102' })).toBeInTheDocument()
  })

  it('ค้นหาแล้วไม่เจอห้องไหนเลย ต้องบอกผู้ใช้ ไม่ใช่ปล่อยหน้าว่าง', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.type(screen.getByLabelText('Search room or tenant'), '999')

    expect(await screen.findByText('No units match your search or filter')).toBeInTheDocument()
  })
})

describe('US-09 คลิกห้องเพื่อทำรายการต่อ', () => {
  it('S1 คลิกห้องว่างแล้วได้ฟอร์มสร้างสัญญาเช่า (Check In)', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Room 101')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Check In' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Tenant Name')).toBeInTheDocument()
  })

  it('S2 คลิกห้องที่มีผู้เช่าแล้วได้รายละเอียดผู้เช่าและสัญญา (Check Out flow)', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 102' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Room 102')).toBeInTheDocument()
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(within(dialog).getByText('Tenant Information')).toBeInTheDocument()
    expect(within(dialog).getByText('Lease Information')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Check Out' })).toBeInTheDocument()
  })

  it('S3 คลิกห้องที่ปิดซ่อมแล้วได้รายการงานซ่อมของห้องนั้น', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('AC compressor replacement')).toBeInTheDocument()
    expect(within(dialog).getByText(/In Progress/)).toBeInTheDocument()
  })

  it('ปิดป็อปอัปด้วยกากบาทแล้วกลับมาที่แดชบอร์ด', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 102' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('เช็คอินห้องว่างสำเร็จแล้วแดชบอร์ดอัปเดตสถานะห้องทันที', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 105' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))

    // Confirm dialog
    const confirmDialog = await screen.findByRole('dialog', { name: 'Confirm Check In' })
    await user.click(within(confirmDialog).getByRole('button', { name: 'Confirm Check In' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const card = await screen.findByRole('button', { name: 'Unit 105' })
    await waitFor(() => {
      expect(within(card).getByText('Yuki Tanaka')).toBeInTheDocument()
    })
  })
})

describe('US-05-S1 กันสร้างสัญญาทับกันจากหน้าจอ', () => {
  it('เช็คอินห้องว่างที่ถูกจองช่วงนั้นไว้แล้ว ต้องบล็อกพร้อมบอกว่าห้องไม่ว่างช่วงไหน', async () => {
    await createLease({
      roomId: 1,
      tenantId: 6,
      startDate: isoDate(60),
      endDate: isoDate(400),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))
    const dialog = await screen.findByRole('dialog')

    // Switch to Lease Information tab to edit dates
    await user.click(within(dialog).getByRole('button', { name: 'Lease Information' }))

    fireEvent.change(within(dialog).getByLabelText('Check In Date'), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText('Check Out Date'), {
      target: { value: isoDate(120) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('not available')
    expect(alert).toHaveTextContent('101')
    expect(alert).toHaveTextContent('Haruto Watanabe')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('โดนบล็อกแล้วต้องไม่มีสัญญาใหม่ถูกสร้างขึ้นจริง', async () => {
    await createLease({
      roomId: 1,
      tenantId: 6,
      startDate: isoDate(60),
      endDate: isoDate(400),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))
    const dialog = await screen.findByRole('dialog')
    
    await user.click(within(dialog).getByRole('button', { name: 'Lease Information' }))
    fireEvent.change(within(dialog).getByLabelText('Check In Date'), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText('Check Out Date'), {
      target: { value: isoDate(120) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))
    await within(dialog).findByRole('alert')

    const card = screen.getByRole('button', { name: 'Unit 101' })
    expect(within(card).queryByText('Haruto Watanabe')).not.toBeInTheDocument()
  })

  it('วันสิ้นสุดมาก่อนวันเริ่ม ต้องเตือนตั้งแต่ก่อนยิง API', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 101' }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Lease Information' }))
    fireEvent.change(within(dialog).getByLabelText('Check In Date'), {
      target: { value: isoDate(30) },
    })
    fireEvent.change(within(dialog).getByLabelText('Check Out Date'), {
      target: { value: isoDate(10) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Check Out Date must not be earlier than Check In Date.',
    )
  })

  it('ช่วงที่ไม่ทับกับใคร ยังสร้างสัญญาได้ตามปกติ', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 105' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Check In' }))

    const confirmDialog = await screen.findByRole('dialog', { name: 'Confirm Check In' })
    await user.click(within(confirmDialog).getByRole('button', { name: 'Confirm Check In' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

describe('US-15 ปิดงานซ่อมจากแดชบอร์ด', () => {
  it('ห้องที่ปิดซ่อมอยู่ กดแล้วได้รายการงานซ่อม ไม่ใช่ฟอร์มเช็คอิน', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Check In' })).not.toBeInTheDocument()
    expect(await within(dialog).findByText('AC compressor replacement')).toBeInTheDocument()
    expect(within(dialog).getByText(/In Progress/)).toBeInTheDocument()
  })

  it('S2 กดปิดงานซ่อมแล้วห้องกลับมารับสัญญาใหม่ได้ทันที', async () => {
    const user = userEvent.setup()
    await renderDashboard()

    await user.click(screen.getByRole('button', { name: 'Unit 106' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Release Room' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // กดห้องเดิมอีกครั้ง คราวนี้ต้องได้ฟอร์มเช็คอินแทนรายการงานซ่อม
    await user.click(await screen.findByRole('button', { name: 'Unit 106' }))
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).getByRole('button', { name: 'Check In' })).toBeInTheDocument()
  })
})
