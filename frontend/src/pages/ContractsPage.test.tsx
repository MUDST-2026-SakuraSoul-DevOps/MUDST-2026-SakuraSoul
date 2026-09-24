import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import { createLease, fetchRooms, updateApartmentConfig, updateTenant } from '../api/client'
import ContractsPage from './ContractsPage'

/**
 * Covers the Contract Management page and its Figma design.
 * Includes Edit mode, its three actions, Create Contract, Edit Contract, PDF preview, and Contract Template.
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
    expect(within(rowOf('Yuki Tanaka')).getByText('Unit 102 · Floor 1')).toBeInTheDocument()
  })

  it('shows each contract from its real lease and unit, not from the tenant name (SSK-127)', async () => {
    await renderContracts()

    // 102 เป็นห้อง Double ค่าเช่าที่ล็อกไว้ 4,500 และสัญญาจบในอีก 12 วัน
    const yuki = rowOf('Yuki Tanaka')
    expect(within(yuki).getByText('Double Bedroom')).toBeInTheDocument()
    expect(within(yuki).getByText('฿4,500.00')).toBeInTheDocument()
    expect(within(yuki).getByText('Rent / month')).toBeInTheDocument()
    expect(within(yuki).getByText('Ending Soon')).toBeInTheDocument()

    // 201 เป็นห้อง Single ไม่มีค่าที่เขียนตายตัวตามชื่อ Sato (500,000 Annual Rent / Pending Signature) อีกแล้ว
    const kenji = rowOf('Kenji Sato')
    expect(within(kenji).getByText('Single Bedroom')).toBeInTheDocument()
    expect(within(kenji).getByText('฿3,500.00')).toBeInTheDocument()
    expect(within(kenji).getByText('Active')).toBeInTheDocument()
    expect(within(kenji).queryByText(/500,000|Pending Signature/)).not.toBeInTheDocument()

    // สัญญารายปีบอกที่ label ไม่คูณ 12 เอง
    expect(within(rowOf('Aiko Tanaka')).getByText('Rent / month · billed yearly')).toBeInTheDocument()
    expect(within(rowOf('Arisa Fujimoto')).getByText('Ended')).toBeInTheDocument()
  })

  it('enters Edit mode and shows the three actions: Edit, Upload, Contract Template', async () => {
    const user = userEvent.setup()
    await renderContracts()

    // Enter Edit mode.
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    // Edit mode provides both Cancel and Done controls.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    // Each row exposes all three actions (Save/Download live in Contract Preview).
    const row = rowOf('Yuki Tanaka')
    expect(within(row).getByLabelText('Edit contract for Unit 102')).toBeInTheDocument()
    expect(within(row).getByLabelText('Upload signed contract for Unit 102')).toBeInTheDocument()
    expect(within(row).getByLabelText('Contract template for Unit 102')).toBeInTheDocument()
    expect(within(row).queryByLabelText('Save contract for Unit 102')).not.toBeInTheDocument()
  })

  it('opens the Create Contract modal from the Create Contract button', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })
    expect(within(dialog).getByRole('heading', { name: 'Create Contract' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Unit/)).toBeInTheDocument()
  })

  it('opens Contract Preview from the FileText icon outside Edit mode and prints from it (SSK-129)', async () => {
    const user = userEvent.setup()
    await renderContracts()

    const row = rowOf('Yuki Tanaka')
    expect(within(row).queryByRole('button', { name: 'Print contract for Unit 102' })).not.toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Preview contract for Unit 102' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract Preview' })
    expect(within(dialog).getByText('Contract Preview')).toBeInTheDocument()
    expect(within(dialog).getByText('Residential Lease Agreement')).toBeInTheDocument()

    // กดปุ่ม Print Contract จากด้านใน Preview Dialog เพื่อเปิด Print Dialog
    await user.click(within(dialog).getByRole('button', { name: 'Print Contract' }))
    const printDialog = await screen.findByRole('dialog', { name: 'Contract PDF Preview' })
    expect(within(printDialog).getByText('Residential Lease Agreement')).toBeInTheDocument()
  })

  it('สั่งพิมพ์สัญญาจาก Print Preview แล้วซ่อนแถบ Print Sidebar และกรอบป็อปอัปด้วย Print CSS (SSK-115)', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    await renderContracts()

    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByRole('button', { name: 'Preview contract for Unit 102' }))
    const previewDialog = await screen.findByRole('dialog', { name: 'Contract Preview' })
    await user.click(within(previewDialog).getByRole('button', { name: 'Print Contract' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract PDF Preview' })
    const printRoot = dialog.closest('.contract-print-root')
    expect(printRoot).toBeInTheDocument()

    const printSidebar = screen.getByText('Destination').closest('.print\\:hidden')
    expect(printSidebar).toBeInTheDocument()
    expect(printSidebar).toHaveClass('print:hidden')

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
  })

  // SSK-116 แก้อัตราใน Apartment Config แล้ว Print Preview ต้องแสดงค่าใหม่ ไม่ใช่ค่าตายตัวเดิม
  it('อัตราค่าไฟค่าน้ำใน Print Preview ตรงกับที่ตั้งใน Apartment Config', async () => {
    const user = userEvent.setup()
    await updateApartmentConfig({
      electricRatePerUnit: 12.5,
      waterRatePerUnit: 27,
      commonAreaFee: 300,
      internetFee: 250,
    })
    await renderContracts()

    await user.click(within(rowOf('Yuki Tanaka')).getByRole('button', { name: 'Preview contract for Unit 102' }))
    const previewDialog = await screen.findByRole('dialog', { name: 'Contract Preview' })
    await user.click(within(previewDialog).getByRole('button', { name: 'Print Contract' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract PDF Preview' })
    expect(await within(dialog).findByText('฿12.50 per unit')).toBeInTheDocument()
    expect(within(dialog).getByText('฿27.00 per unit')).toBeInTheDocument()
    expect(within(dialog).queryByText('฿8.00 per unit')).not.toBeInTheDocument()
  })

  // SSK-116 ช่องอื่นในเอกสารก็เคยเขียนตายตัวไว้เหมือนกัน ทั้งเลขบัตร เบอร์ ประเภทห้อง ที่อยู่
  it('ข้อมูลผู้เช่าและห้องใน Print Preview มาจากข้อมูลจริง ไม่ใช่ค่าตัวอย่างที่เขียนไว้ในโค้ด', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(within(rowOf('Yuki Tanaka')).getByRole('button', { name: 'Preview contract for Unit 102' }))
    const previewDialog = await screen.findByRole('dialog', { name: 'Contract Preview' })
    await user.click(within(previewDialog).getByRole('button', { name: 'Print Contract' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract PDF Preview' })
    expect(await within(dialog).findByText('1100400123450')).toBeInTheDocument()
    expect(within(dialog).getByText('081-234-5678')).toBeInTheDocument()
    expect(within(dialog).getByText('yuki.t@example.com')).toBeInTheDocument()
    expect(within(dialog).getByText('Double Bedroom')).toBeInTheDocument()
    expect(within(dialog).getByText('Building A, 123 Street')).toBeInTheDocument()

    // ค่าตัวอย่างชุดเดิมต้องไม่หลุดออกมาในเอกสารที่ผู้เช่าเซ็นอีก
    expect(within(dialog).queryByText('1-2345-67890-12-3')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('012-345-6789')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Single / Double Bedroom')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('123 Blossom Lane, Zen District, Tokyo')).not.toBeInTheDocument()
  })

  // ผู้เช่าบางคนยังไม่ยื่นเลขบัตร (nationalId เป็น null) ช่องนั้นต้องไม่ว่างเปล่าในสัญญา
  it('ผู้เช่าที่ยังไม่มีเลขบัตรในระบบ เอกสารต้องบอกว่ายังไม่มีข้อมูล ไม่ใช่เว้นว่าง', async () => {
    const user = userEvent.setup()
    await updateTenant(1, { nationalId: '' })
    await renderContracts()

    await user.click(within(rowOf('Yuki Tanaka')).getByRole('button', { name: 'Preview contract for Unit 102' }))
    const previewDialog = await screen.findByRole('dialog', { name: 'Contract Preview' })
    await user.click(within(previewDialog).getByRole('button', { name: 'Print Contract' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract PDF Preview' })
    expect(await within(dialog).findByText('Not provided')).toBeInTheDocument()
  })

  it('shows a Download (PDF) button in Contract Preview (SSK-129)', async () => {
    const user = userEvent.setup()
    await renderContracts()

    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByRole('button', { name: 'Preview contract for Unit 102' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract Preview' })
    const downloadBtn = within(dialog).getByRole('button', { name: 'Download (PDF)' })
    expect(downloadBtn).toBeInTheDocument()

    // Click Download (PDF)
    await user.click(downloadBtn)
  })

  it('opens the Upload Signed Contract modal from Edit mode (SSK-129)', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Upload signed contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Upload Signed Contract' })
    expect(within(dialog).getByText('Upload Signed Contract')).toBeInTheDocument()
    expect(within(dialog).getByText('Signed contract file')).toBeInTheDocument()
  })

  it('opens the Contract Template modal from the third Edit mode action (SSK-129)', async () => {
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

  it('updates the table after editing a contract tenant and confirming', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(within(rowOf('Yuki Tanaka')).getByLabelText('Edit contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    expect(within(dialog).getByRole('heading', { name: 'Edit Contract' })).toBeInTheDocument()

    await user.selectOptions(within(dialog).getByLabelText(/^Tenant/), '6')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Haruto Watanabe')).toBeInTheDocument()
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
  })

  it('discards edited lease dates after Cancel', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(within(rowOf('Yuki Tanaka')).getByLabelText('Edit contract for Unit 102'))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    const endDate = within(dialog).getByLabelText(/^End Date/)
    const originalEndDate = (endDate as HTMLInputElement).value

    fireEvent.change(endDate, { target: { value: '2027-12-31' } })
    expect(endDate).toHaveValue('2027-12-31')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await user.click(within(rowOf('Yuki Tanaka')).getByLabelText('Edit contract for Unit 102'))
    const reopenedDialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    expect(within(reopenedDialog).getByLabelText(/^End Date/)).toHaveValue(originalEndDate)
  })

  it('keeps the dialog open and shows validation when the end date is before the start date', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(within(rowOf('Yuki Tanaka')).getByLabelText('Edit contract for Unit 102'))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })

    fireEvent.change(within(dialog).getByLabelText(/^Start Date/), { target: { value: '2026-12-31' } })
    fireEvent.change(within(dialog).getByLabelText(/^End Date/), { target: { value: '2026-01-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    expect(await within(dialog).findByText('End Date must not be earlier than Start Date.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Contract' })).toBeInTheDocument()
  })
})

describe('SSK-112 Create/Edit Contract form fixes', () => {
  it('allows saving a contract without a Line ID because it is optional', async () => {
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

  it('Edit Contract shows the locked rent and room type read-only (SSK-127)', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('Yuki Tanaka')
    await user.click(within(row).getByLabelText('Edit contract for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract' })
    const roomType = within(dialog).getByLabelText(/Room Type/)
    const rent = within(dialog).getByLabelText(/Rent Amount/)
    expect(roomType).toHaveValue('Double Bedroom')
    expect(roomType).toHaveAttribute('readonly')
    expect(rent).toHaveValue('฿4,500.00')
    expect(rent).toHaveAttribute('readonly')
    expect(within(dialog).getByLabelText(/Security Deposit/)).toHaveValue(9000)

    // พิมพ์ทับไม่ได้ ค่าเช่าต้องคงเดิม
    await user.type(rent, '999')
    expect(rent).toHaveValue('฿4,500.00')
  })

  it('synchronizes room type and rent amount when the unit changes', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    const unitSelect = within(dialog).getByLabelText(/Unit/)
    // Unit 104 is a vacant double room with no active lease.
    await user.selectOptions(unitSelect, screen.getByRole('option', { name: /104 · Floor 1/ }))

    expect(within(dialog).getByLabelText(/Room Type/)).toHaveValue('Double Bedroom')
    expect(within(dialog).getByLabelText(/Rent Amount/)).toHaveValue('฿4,500.00')
    expect(within(dialog).getByLabelText(/Security Deposit/)).toHaveValue(9000)

    // Unit 101 is a vacant single room: rent and deposit follow it.
    await user.selectOptions(unitSelect, screen.getByRole('option', { name: /101 · Floor 1/ }))
    expect(within(dialog).getByLabelText(/Room Type/)).toHaveValue('Single Bedroom')
    expect(within(dialog).getByLabelText(/Rent Amount/)).toHaveValue('฿3,500.00')
    expect(within(dialog).getByLabelText(/Security Deposit/)).toHaveValue(7000)
  })

  it('allows clearing Security Deposit and Common Area Fee without leaving zero values', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })

    const securityDeposit = within(dialog).getByLabelText(/Security Deposit/)
    const commonFee = within(dialog).getByLabelText(/Common Area Fee/)

    await user.clear(securityDeposit)
    await user.clear(commonFee)

    expect(securityDeposit).toHaveValue(null)
    expect(commonFee).toHaveValue(null)

    await user.type(securityDeposit, '8000')
    expect(securityDeposit).toHaveValue(8000)
  })

  it('shows Water and Electric Billing Type rates from Apartment Config', async () => {
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
      await within(dialog).findByRole('option', { name: 'Per unit - ฿50.00' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: 'Per unit - ฿100.00' })).toBeInTheDocument()
  })

  it('shows only as many page buttons as the contracts need (SSK-115)', async () => {
    await renderContracts()

    // 5 contracts fit on one page: no empty page 2 or 3 to click into
    expect(screen.getByText('Showing 1 to 5 of 5 entries')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: 'Page 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('moves to page 2 when a sixth contract exists and back to page 1 (SSK-115)', async () => {
    const user = userEvent.setup()
    const room104 = (await fetchRooms()).find((room) => room.roomNumber === '104')
    if (!room104) throw new Error('Seed room 104 is missing')
    await createLease({
      roomId: room104.id,
      tenantId: 6,
      startDate: '2026-10-01',
      endDate: '2027-09-30',
      billingCycle: 'MONTHLY',
    })
    await renderContracts()

    expect(screen.getByText('Showing 1 to 5 of 6 entries')).toBeInTheDocument()
    expect(screen.queryByText('Haruto Watanabe')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next page' }))

    expect(screen.getByText('Showing 6 to 6 of 6 entries')).toBeInTheDocument()
    expect(screen.getByText('Haruto Watanabe')).toBeInTheDocument()
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Page 1' }))
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 to 5 of 6 entries')).toBeInTheDocument()
  })
})
