import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import ContractsPage from './ContractsPage'

/**
 * เทสหน้าจัดการสัญญาเช่า ตรงกับ Figma ดีไซน์
 * รองรับ Edit mode, 3 action buttons, Create Contract, Edit Contract, View PDF, Contract Template
 */

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

describe('รายการสัญญา Contract Management', () => {
  it('แสดงรายการสัญญาถูกต้อง', async () => {
    await renderContracts()

    expect(screen.getByText('Contract Management')).toBeInTheDocument()
    expect(screen.getByText('Create Contract')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()

    expect(screen.getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    expect(screen.getByText('อาริสา พงษ์ศิริ')).toBeInTheDocument()
    expect(within(rowOf('ยูกิ ทานากะ')).getByText(/Unit 4A - Sakura Wing/)).toBeInTheDocument()
  })

  it('สามารถเปิดโหมด Edit เพื่อแสดงครบ 3 Action buttons ได้', async () => {
    const user = userEvent.setup()
    await renderContracts()

    // กดปุ่ม Edit
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    // ต้องมีปุ่ม Cancel และ Done
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    // ในแถวต้องมีปุ่ม Action ทั้ง 3
    const row = rowOf('ยูกิ ทานากะ')
    expect(within(row).getByLabelText('Edit contract for Unit 102')).toBeInTheDocument()
    expect(within(row).getByLabelText('Upload signed contract for Unit 102')).toBeInTheDocument()
    expect(within(row).getByLabelText('Contract template for Unit 102')).toBeInTheDocument()
  })

  it('กดปุ่ม Create Contract แล้วเปิด Modal สร้างสัญญา', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: /Create Contract/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Create Contract' })
    expect(within(dialog).getByRole('heading', { name: 'Create Contract' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Unit/)).toBeInTheDocument()
  })

  it('กดปุ่ม Print/PDF แล้วเปิด Modal พรีวิวสัญญา Residential Lease Agreement', async () => {
    const user = userEvent.setup()
    await renderContracts()

    const row = rowOf('ยูกิ ทานากะ')
    await user.click(within(row).getByRole('button', { name: 'View contract for Unit 102' }))

    const dialog = await screen.findByRole('dialog', { name: 'Contract PDF Preview' })
    expect(within(dialog).getByText('Residential Lease Agreement')).toBeInTheDocument()
    expect(within(dialog).getByText('Save as PDF')).toBeInTheDocument()
  })

  it('ในโหมด Edit กด Action 3 แล้วเปิด Modal Contract Template', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('ยูกิ ทานากะ')
    await user.click(within(row).getByLabelText('Contract template for Unit 102'))

    const dialog = await screen.findByRole('dialog', { name: 'Contract Template' })
    expect(within(dialog).getByText('Contract Template')).toBeInTheDocument()
    expect(within(dialog).getByText(/Available variables/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Save Template/)).toBeInTheDocument()
  })

  it('ในโหมด Edit กด Edit แล้วแก้ไขสัญญาได้', async () => {
    const user = userEvent.setup()
    await renderContracts()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const row = rowOf('ยูกิ ทานากะ')
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
