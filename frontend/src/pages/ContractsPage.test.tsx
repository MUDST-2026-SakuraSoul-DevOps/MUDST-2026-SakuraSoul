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
  await screen.findByText('Yuki Tanaka')
}

function rowOf(tenantName: string): HTMLElement {
  const row = screen.getByText(tenantName).closest('tr')
  if (!row) {
    throw new Error(`No row found for ${tenantName}`)
  }
  return row
}

beforeEach(() => {
  resetMockStore()
})

describe('รายการสัญญา', () => {
  it('ดึงสัญญาจริงมาแสดง ไม่ใช่ข้อมูลตัวอย่างที่ฝังไว้ในโค้ด', async () => {
    await renderContracts()

    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Arisa Fujimoto')).toBeInTheDocument()
    expect(within(rowOf('Yuki Tanaka')).getByText('Unit 102')).toBeInTheDocument()
  })

  it('สัญญาที่สิ้นสุดแล้ว กดยกเลิกซ้ำไม่ได้', async () => {
    await renderContracts()

    const cancelButton = within(rowOf('Arisa Fujimoto')).getByRole('button', {
      name: /Cancel the lease/,
    })
    expect(cancelButton).toBeDisabled()
  })
})

describe('US-06-S1 ยกเลิกสัญญา', () => {
  it('กดยกเลิกแล้วสถานะเปลี่ยนเป็นสิ้นสุด และห้องกลับไปเป็นว่าง', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(
      within(rowOf('Yuki Tanaka')).getByRole('button', { name: /Cancel the lease/ }),
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm Check-out' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(within(rowOf('Yuki Tanaka')).getByText('Ended')).toBeInTheDocument()
    })

    const room = (await fetchRooms()).find((r) => r.roomNumber === '102')
    expect(room?.status).toBe('AVAILABLE')
  })

  it('กดไม่ใช่ตอนนี้แล้วสัญญายังอยู่เหมือนเดิม', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(
      within(rowOf('Yuki Tanaka')).getByRole('button', { name: /Cancel the lease/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Not now' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(within(rowOf('Yuki Tanaka')).getByText('Active')).toBeInTheDocument()
  })
})

describe('US-06-S2 แก้ไขสัญญา', () => {
  it('แก้วันที่ไปทับสัญญา active อื่นของห้องเดียวกัน ต้องโดนปฏิเสธพร้อมข้อความ overlap', async () => {
    // Unit 102 มีสัญญาของยูกิที่ยัง active อยู่ จองสัญญาถัดไปไว้หลังจากนั้น
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
      within(rowOf('Haruto Watanabe')).getByRole('button', { name: /Edit the lease/ }),
    )
    const dialog = await screen.findByRole('dialog')

    // ดึงวันเริ่มถอยกลับมาให้ชนกับสัญญาของยูกิที่ยังไม่จบ
    fireEvent.change(within(dialog).getByLabelText(/Lease start/), {
      target: { value: isoDate(-10) },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('not available')
    expect(alert).toHaveTextContent('Yuki Tanaka')

    // ป็อปอัปต้องยังเปิดอยู่ ผู้ใช้จะได้แก้วันที่ต่อได้เลย
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('แก้Monthly Rentโดยไม่แตะวันที่ บันทึกได้ปกติ', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(
      within(rowOf('Yuki Tanaka')).getByRole('button', { name: /Edit the lease/ }),
    )
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/Monthly Rent/), { target: { value: '4200' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(rowOf('Yuki Tanaka')).getByText('4,200')).toBeInTheDocument()
    })
  })
})
