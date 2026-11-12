import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createLease, fetchApartmentConfig, updateLease } from '../api/client'
import type { Lease, RoomSummary, Tenant } from '../api/types'
import { ContractFormDialog } from './ContractFormDialog'

/*
  SSK-180 เงื่อนไขการเงินของสัญญา (รอบบิล เงินประกัน) แก้ได้ตอนสร้างเท่านั้น
  backend (#198) ตอบ 409 ถ้าแก้สัญญาเดิมแล้วส่งค่าที่ต่างจากเดิม ส่งค่าเดิมกลับไปผ่าน
  เทสนี้ล็อกว่าหน้าเว็บไม่เปิดให้แก้สองช่องนี้ในโหมดแก้ และส่งค่าเดิมกลับไปทุกครั้ง
*/

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    createLease: vi.fn(),
    updateLease: vi.fn(),
    fetchApartmentConfig: vi.fn(),
  }
})

const mockedCreateLease = vi.mocked(createLease)
const mockedUpdateLease = vi.mocked(updateLease)
const mockedFetchConfig = vi.mocked(fetchApartmentConfig)

const ROOM: RoomSummary = {
  id: 5,
  roomNumber: '105',
  floor: 1,
  roomType: 'SINGLE',
  baseRent: 5000,
  status: 'AVAILABLE',
  currentLease: null,
  openMaintenanceCount: 0,
  openMaintenanceTitle: null,
}

const TENANT: Tenant = {
  id: 3,
  fullName: 'Kant S.',
  email: null,
  phone: '0891234567',
  nationalId: '3500100123457',
}

const LEASE: Lease = {
  id: 42,
  roomId: 5,
  roomNumber: '105',
  tenantId: 3,
  tenantName: 'Kant S.',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: 5000,
  billingCycle: 'YEARLY',
  status: 'ACTIVE',
  securityDeposit: 12000,
  electricRatePerUnit: 8,
  waterRatePerUnit: 18,
  commonAreaFee: 300,
}

