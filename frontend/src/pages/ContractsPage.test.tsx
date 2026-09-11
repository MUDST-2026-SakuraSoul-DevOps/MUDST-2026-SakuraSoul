import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createLease, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import ContractsPage from './ContractsPage'

/**
 * เทสหน้าจัดการสัญญาเช่า ครอบ US-06 ทั้งสอง scenario
 * S1 ยกเลิกสัญญาแล้วห้องกลับไปว่าง / S2 แก้วันที่ไปทับสัญญาอื่นแล้วต้องโดนบล็อก
 */

const ROOM_102 = 2

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function renderContracts() {
  render(<ContractsPage />)
  await screen.findByText('ยูกิ ทานากะ')
}

function rowOf(tenantName: string): HTMLElement {
  const row = screen.getByText(tenantName).closest('tr')
  if (!row) {
    throw new Error(`ไม่พบแถวของ ${tenantName}`)
  }
  return row
}

beforeEach(() => {
  resetMockStore()
})

describe('รายการสัญญา', () => {
  it('ดึงสัญญาจริงมาแสดง ไม่ใช่ข้อมูลตัวอย่างที่ฝังไว้ในโค้ด', async () => {
    await renderContracts()

    expect(screen.getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    expect(screen.getByText('อาริสา พงษ์ศิริ')).toBeInTheDocument()
    expect(within(rowOf('ยูกิ ทานากะ')).getByText('ห้อง 102')).toBeInTheDocument()
  })

  it('สัญญาที่สิ้นสุดแล้ว กดยกเลิกซ้ำไม่ได้', async () => {
    await renderContracts()

    const cancelButton = within(rowOf('อาริสา พงษ์ศิริ')).getByRole('button', {
      name: /ยกเลิกสัญญา/,
    })
    expect(cancelButton).toBeDisabled()
  })
})

describe('US-06-S1 ยกเลิกสัญญา', () => {
  it('กดยกเลิกแล้วสถานะเปลี่ยนเป็นสิ้นสุด และห้องกลับไปเป็นว่าง', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(
      within(rowOf('ยูกิ ทานากะ')).getByRole('button', { name: /ยกเลิกสัญญา/ }),
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ยืนยันเช็คเอาต์' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(within(rowOf('ยูกิ ทานากะ')).getByText('Ended')).toBeInTheDocument()
    })

    const room = (await fetchRooms()).find((r) => r.roomNumber === '102')
    expect(room?.status).toBe('AVAILABLE')
  })

  it('กดไม่ใช่ตอนนี้แล้วสัญญายังอยู่เหมือนเดิม', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(
      within(rowOf('ยูกิ ทานากะ')).getByRole('button', { name: /ยกเลิกสัญญา/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ไม่ใช่ตอนนี้' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(within(rowOf('ยูกิ ทานากะ')).getByText('Active')).toBeInTheDocument()
  })
})

describe('US-06-S2 แก้ไขสัญญา', () => {
  it('แก้วันที่ไปทับสัญญา active อื่นของห้องเดียวกัน ต้องโดนปฏิเสธพร้อมข้อความ overlap', async () => {
    // ห้อง 102 มีสัญญาของยูกิที่ยัง active อยู่ จองสัญญาถัดไปไว้หลังจากนั้น
    await createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(40),
      endDate: isoDate(400),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    const user = userEvent.setup()
    await renderContracts()

    await user.click(
      within(rowOf('ธนกฤต วัฒนชัย')).getByRole('button', { name: /แก้ไขสัญญา/ }),
    )
    const dialog = await screen.findByRole('dialog')

    // ดึงวันเริ่มถอยกลับมาให้ชนกับสัญญาของยูกิที่ยังไม่จบ
    fireEvent.change(within(dialog).getByLabelText(/วันเริ่มสัญญา/), {
      target: { value: isoDate(-10) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'บันทึกการแก้ไข' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('ไม่ว่าง')
    expect(alert).toHaveTextContent('ยูกิ ทานากะ')

    // ป็อปอัปต้องยังเปิดอยู่ ผู้ใช้จะได้แก้วันที่ต่อได้เลย
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('แก้ค่าเช่าโดยไม่แตะวันที่ บันทึกได้ปกติ', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(
      within(rowOf('ยูกิ ทานากะ')).getByRole('button', { name: /แก้ไขสัญญา/ }),
    )
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/ค่าเช่า/), { target: { value: '4200' } })
    await user.click(within(dialog).getByRole('button', { name: 'บันทึกการแก้ไข' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('ยูกิ ทานากะ')).getByText('4,200.00')).toBeInTheDocument()
    })
  })
})
