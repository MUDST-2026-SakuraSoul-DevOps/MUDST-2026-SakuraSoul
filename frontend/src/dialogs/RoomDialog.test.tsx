import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import type { Lease, MaintenanceTicket, RoomSummary, Tenant } from '../api/types'
import { RoomDialog } from './RoomDialog'

/*
  ป็อปอัปห้องบน Dashboard (Check In / Check Out / ห้องซ่อม) ตามเฟรม Figma ชุด Dashboard Popup
  เทสของ DashboardPage เปิดป็อปอัปนี้แค่ทางหลัก ตรงนี้ไล่ปุ่มยืนยัน ยกเลิก และข้อความผิดพลาดทุกทาง
*/

const createLease = vi.fn()
const terminateLease = vi.fn()
const fetchRoomMaintenance = vi.fn()
const updateRoomStatus = vi.fn()
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  createLease: (...args: unknown[]) => createLease(...args),
  terminateLease: (...args: unknown[]) => terminateLease(...args),
  fetchRoomMaintenance: (...args: unknown[]) => fetchRoomMaintenance(...args),
  updateRoomStatus: (...args: unknown[]) => updateRoomStatus(...args),
}))

function room(overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id: 5,
    roomNumber: '105',
    floor: 1,
    roomType: 'SINGLE',
    baseRent: 3500,
    status: 'AVAILABLE',
    currentLease: null,
    openMaintenanceCount: 0,
    openMaintenanceTitle: null,
    ...overrides,
  }
}

function lease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: 31,
    roomId: 5,
    roomNumber: '105',
    tenantId: 2,
    tenantName: 'Kenji Sato',
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    monthlyRent: 3500,
    billingCycle: 'MONTHLY',
    status: 'ACTIVE',
    securityDeposit: 7000,
    ...overrides,
  }
}

const TENANTS: Tenant[] = [
  { id: 2, fullName: 'Kenji Sato', email: 'kenji@example.com', phone: '082-345-6789', nationalId: '1103700012345', lineId: 'kenji.s' },
  { id: 3, fullName: 'Aiko Tanaka', email: null, phone: '084-567-8901', nationalId: null },
]

function occupied() {
  return room({ status: 'OCCUPIED', currentLease: { id: 31 } as RoomSummary['currentLease'] })
}

function setup(ui: { room: RoomSummary; tenants?: Tenant[]; leases?: Lease[] }) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  const user = userEvent.setup()
  render(<RoomDialog room={ui.room} tenants={ui.tenants ?? TENANTS} leases={ui.leases ?? []} onClose={onClose} onChanged={onChanged} />)
  return { user, onClose, onChanged }
}

beforeEach(() => {
  createLease.mockReset()
  terminateLease.mockReset()
  fetchRoomMaintenance.mockReset()
  updateRoomStatus.mockReset()
})

