import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchApartmentConfig, fetchRooms } from '../api/client'
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
    throw new Error(`No row found for unit ${roomNumber}`)
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
    expect(within(rowOf('102')).getByText('Yuki Tanaka')).toBeInTheDocument()
  })
})

describe('US-15-S1 ล็อกห้องเป็นซ่อมบำรุง', () => {
  it('กดตั้งสถานะห้องว่างเป็นซ่อมบำรุง แล้วตารางเปลี่ยนทันที', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'Set status for unit 101' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Unit 101 Status')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Set to Maintenance' }))

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

    await user.click(within(rowOf('102')).getByRole('button', { name: 'Set status for unit 102' }))
    const dialog = await screen.findByRole('dialog')
    // ป็อปอัปต้องบอกด้วยว่าห้องนี้มีใครอยู่ จะได้ไม่เผลอล็อกผิดห้อง
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Set to Maintenance' }))

    await waitFor(() => {
      expect(within(rowOf('102')).getByText('Maintenance')).toBeInTheDocument()
    })
  })

  it('ห้องที่ถูกล็อกแล้วจะไม่ถูกเสนอให้สร้างสัญญาใหม่', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('101')).getByRole('button', { name: 'Set status for unit 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Set to Maintenance' }))
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

    await user.click(within(rowOf('101')).getByRole('button', { name: 'Set status for unit 101' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

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

    await user.click(within(rowOf('106')).getByRole('button', { name: 'Set status for unit 106' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('button', { name: 'Finish Maintenance' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Set to Maintenance' }),
    ).not.toBeInTheDocument()
  })

  it('กดปิดงานซ่อมแล้วห้องกลับไปเป็นว่างทันที', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(within(rowOf('106')).getByRole('button', { name: 'Set status for unit 106' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Finish Maintenance' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('106')).getByText('Available')).toBeInTheDocument()
    })
  })
})

describe('US-16 ตั้งอัตราค่าสาธารณูปโภค', () => {
  it('กดปุ่ม Config แล้วได้ฟอร์มพร้อมอัตราปัจจุบัน', async () => {
    const user = userEvent.setup()
    const current = await fetchApartmentConfig()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Apartment Config')).toBeInTheDocument()
    await waitFor(() => {
      expect(within(dialog).getByLabelText(/Electricity Rate per Unit/)).toHaveValue(
        current.electricRatePerUnit,
      )
    })
  })

  it('S1 แก้อัตราแล้วบันทึกได้ ค่าที่บันทึกไปถึง API จริง', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByLabelText(/Electricity Rate per Unit/)

    fireEvent.change(within(dialog).getByLabelText(/Electricity Rate per Unit/), { target: { value: '9.5' } })
    fireEvent.change(within(dialog).getByLabelText(/Common Area Fee/), { target: { value: '400' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save Rates' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    const saved = await fetchApartmentConfig()
    expect(saved.electricRatePerUnit).toBe(9.5)
    expect(saved.commonAreaFee).toBe(400)
  })

  it('S2 กรอกอัตราติดลบ ต้องเตือนและไม่บันทึก', async () => {
    const user = userEvent.setup()
    const before = await fetchApartmentConfig()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByLabelText(/Water Rate per Unit/)

    fireEvent.change(within(dialog).getByLabelText(/Water Rate per Unit/), { target: { value: '-5' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save Rates' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('Water rate per unit cannot be negative')

    // ป็อปอัปยังเปิดอยู่ให้แก้ต่อ และอัตราเดิมไม่ถูกแตะ
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect((await fetchApartmentConfig()).waterRatePerUnit).toBe(before.waterRatePerUnit)
  })

  it('ฟอร์มบอกด้วยว่าอัตราใหม่ไม่ย้อนไปแก้ใบเสร็จเก่า', async () => {
    const user = userEvent.setup()
    await renderUnits()

    await user.click(screen.getByRole('button', { name: 'Config' }))
    const dialog = await screen.findByRole('dialog')

    // US-16-S3 เรื่อง snapshot ยังทำจริงไม่ได้เพราะใบเสร็จเป็นของ SSK-16
    // อย่างน้อยต้องบอกผู้ใช้ให้ชัดว่าระบบตั้งใจให้เป็นแบบนี้
    expect(
      await within(dialog).findByText(/Receipts already issued keep their original rates/),
    ).toBeInTheDocument()
  })
})
