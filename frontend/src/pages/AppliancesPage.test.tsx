import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import AppliancesPage from './AppliancesPage'

/**
 * เทสหน้า Appliance Rental ครอบ SSK-96 ที่ QA แจ้งว่าปุ่มหลักกดไม่ได้ทั้งสองแท็บ
 *
 * หน้านี้ยังไม่มี endpoint ฝั่ง backend ข้อมูลอยู่ใน state ของหน้า เทสจึงพิสูจน์
 * ว่าป็อปอัปต่อสายกับตารางถูกต้อง ซึ่งเป็นส่วนที่จะพังเงียบที่สุดตอนย้ายไปใช้
 * API จริง ถ้าปุ่มเปิดป็อปอัปได้แต่บันทึกแล้วตารางไม่ขยับ จะไม่มีใครเห็นจนกดเอง
 */

async function openPage() {
  const user = userEvent.setup()
  render(<AppliancesPage />)
  await screen.findByRole('table')
  return user
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

beforeEach(() => {
  resetMockStore()
})

describe('SSK-96 แท็บ Rental Requests', () => {
  it('กดปุ่ม New Request แล้วป็อปอัปเปิดจริง', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'New Appliance Request' })).toBeInTheDocument()
  })

  it('สร้างใบขอเช่าแล้วขึ้นในตาราง และการ์ดสรุปขยับตาม', async () => {
    const user = await openPage()
    expect(rows()).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('option', { name: '105' })

    await user.selectOptions(within(dialog).getByLabelText('Room *'), '105')
    await user.selectOptions(within(dialog).getByLabelText('Appliance *'), 'AP-011')
    await user.type(within(dialog).getByLabelText('Start Date *'), '2026-10-05')
    await user.click(within(dialog).getByRole('button', { name: 'Create Request' }))

    expect(rows()).toHaveLength(4)
    const added = screen.getByText('105').closest('tr')
    expect(within(added as HTMLElement).getByText('¥350')).toBeInTheDocument()
  })

  /**
   * ค่าเช่ากับมัดจำเป็นช่องอ่านอย่างเดียวที่เติมจากแคตตาล็อก ดีไซน์เขียนกำกับว่า
   * "From catalog rate" ถ้าแก้เองได้ ราคาที่คิดกับผู้เช่าจะไม่ตรงกับที่ประกาศไว้
   */
  it('ค่าเช่ากับมัดจำเติมจากแคตตาล็อกเอง และแก้เองไม่ได้', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('option', { name: '105' })
    await user.selectOptions(within(dialog).getByLabelText('Appliance *'), 'AP-011')

    const fee = within(dialog).getByLabelText(/Monthly Fee/)
    const deposit = within(dialog).getByLabelText(/Deposit/)
    expect(fee).toHaveValue('¥350')
    expect(deposit).toHaveValue('¥2,000')
    expect(fee).toHaveAttribute('readonly')
    expect(deposit).toHaveAttribute('readonly')
  })

  it('ไม่เลือกห้องแล้วบันทึกไม่ได้', async () => {
    const user = await openPage()

    await user.click(screen.getByRole('button', { name: /New Request/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Create Request' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please choose a room')
    expect(rows()).toHaveLength(3)
  })

  it('กดปุ่ม Delete ในแถบ Action แล้วเปิด Pop up Confirm Delete Rental Request และลบได้สำเร็จ (BUG-A2)', async () => {
    const user = await openPage()
    expect(rows()).toHaveLength(3)

    // กดปุ่ม Delete ของห้อง 101
    const deleteBtn = screen.getByRole('button', { name: 'Delete request for unit 101' })
    await user.click(deleteBtn)

    // เปิดโมดอลยืนยันการลบ
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Confirm Delete Rental Request' })).toBeInTheDocument()
    expect(within(dialog).getByText(/Are you sure you want to delete/)).toBeInTheDocument()
    expect(within(dialog).getAllByText('Unit 101').length).toBeGreaterThan(0)


    // กดยืนยันการลบ
    await user.click(within(dialog).getByRole('button', { name: 'Confirm Delete' }))

    // โมดอลปิด และแถวห้อง 101 หายไปจากตาราง
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    expect(screen.queryByText('101')).not.toBeInTheDocument()
  })

  it('กดยกเลิกใน Pop up Confirm Delete แล้วคำขอยังคงอยู่ในตาราง (BUG-A2)', async () => {
    const user = await openPage()
    expect(rows()).toHaveLength(3)

    const deleteBtn = screen.getByRole('button', { name: 'Delete request for unit 101' })
    await user.click(deleteBtn)

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rows()).toHaveLength(3)
    expect(screen.getByText('101')).toBeInTheDocument()
  })
})


describe('SSK-96 แท็บ Appliance Catalog', () => {
  async function openCatalog() {
    const user = await openPage()
    await user.click(screen.getByRole('button', { name: 'Appliance Catalog' }))
    return user
  }

  it('กดปุ่ม Add Appliance แล้วป็อปอัปเปิดจริง', async () => {
    const user = await openCatalog()

    await user.click(screen.getByRole('button', { name: /Add Appliance/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Add Appliance' })).toBeInTheDocument()
  })

  it('เพิ่มรายการใหม่แล้วได้ SKU อัตโนมัติตามหมวด', async () => {
    const user = await openCatalog()
    expect(rows()).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: /Add Appliance/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Appliance name *'), 'Air Purifier')
    await user.selectOptions(within(dialog).getByLabelText(/Category \*/), 'Bedroom')
    await user.click(within(dialog).getByRole('button', { name: 'Add Appliance' }))

    expect(rows()).toHaveLength(6)
    const added = screen.getByText('Air Purifier').closest('tr')
    expect(within(added as HTMLElement).getByText('SKU: BE-001')).toBeInTheDocument()
  })

  it('กดดินสอแล้วแก้รายการเดิม ไม่ได้เพิ่มแถวใหม่', async () => {
    const user = await openCatalog()

    await user.click(screen.getByRole('button', { name: 'Edit Pocket Wi-Fi' }))
    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText('Appliance name *')
    await user.clear(name)
    await user.type(name, 'Pocket Wi-Fi 5G')
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    expect(rows()).toHaveLength(5)
    expect(screen.getByText('Pocket Wi-Fi 5G')).toBeInTheDocument()
    expect(screen.queryByText('Pocket Wi-Fi')).not.toBeInTheDocument()
  })

  /**
   * แจ้งเตือนของใกล้หมดที่ตั้งสูงกว่าจำนวนที่มีทั้งหมดจะติดป้ายตลอดเวลา
   * ซึ่งทำให้ป้ายหมดความหมาย คนใช้จะเลิกสนใจไปเลย
   */
  it('ตั้งแจ้งเตือนของใกล้หมดสูงกว่าจำนวนที่มี ต้องเตือนและไม่บันทึก', async () => {
    const user = await openCatalog()

    await user.click(screen.getByRole('button', { name: /Add Appliance/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Appliance name *'), 'Heater')
    const owned = within(dialog).getByLabelText(/Quantity owned \*/)
    await user.clear(owned)
    await user.type(owned, '2')
    const low = within(dialog).getByLabelText(/Low stock alert at/)
    await user.clear(low)
    await user.type(low, '5')
    await user.click(within(dialog).getByRole('button', { name: 'Add Appliance' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'cannot be higher than the quantity owned',
    )
    expect(screen.queryByText('Heater')).not.toBeInTheDocument()
  })
})