describe('occupied room (check out)', () => {
  it('shows the tenant contact details and the lease terms', async () => {
    const { user } = setup({ room: occupied(), leases: [lease()] })

    expect(screen.getByText('kenji.s')).toBeInTheDocument()
    expect(screen.getByText('082-345-6789')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lease Information' }))
    expect(screen.getByText('฿3,500.00')).toBeInTheDocument()
    expect(screen.getByText('฿7,000.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tenant Information' }))
    expect(screen.getByText('Tenant Name')).toBeInTheDocument()
  })

  it('shows a dash for an open-ended lease and Not provided for an unknown tenant', async () => {
    const { user } = setup({ room: occupied(), leases: [lease({ endDate: null, tenantId: 99 })] })

    expect(screen.getAllByText('Not provided')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Lease Information' }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('explains the problem when the room says occupied but the lease is missing', () => {
    setup({ room: occupied(), leases: [] })
    expect(screen.getByText('Room status is occupied but no active lease found.')).toBeInTheDocument()
  })

  it('ends the lease today after the confirmation', async () => {
    terminateLease.mockResolvedValue(undefined)
    const { user, onChanged, onClose } = setup({ room: occupied(), leases: [lease()] })

    await user.click(screen.getByRole('button', { name: 'Check Out' }))
    expect(screen.getByText('Are you sure you want to check out Kenji Sato from Room 105?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm Check Out' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(terminateLease).toHaveBeenCalledWith(31, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the confirmation open with the server message when check out fails', async () => {
    terminateLease.mockRejectedValue(new ApiError(409, 'This lease has unpaid bills'))
    const { user, onChanged } = setup({ room: occupied(), leases: [lease()] })

    await user.click(screen.getByRole('button', { name: 'Check Out' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Check Out' }))

    expect(await screen.findByText('This lease has unpaid bills')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Check Out' })).toBeEnabled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('goes back from the confirmation with Cancel and closes from the X', async () => {
    const { user, onClose } = setup({ room: occupied(), leases: [lease()] })

    await user.click(screen.getByRole('button', { name: 'Check Out' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Check Out' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check Out' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('available room (check in)', () => {
  it('creates a monthly lease for the chosen tenant with the room rent and the deposit typed', async () => {
    createLease.mockResolvedValue(lease())
    const { user, onChanged, onClose } = setup({ room: room() })

    await user.selectOptions(screen.getByLabelText(/tenant/i, { selector: 'select' }), '3')
    // ผู้เช่าคนนี้ไม่มีอีเมลกับเลขบัตร
    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Lease Information' }))
    await user.clear(screen.getByLabelText(/check in date/i))
    await user.type(screen.getByLabelText(/check in date/i), '2026-12-01')
    await user.type(screen.getByLabelText(/check out date/i), '2027-11-30')
    await user.clear(screen.getByLabelText(/security deposit/i))
    await user.type(screen.getByLabelText(/security deposit/i), '5000')
    expect(screen.getByLabelText(/rent/i, { selector: 'input[readonly]' })).toHaveValue('฿3,500.00')

    await user.click(screen.getByRole('button', { name: 'Check In' }))
    expect(screen.getByText('Are you sure you want to check in to Room 105?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm Check In' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(createLease).toHaveBeenCalledWith({
      roomId: 5,
      tenantId: 3,
      startDate: '2026-12-01',
      endDate: '2027-11-30',
      billingCycle: 'MONTHLY',
      securityDeposit: 5000,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('sends no end date when the check out date is left empty', async () => {
    createLease.mockResolvedValue(lease())
    const { user } = setup({ room: room() })

    await user.click(screen.getByRole('button', { name: 'Check In' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Check In' }))

    await waitFor(() => expect(createLease).toHaveBeenCalledWith(expect.objectContaining({ endDate: null, tenantId: 2, securityDeposit: 7000 })))
  })

  it('asks to add a tenant first when there are none', async () => {
    const { user } = setup({ room: room(), tenants: [] })

    await user.click(screen.getByRole('button', { name: 'Check In' }))

    expect(screen.getByText('No tenants available in the system. Please add a tenant first.')).toBeInTheDocument()
    expect(createLease).not.toHaveBeenCalled()
  })

  it('refuses a check out date before the check in date', async () => {
    const { user } = setup({ room: room() })

    await user.click(screen.getByRole('button', { name: 'Lease Information' }))
    await user.clear(screen.getByLabelText(/check in date/i))
    await user.type(screen.getByLabelText(/check in date/i), '2026-12-01')
    await user.type(screen.getByLabelText(/check out date/i), '2026-11-01')
    await user.click(screen.getByRole('button', { name: 'Check In' }))

    expect(screen.getByText('Check Out Date must not be earlier than Check In Date.')).toBeInTheDocument()
  })

  it('refuses dates that overlap a lease already on the room', async () => {
    const existing = lease({ tenantName: 'Yuki Tanaka', startDate: '2026-01-01', endDate: null })
    const { user } = setup({ room: room(), leases: [existing] })

    await user.click(screen.getByRole('button', { name: 'Check In' }))

    expect(screen.getByText(/Unit 105 is not available from 2026-01-01 to no end date because Yuki Tanaka/)).toBeInTheDocument()
  })

  it('returns to the form with the server message when check in fails', async () => {
    createLease.mockRejectedValue(new ApiError(400, 'Tenant already has a lease'))
    const { user, onChanged } = setup({ room: room() })

    await user.click(screen.getByRole('button', { name: 'Check In' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Check In' }))

    expect(await screen.findByText('Tenant already has a lease')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check In' })).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('cancels the confirmation back to the form', async () => {
    const { user } = setup({ room: room() })

    await user.click(screen.getByRole('button', { name: 'Check In' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Check In' })).toBeInTheDocument()
  })
})

describe('room under maintenance', () => {
  const TICKET = {
    id: 9,
    title: 'Water heater broken',
    status: 'IN_PROGRESS',
    reportedAt: '2026-11-02T03:00:00Z',
  } as MaintenanceTicket

  it('lists the open tickets and releases the room', async () => {
    fetchRoomMaintenance.mockResolvedValue([TICKET])
    updateRoomStatus.mockResolvedValue(undefined)
    const { user, onChanged, onClose } = setup({ room: room({ status: 'MAINTENANCE' }) })

    expect(await screen.findByText('Water heater broken')).toBeInTheDocument()
    expect(screen.getByText(/In Progress · Reported/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Release Room' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(updateRoomStatus).toHaveBeenCalledWith(5, 'AVAILABLE')
    expect(onClose).toHaveBeenCalled()
  })

  it('says there are no tickets and shows why the release failed', async () => {
    fetchRoomMaintenance.mockResolvedValue([])
    updateRoomStatus.mockRejectedValue(new ApiError(409, 'Room still has open tickets'))
    const { user, onChanged } = setup({ room: room({ status: 'MAINTENANCE' }) })

    expect(await screen.findByText('No maintenance tickets')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Release Room' }))

    expect(await screen.findByText('Room still has open tickets')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Release Room' })).toBeEnabled()
  })

  it('shows the load error', async () => {
    fetchRoomMaintenance.mockRejectedValue(new ApiError(500, 'Database unavailable'))
    setup({ room: room({ status: 'MAINTENANCE' }) })

    expect(await screen.findByText(/Database unavailable|Failed to load maintenance records/)).toBeInTheDocument()
  })
})
