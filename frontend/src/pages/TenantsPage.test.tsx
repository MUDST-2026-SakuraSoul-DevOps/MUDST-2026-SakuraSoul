import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import TenantsPage from './TenantsPage'

/**
 * เทสหน้ารายชื่อผู้เช่า ครอบ US-07 ทั้งสอง scenario
 * S1 พิมพ์ค้นหาแล้วกรองทันที / S2 กดกรองตามสถานะสัญญา
 */

async function renderTenants() {
  render(<TenantsPage />)
  await screen.findByText('ยูกิ ทานากะ')
}

/** อ่านชื่อผู้เช่าจากคอลัมน์แรกของทุกแถวที่แสดงอยู่ตอนนี้ */
function visibleTenantNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '')
}

beforeEach(() => {
  resetMockStore()
})

describe('US-07-S1 ค้นหาแบบเรียลไทม์', () => {
  it('พิมพ์ชื่อแล้วเหลือเฉพาะคนที่ตรง โดยไม่ต้องกดปุ่มค้นหา', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('ค้นหาชื่อผู้เช่าหรือเลขห้อง'), 'เคนจิ')

    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('เคนจิ ซาโต้')
  })

  it('ค้นหาด้วยเลขห้องก็เจอผู้เช่าของห้องนั้น', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('ค้นหาชื่อผู้เช่าหรือเลขห้อง'), '207')

    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('ฮิโรชิ นากามุระ')
  })

  it('ค้นหาแล้วไม่เจอใคร ต้องบอกว่าไม่พบ ไม่ใช่ปล่อยตารางว่าง', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('ค้นหาชื่อผู้เช่าหรือเลขห้อง'), 'ไม่มีคนชื่อนี้')

    expect(await screen.findByText('ไม่พบผู้เช่าที่ตรงกับเงื่อนไข')).toBeInTheDocument()
  })
})

describe('US-07-S2 กรองตามสถานะสัญญา', () => {
  it('กด Active แล้วเหลือเฉพาะผู้เช่าที่สัญญายังไม่จบ', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Active' }))

    await waitFor(() => {
      // อาริสามีแต่สัญญาที่จบไปแล้ว จึงต้องหายไปจากรายการ
      expect(screen.queryByText('อาริสา พงษ์ศิริ')).not.toBeInTheDocument()
    })
    expect(screen.getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    expect(screen.getByText('เคนจิ ซาโต้')).toBeInTheDocument()
  })

  it('กด Ended แล้วเหลือเฉพาะผู้เช่าที่สัญญาสิ้นสุดแล้ว', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Ended' }))

    await waitFor(() => {
      expect(screen.queryByText('ยูกิ ทานากะ')).not.toBeInTheDocument()
    })
    expect(screen.getByText('อาริสา พงษ์ศิริ')).toBeInTheDocument()
  })

  it('ผู้เช่าที่ยังไม่เคยมีสัญญาไม่โผล่ทั้งใน Active และ Ended', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // ธนกฤตอยู่ในระบบแต่ยังไม่มีสัญญา
    expect(screen.getByText('ธนกฤต วัฒนชัย')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Active' }))
    await waitFor(() => {
      expect(screen.queryByText('ธนกฤต วัฒนชัย')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Ended' }))
    await waitFor(() => {
      expect(screen.queryByText('ธนกฤต วัฒนชัย')).not.toBeInTheDocument()
    })
  })

  it('กลับไป All Status แล้วเห็นทุกคนเหมือนเดิม', async () => {
    const user = userEvent.setup()
    await renderTenants()
    const total = visibleTenantNames().length

    await user.click(screen.getByRole('button', { name: 'Active' }))
    await waitFor(() => {
      expect(visibleTenantNames().length).toBeLessThan(total)
    })

    await user.click(screen.getByRole('button', { name: 'All Status' }))
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(total)
    })
  })
})

describe('คอลัมน์ที่ดึงมาจากสัญญาเช่า', () => {
  it('แสดงเลขห้องและค่าเช่าของสัญญาล่าสุด ไม่ใช่ขีดว่างเหมือนก่อนมีตาราง lease', async () => {
    await renderTenants()

    const row = screen.getByText('ยูกิ ทานากะ').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('102')).toBeInTheDocument()
    expect(within(row!).getByText('3,500.00')).toBeInTheDocument()
  })

  it('ผู้เช่าที่ยังไม่มีสัญญาต้องบอกตรง ๆ ว่ายังไม่มีสัญญา', async () => {
    await renderTenants()

    const row = screen.getByText('ธนกฤต วัฒนชัย').closest('tr')
    expect(within(row!).getByText('ยังไม่มีสัญญา')).toBeInTheDocument()
  })
})
