import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import { updateApartmentConfig } from '../api/client'
import ContractsPage from './ContractsPage'

/**
 * Tests Contract Management against the Figma design, including Edit mode,
 * three action buttons, Create Contract, Edit Contract, View PDF, and Contract Template.
 */

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

describe('Contract Management list', () => {
  it('renders the contract list correctly', async () => {
    await renderContracts()

    expect(screen.getByText('Contract Management')).toBeInTheDocument()
    expect(screen.getByText('Create Contract')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()

    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Arisa Fujimoto')).toBeInTheDocument()
    expect(within(rowOf('Yuki Tanaka')).getByText(/Unit 4A - Sakura Wing/)).toBeInTheDocument()
  })

  it('enters Edit mode and shows all three action buttons', async () => {
    const user = userEvent.setup()
    await renderContracts()

    // Click Edit.
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    // Cancel and Done must be available.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    // Each row must show all three actions.
    const row = rowOf('Yuki Tanaka')
    expect(within(row).getByLabelText('Edit contract for Unit 102')).toBeInTheDocument()
    expect(within(row).getByLabelText('Upload signed contract for Unit 102')).toBeInTheDocument()
    expect(within(row).getByLabelText('Contract template for Unit 102')).toBeInTheDocument()
  })

  it('opens the Create Contract modal from the Create Contract button', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })
    expect(within(dialog).getByRole('heading', { name: 'Create Contract' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Unit/)).toBeInTheDocument()
  })

  it('opens the Residential Lease Agreement preview from Print/PDF', async () => {
    const user = userEvent.setup()
    await renderContracts()

    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByRole('button', { name: 'View contract for Unit 102' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract PDF Preview' })
    expect(within(dialog).getByText('Residential Lease Agreement')).toBeInTheDocument()
    expect(within(dialog).getByText('Save as PDF')).toBeInTheDocument()
  })

  it('opens the Contract Template modal from the third Edit mode action', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Contract template for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Contract Template' })
    expect(within(dialog).getByText('Contract Template')).toBeInTheDocument()
    expect(within(dialog).getByText(/Available variables/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Save Template/)).toBeInTheDocument()
  })

  it('edits a contract from Edit mode', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Edit contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    expect(within(dialog).getByRole('heading', { name: 'Edit Contract' })).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/Rent Amount/), { target: { value: '42000' } })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

describe('แก้บั๊ค SSK-112 ฟอร์ม Create/Edit Contract', () => {
  it('Line ID ไม่บังคับกรอก ลบทิ้งแล้วยังบันทึกสัญญาได้', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Edit contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    const lineId = within(dialog).getByLabelText(/Line ID/)
    const label = dialog.querySelector(`label[for="${lineId.id}"]`)
    expect(label).toHaveTextContent('(optional)')
    expect(label?.textContent).not.toContain('*')

    await user.clear(lineId)
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('ตอนสร้างใหม่ เปลี่ยน Room Type แล้ว Rent Amount เติมค่าตั้งต้นตามประเภทห้อง', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    await user.selectOptions(within(dialog).getByLabelText(/Room Type/), 'DOUBLE')

    expect(within(dialog).getByLabelText(/Rent Amount/)).toHaveValue(4500)
    expect(within(dialog).getByLabelText(/Security Deposit/)).toHaveValue(9000)
  })

  /*
    ทีมทักว่าสองช่องนี้แก้ค่าเองไม่ได้จริง เพราะ Room Type เขียนทับตลอด
    ค่าตามประเภทห้องต้องเป็นแค่ค่าตั้งต้น ไม่ใช่ค่าที่ล็อกตายตัว
  */
  it('พิมพ์ค่าเช่าเองแล้ว เปลี่ยน Room Type ต้องไม่เขียนทับค่าที่พิมพ์', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    const rentAmount = within(dialog).getByLabelText(/Rent Amount/)
    await user.clear(rentAmount)
    await user.type(rentAmount, '9999')

    await user.selectOptions(within(dialog).getByLabelText(/Room Type/), 'DOUBLE')

    expect(rentAmount).toHaveValue(9999)
  })

  it('พิมพ์เงินมัดจำเองแล้ว ค่าเช่าที่พิมพ์ทีหลังต้องไม่คำนวณทับ', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    const securityDeposit = within(dialog).getByLabelText(/Security Deposit/)
    await user.clear(securityDeposit)
    await user.type(securityDeposit, '1000')

    const rentAmount = within(dialog).getByLabelText(/Rent Amount/)
    await user.clear(rentAmount)
    await user.type(rentAmount, '6000')

    expect(securityDeposit).toHaveValue(1000)
    expect(rentAmount).toHaveValue(6000)
  })

  it('ตอนแก้สัญญาเดิม เปลี่ยน Room Type ต้องไม่ทับค่าที่บันทึกไว้ และยังพิมพ์แก้ได้', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Edit contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    const rentAmount = within(dialog).getByLabelText(/Rent Amount/)
    const savedRent = (rentAmount as HTMLInputElement).value

    await user.selectOptions(within(dialog).getByLabelText(/Room Type/), 'SINGLE')
    expect(rentAmount).toHaveValue(Number(savedRent))

    await user.clear(rentAmount)
    await user.type(rentAmount, '12345')
    expect(rentAmount).toHaveValue(12345)
  })

  it('เปลี่ยน Unit แล้ว Room Type กับ Rent Amount ต้องซิงก์ตามห้องที่เลือกจริง', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    const unitSelect = within(dialog).getByLabelText(/Unit/)
    // ห้อง 104 เป็นห้องคู่และว่างอยู่ (ไม่มีสัญญา active ผูกอยู่)
    await user.selectOptions(unitSelect, screen.getByRole('option', { name: /104 · Floor 1/ }))

    expect(within(dialog).getByLabelText(/Room Type/)).toHaveValue('DOUBLE')
    expect(within(dialog).getByLabelText(/Rent Amount/)).toHaveValue(4500)
    expect(within(dialog).getByLabelText(/Security Deposit/)).toHaveValue(9000)
  })

  it('ลบเลข 0 ในช่อง Rent Amount, Security Deposit, Common Area Fee ออกได้หมด ไม่ค้าง 0', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    const rentAmount = within(dialog).getByLabelText(/Rent Amount/)
    const securityDeposit = within(dialog).getByLabelText(/Security Deposit/)
    const commonFee = within(dialog).getByLabelText(/Common Area Fee/)

    await user.clear(rentAmount)
    await user.clear(securityDeposit)
    await user.clear(commonFee)

    expect(rentAmount).toHaveValue(null)
    expect(securityDeposit).toHaveValue(null)
    expect(commonFee).toHaveValue(null)

    await user.type(rentAmount, '4200')
    expect(rentAmount).toHaveValue(4200)
  })

  it('Water/Electric Billing Type ดึงอัตราจริงจาก Apartment Config มาแสดง', async () => {
    const user = userEvent.setup()
    await updateApartmentConfig({
      electricRatePerUnit: 50,
      waterRatePerUnit: 100,
      commonAreaFee: 300,
      internetFee: 250,
    })
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    expect(
      await within(dialog).findByRole('option', { name: 'Per unit - ¥50.00' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: 'Per unit - ¥100.00' })).toBeInTheDocument()
  })
})
