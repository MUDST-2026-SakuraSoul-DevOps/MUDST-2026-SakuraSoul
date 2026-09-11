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
  await screen.findByText('Yuki Tanaka')
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

    await user.type(screen.getByLabelText('Search tenants by name or unit'), 'Kenji')

    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('Kenji Sato')
  })

  it('ค้นหาด้วยเลขห้องก็เจอผู้เช่าของห้องนั้น', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('Search tenants by name or unit'), '207')

    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('Hiroshi Nakamura')
  })

  it('ค้นหาแล้วไม่เจอใคร ต้องบอกว่าไม่พบ ไม่ใช่ปล่อยตารางว่าง', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('Search tenants by name or unit'), 'no such tenant name')

    expect(await screen.findByText('No tenants match your search')).toBeInTheDocument()
  })
})

describe('US-07-S2 กรองตามสถานะสัญญา', () => {
  it('กด Active แล้วเหลือเฉพาะผู้เช่าที่สัญญายังไม่จบ', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Active' }))

    await waitFor(() => {
      // อาริสามีแต่สัญญาที่จบไปแล้ว จึงต้องหายไปจากรายการ
      expect(screen.queryByText('Arisa Fujimoto')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })

  it('กด Ended แล้วเหลือเฉพาะผู้เช่าที่สัญญาสิ้นสุดแล้ว', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Ended' }))

    await waitFor(() => {
      expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Arisa Fujimoto')).toBeInTheDocument()
  })

  it('ผู้เช่าที่ยังไม่เคยมีสัญญาไม่โผล่ทั้งใน Active และ Ended', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // ธนกฤตอยู่ในระบบแต่No lease
    expect(screen.getByText('Haruto Watanabe')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Active' }))
    await waitFor(() => {
      expect(screen.queryByText('Haruto Watanabe')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Ended' }))
    await waitFor(() => {
      expect(screen.queryByText('Haruto Watanabe')).not.toBeInTheDocument()
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

    const row = screen.getByText('Yuki Tanaka').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('102')).toBeInTheDocument()
    expect(within(row!).getByText('3,500')).toBeInTheDocument()
  })

  it('ผู้เช่าที่No leaseต้องบอกตรง ๆ ว่าNo lease', async () => {
    await renderTenants()

    const row = screen.getByText('Haruto Watanabe').closest('tr')
    expect(within(row!).getByText('No lease')).toBeInTheDocument()
  })
})

describe('US-03 เพิ่มผู้เช่าใหม่', () => {
  it('S1 กรอกครบแล้วบันทึก ผู้เช่าใหม่โผล่ในรายชื่อทันที', async () => {
    const user = userEvent.setup()
    await renderTenants()
    expect(screen.queryByText('Mika Sato')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/ }))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText(/Full Name/), 'Mika Sato')
    await user.type(within(dialog).getByLabelText(/Email/), 'manee@example.com')
    await user.type(within(dialog).getByLabelText(/Phone Number/), '089-111-2222')
    await user.click(within(dialog).getByRole('button', { name: 'Save Tenant' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Mika Sato')).toBeInTheDocument()
  })

  it('S1 เลขบัตรประชาชนไม่บังคับ ไม่กรอกก็บันทึกได้', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Full Name/), 'Sora Kimura')
    await user.type(within(dialog).getByLabelText(/Email/), 'piti@example.com')
    await user.type(within(dialog).getByLabelText(/Phone Number/), '089-333-4444')
    await user.click(within(dialog).getByRole('button', { name: 'Save Tenant' }))

    expect(await screen.findByText('Sora Kimura')).toBeInTheDocument()
  })

  it('S2 ไม่กรอกชื่อ ต้องเตือนและไม่บันทึก', async () => {
    const user = userEvent.setup()
    await renderTenants()
    const before = visibleTenantNames().length

    await user.click(screen.getByRole('button', { name: /Add New Tenant/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Email/), 'noname@example.com')
    await user.type(within(dialog).getByLabelText(/Phone Number/), '089-555-6666')
    await user.click(within(dialog).getByRole('button', { name: 'Save Tenant' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter the full name')
    // ป็อปอัปยังเปิดอยู่ให้กรอกต่อ และรายชื่อไม่เพิ่ม
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(before)
    })
  })

  it('S2 อีเมลผิดรูปแบบ ต้องเตือน', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Full Name/), 'Nanami Aoki')
    await user.type(within(dialog).getByLabelText(/Email/), 'somying-at-example')
    await user.type(within(dialog).getByLabelText(/Phone Number/), '089-777-8888')
    await user.click(within(dialog).getByRole('button', { name: 'Save Tenant' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That email address is not valid')
  })

  it('ตารางแสดงอีเมลใต้ชื่อ เพราะเป็นข้อมูลที่ใช้ส่งเอกสารให้ผู้เช่า', async () => {
    await renderTenants()
    const row = screen.getByText('Yuki Tanaka').closest('tr')
    expect(within(row!).getByText('yuki.t@example.com')).toBeInTheDocument()
  })
})