function renderDialog(lease?: Lease) {
  const onSaved = vi.fn()
  render(
    <ContractFormDialog
      lease={lease}
      rooms={[ROOM]}
      tenants={[TENANT]}
      existingLeases={lease ? [lease] : []}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  return { user: userEvent.setup(), onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedFetchConfig.mockResolvedValue({
    electricRatePerUnit: 8,
    waterRatePerUnit: 18,
    commonAreaFee: 300,
    internetFee: 200,
    updatedAt: '2026-01-01T00:00:00Z',
  })
})

describe('ContractFormDialog · Edit Contract (SSK-180)', () => {
  it('shows billing cycle and security deposit as locked values, not inputs', () => {
    renderDialog(LEASE)

    const cycle = screen.getByLabelText(/Billing Cycle/)
    expect(cycle).toHaveValue('Yearly')
    expect(cycle).toHaveAttribute('readonly')

    const deposit = screen.getByLabelText(/Security Deposit/)
    expect(deposit).toHaveValue('฿12,000.00')
    expect(deposit).toHaveAttribute('readonly')
    expect(screen.getByText(/end this contract and create a new one/)).toBeInTheDocument()
  })

  it('does not change the deposit when someone types into the locked field', async () => {
    const { user } = renderDialog(LEASE)

    const deposit = screen.getByLabelText(/Security Deposit/)
    await user.type(deposit, '999')

    expect(deposit).toHaveValue('฿12,000.00')
  })

  it('sends the locked billing cycle and deposit back unchanged so the backend accepts the edit', async () => {
    mockedUpdateLease.mockResolvedValue(LEASE)
    const { user, onSaved } = renderDialog(LEASE)

    // Dates are still editable, so change one to prove the rest of the edit goes through.
    const end = screen.getByLabelText(/End Date/)
    await user.clear(end)
    await user.type(end, '2027-06-30')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockedUpdateLease).toHaveBeenCalledTimes(1))
    const [id, body] = mockedUpdateLease.mock.calls[0]
    expect(id).toBe(42)
    expect(body).toMatchObject({
      endDate: '2027-06-30',
      billingCycle: 'YEARLY',
      securityDeposit: 12000,
      electricRatePerUnit: 8,
      waterRatePerUnit: 18,
    })
    expect(body.commonAreaFee).toBeUndefined()
    expect(onSaved).toHaveBeenCalled()
  })

  it('leaves the deposit out when an older contract has none, so the backend keeps its own value', async () => {
    mockedUpdateLease.mockResolvedValue(LEASE)
    const { user } = renderDialog({ ...LEASE, securityDeposit: undefined })

    expect(screen.getByLabelText(/Security Deposit/)).toHaveValue('Not available')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockedUpdateLease).toHaveBeenCalledTimes(1))
    expect(mockedUpdateLease.mock.calls[0][1].securityDeposit).toBeUndefined()
  })

  it('shows the backend message if a financial change is still refused', async () => {
    // ประโยคจริงจาก LeaseService.LOCKED_TERM ใน #198 ถ้า backend เปลี่ยนถ้อยคำ ให้แก้ตรงนี้ตาม
    const refused =
      'Security deposit is locked into this lease and cannot be changed. End this lease and create a new one with the new terms'
    mockedUpdateLease.mockRejectedValue(new ApiError(409, refused))
    const { user, onSaved } = renderDialog(LEASE)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText(refused)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('ContractFormDialog · Create Contract', () => {
  it('keeps billing cycle and security deposit editable', () => {
    renderDialog()

    expect(screen.getByLabelText(/Security Deposit/)).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText(/Security Deposit/)).toHaveValue(10000)
    expect(screen.queryByText(/end this contract and create a new one/)).not.toBeInTheDocument()
  })

  it('sends the deposit the admin typed', async () => {
    mockedCreateLease.mockResolvedValue(LEASE)
    const { user } = renderDialog()

    const deposit = screen.getByLabelText(/Security Deposit/)
    await user.clear(deposit)
    await user.type(deposit, '7500')
    await user.click(screen.getByRole('button', { name: 'Create Contract' }))

    await waitFor(() => expect(mockedCreateLease).toHaveBeenCalledTimes(1))
    expect(mockedCreateLease.mock.calls[0][0]).toMatchObject({
      roomId: 5,
      tenantId: 3,
      billingCycle: 'MONTHLY',
      securityDeposit: 7500,
    })
  })
})

describe('ContractFormDialog · rules and fallbacks', () => {
  const OTHER_ROOM: RoomSummary = { ...ROOM, id: 6, roomNumber: '106', baseRent: 6000 }

  function renderWith(props: Partial<Parameters<typeof ContractFormDialog>[0]> = {}) {
    const onSaved = vi.fn()
    render(
      <ContractFormDialog
        rooms={[ROOM, OTHER_ROOM]}
        tenants={[TENANT]}
        existingLeases={[]}
        onClose={vi.fn()}
        onSaved={onSaved}
        {...props}
      />,
    )
    return { user: userEvent.setup(), onSaved }
  }

  it('asks to add a tenant first when there are none', async () => {
    const { user } = renderWith({ tenants: [] })
    await user.click(screen.getByRole('button', { name: 'Create Contract' }))
    expect(await screen.findByText('No tenants available in the system. Please add a tenant first.')).toBeInTheDocument()
    expect(mockedCreateLease).not.toHaveBeenCalled()
  })

  it('refuses dates that overlap another lease on the same room', async () => {
    const other = { ...LEASE, id: 77, tenantName: 'Yuki T.', startDate: '2026-01-01', endDate: null }
    const { user } = renderWith({ existingLeases: [other] })
    await user.click(screen.getByRole('button', { name: 'Create Contract' }))
    expect(await screen.findByText(/Unit 105 is not available from 2026-01-01 to no end date because Yuki T\./)).toBeInTheDocument()
  })

  it('resets the deposit to two months of the new room rent when the room changes', async () => {
    mockedCreateLease.mockResolvedValue(LEASE)
    const { user } = renderWith()

    fireEvent.change(document.getElementById('unit-select') ?? screen.getAllByRole('combobox')[0], { target: { value: '6' } })
    expect(screen.getByLabelText(/Security Deposit/)).toHaveValue(12000)

    fireEvent.change(document.getElementById('billing-cycle')!, { target: { value: 'YEARLY' } })
    await user.click(screen.getByRole('button', { name: 'Create Contract' }))

    await waitFor(() => expect(mockedCreateLease).toHaveBeenCalled())
    expect(mockedCreateLease.mock.calls[0][0]).toMatchObject({ roomId: 6, billingCycle: 'YEARLY', securityDeposit: 12000 })
  })

  it('leaves the deposit, common fee and rates out when they are blank or not loaded', async () => {
    mockedFetchConfig.mockRejectedValue(new ApiError(500, 'Config down'))
    mockedCreateLease.mockResolvedValue(LEASE)
    const { user } = renderWith()

    await user.clear(screen.getByLabelText(/Security Deposit/))
    // ช่องว่างติด required ของเบราว์เซอร์ ส่งฟอร์มตรง ๆ เพื่อดูว่าโค้ดไม่ส่งค่าว่างไป backend
    fireEvent.submit(screen.getByLabelText(/Security Deposit/).closest('form')!)

    await waitFor(() => expect(mockedCreateLease).toHaveBeenCalled())
    const payload = mockedCreateLease.mock.calls[0][0]
    expect(payload.securityDeposit).toBeUndefined()
    expect(payload.commonAreaFee).toBeUndefined()
    expect(payload.electricRatePerUnit).toBeUndefined()
    expect(payload.waterRatePerUnit).toBeUndefined()
  })

  it('locks the common fee of an older contract as Not available and shows the edit error', async () => {
    mockedUpdateLease.mockRejectedValue(new TypeError('Failed to fetch'))
    const { user } = renderWith({ lease: { ...LEASE, commonAreaFee: undefined }, existingLeases: [LEASE] })

    expect(screen.getAllByDisplayValue('Not available').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Failed to update contract.')).toBeInTheDocument()
  })

  it('keeps the per-unit rate choice when the admin picks it again', async () => {
    mockedCreateLease.mockResolvedValue(LEASE)
    const { user } = renderWith()
    await screen.findAllByText('Per unit - ฿18.00')

    fireEvent.change(document.getElementById('water-billing')!, { target: { value: 'Per unit - ฿18.00' } })
    fireEvent.change(document.getElementById('electric-billing')!, { target: { value: 'Per unit - ฿8.00' } })
    await user.click(screen.getByRole('button', { name: 'Create Contract' }))

    await waitFor(() => expect(mockedCreateLease).toHaveBeenCalled())
    expect(mockedCreateLease.mock.calls[0][0]).toMatchObject({ waterRatePerUnit: 18, electricRatePerUnit: 8 })
  })
})
