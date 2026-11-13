import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogItem, RentalRequest } from '../domain/appliance'
import { ApplianceRequestDialog } from './ApplianceRequestDialog'
import { EditProfileDialog, type UserProfile } from './EditProfileDialog'
import { MaintenanceTaskDialog } from './MaintenanceTaskDialog'
import type { MaintenanceTask } from '../domain/maintenanceBoard'
import { resetMockStore } from '../api/mockApi'

/*
  ทางที่หน้าแม่ไม่ได้เดินของป็อปอัปเล็ก ๆ (โหมดแก้ ปุ่มลบ ช่องที่ล้างแล้วคงค่าเดิม)
*/

afterEach(() => {
  vi.restoreAllMocks()
})

const CATALOG: CatalogItem[] = [
  { id: 1, name: 'Refrigerator 5 cu.ft', sku: 'AP-001', category: 'Kitchen', monthlyFee: 300, deposit: 1000, owned: 3, lowStockAt: 1 } as CatalogItem,
]

const REQUEST: RentalRequest = { id: 9, room: '101', sku: 'AP-001', monthlyFee: 300, deposit: 1000, startDate: '2026-09-01', status: 'Pending' }

describe('ApplianceRequestDialog in edit mode', () => {
  it('saves a new status and offers Delete Request', async () => {
    const onSave = vi.fn()
    const onDelete = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ApplianceRequestDialog mode="edit" request={REQUEST} catalog={CATALOG} onClose={onClose} onSave={onSave} onDelete={onDelete} />)

    expect(screen.getByText('Edit Appliance Request')).toBeInTheDocument()
    expect(screen.getByText('Update this rental request')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Status'), 'Active')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 9, status: 'Active' }))

    await user.click(screen.getByRole('button', { name: 'Delete Request' }))
    expect(onClose).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledWith(9)
  })

  it('has no delete button without a delete handler', () => {
    render(<ApplianceRequestDialog mode="edit" request={REQUEST} catalog={CATALOG} onClose={vi.fn()} onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Delete Request' })).not.toBeInTheDocument()
  })
})

describe('EditProfileDialog', () => {
  const PROFILE: UserProfile = {
    fullName: 'Administrator',
    role: 'Manager',
    staffId: 'S-1',
    username: 'admin',
    emailOrPassword: 'admin@example.com',
    phone: '081-234-5678',
  } as UserProfile

  it('saves the edited fields and keeps the old value for a field left blank', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<EditProfileDialog profile={PROFILE} onClose={onClose} onSave={onSave} />)

    await user.clear(screen.getByLabelText('Full Name'))
    await user.type(screen.getByLabelText('Full Name'), 'Nana K.')
    await user.clear(screen.getByLabelText('Role'))
    await user.type(screen.getByLabelText('Role'), 'Owner')
    await user.clear(screen.getByLabelText('Email or Password'))
    await user.type(screen.getByLabelText('Email or Password'), 'nana@example.com')
    await user.clear(screen.getByLabelText('Phone Number'))
    await user.type(screen.getByLabelText('Phone Number'), '089-000-0000')
    await user.clear(screen.getByLabelText('Username'))
    fireEvent.submit(document.getElementById('edit-profile-form')!)

    expect(onSave).toHaveBeenCalledWith({
      ...PROFILE,
      fullName: 'Nana K.',
      role: 'Owner',
      username: 'admin',
      emailOrPassword: 'nana@example.com',
      phone: '089-000-0000',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps every old value when all fields are cleared', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<EditProfileDialog profile={PROFILE} onClose={vi.fn()} onSave={onSave} />)

    for (const label of ['Full Name', 'Role', 'Username', 'Email or Password', 'Phone Number']) {
      await user.clear(screen.getByLabelText(label))
    }
    fireEvent.submit(document.getElementById('edit-profile-form')!)

    expect(onSave).toHaveBeenCalledWith(PROFILE)
  })
})

describe('MaintenanceTaskDialog in edit mode', () => {
  const TASK: MaintenanceTask = {
    id: 4,
    roomId: 1,
    task: 'AC not cooling',
    detail: 'Noisy fan',
    maintenanceType: 'HVAC',
    unit: '101',
    priority: 'Medium',
    assignTo: 'Somchai',
    reportBy: 'Front desk',
    date: '2026-11-20',
    status: 'In Progress',
    billToTenant: false,
    amount: 0,
  }

  it('saves the new priority and the cost billed to the tenant', async () => {
    resetMockStore()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MaintenanceTaskDialog mode="edit" task={TASK} onClose={vi.fn()} onSave={onSave} />)

    await user.selectOptions(screen.getByLabelText('Priority'), 'Urgent')
    await user.click(screen.getByRole('checkbox', { name: /Bill this repair to the tenant/ }))
    await user.clear(screen.getByLabelText('Amount'))
    await user.type(screen.getByLabelText('Amount'), '450')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 4, priority: 'Urgent', billToTenant: true, amount: 450 })
    expect(onSave.mock.calls[0][1]).toEqual([])
  })

  it('shows a plain message when saving fails without a server reason', async () => {
    resetMockStore()
    const onSave = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<MaintenanceTaskDialog mode="edit" task={TASK} onClose={vi.fn()} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Could not save the task')).toBeInTheDocument()
  })
})

describe('ReminderDialog edge cases', () => {
  it('waits for the unit list when the unit of the reminder has no known id yet', async () => {
    const { ReminderDialog } = await import('./ReminderDialog')
    const client = await import('../api/client')
    const rooms = vi.spyOn(client, 'fetchRooms').mockReturnValue(new Promise(() => {}))
    const onSave = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <ReminderDialog
        mode="edit"
        reminder={{
          id: 5, name: 'Filter change', frequency: 'Quarterly', startDate: '2026-09-01', unit: '105', time: '09:00',
          priority: 'Low', notes: '', active: true, roomId: null, nextDueDate: '2026-12-01', overdue: false, lastTriggeredAt: null,
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.change(container.querySelector('input[type=time]')!, { target: { value: '07:30' } })
    await user.click(screen.getByRole('radio', { name: 'High' }))
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('The unit list is still loading. Please try again in a moment.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    rooms.mockRestore()
  })

  it('keeps the edited reminder open with a plain message when saving fails', async () => {
    resetMockStore()
    const { ReminderDialog } = await import('./ReminderDialog')
    const onSave = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(
      <ReminderDialog
        mode="edit"
        reminder={{
          id: 3,
          name: 'HVAC Inspection',
          frequency: 'Monthly',
          startDate: '2026-09-01',
          unit: '9999',
          time: '09:00',
          priority: 'Medium',
          notes: '',
          active: true,
          roomId: 77,
          nextDueDate: '2026-12-01',
          overdue: false,
          lastTriggeredAt: null,
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    // ห้องเดิมที่ไม่อยู่ในรายการห้องแล้ว ยังค้างอยู่ในตัวเลือก และใช้ roomId เดิม
    expect(screen.getByRole('option', { name: '9999' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Could not save the changes')).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ unit: '9999' }), 77)
  })
})

describe('BulkSendInvoicesDialog', () => {
  const item = (receiptId: number, email: string | null, sentCount = 0) => ({
    receiptId,
    tenant: `Tenant ${receiptId}`,
    email,
    unit: `Unit ${100 + receiptId}`,
    amount: '฿1,000.00',
    amountValue: 1000,
    cycle: 'Monthly',
    cycleDate: 'Nov 2026',
    status: 'Pending' as const,
    sentCount,
  })

  it('reports who got the email, who was skipped and why, and hands the result back on Done', async () => {
    const { BulkSendInvoicesDialog } = await import('./BulkSendInvoicesDialog')
    const client = await import('../api/client')
    const result = {
      sent: [{ receiptId: 1, email: 'one@example.com' }],
      skipped: [
        { receiptId: 2, reason: 'NO_EMAIL' as const },
        { receiptId: 3, reason: 'SEND_FAILED' as const },
      ],
    }
    vi.spyOn(client, 'sendReceipts').mockResolvedValue(result as never)
    const onSent = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkSendInvoicesDialog items={[item(1, 'one@example.com', 2), item(2, null), item(3, 'three@example.com')]} onClose={onClose} onSent={onSent} />,
    )

    expect(screen.getByText('1 tenant has no email on file and will be skipped.')).toBeInTheDocument()
    expect(screen.getByText('Sent ×2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Send 2 Invoices/ }))

    expect(await screen.findByText('Sent to one@example.com')).toBeInTheDocument()
    expect(screen.getByText('No email address on file')).toBeInTheDocument()
    expect(screen.getByText('Could not be sent — try again later')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onSent).toHaveBeenCalledWith(result)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cannot be closed while sending, and says how many tenants have no email', async () => {
    const { BulkSendInvoicesDialog } = await import('./BulkSendInvoicesDialog')
    const client = await import('../api/client')
    vi.spyOn(client, 'sendReceipts').mockReturnValue(new Promise(() => {}))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<BulkSendInvoicesDialog items={[item(1, 'one@example.com'), item(2, null), item(3, null)]} onClose={onClose} onSent={vi.fn()} />)

    expect(screen.getByText('2 tenants have no email on file and will be skipped.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Send 1 Invoice$/ }))
    expect(screen.getByRole('button', { name: /Sending/ })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ContractPdfDialog', () => {
  const LEASE = {
    id: 42,
    roomId: 1,
    roomNumber: '102',
    tenantId: 1,
    tenantName: 'Yuki Tanaka',
    startDate: '2025-12-28',
    endDate: '2026-11-25',
    monthlyRent: 4500,
    billingCycle: 'MONTHLY' as const,
    status: 'ACTIVE' as const,
  }

  it('says Loading... while the details load, then Not available when they fail', async () => {
    const { ContractPdfDialog } = await import('./ContractPdfDialog')
    const client = await import('../api/client')
    let failRates: (e: Error) => void = () => {}
    let failRoom: (e: Error) => void = () => {}
    vi.spyOn(client, 'fetchApartmentConfig').mockReturnValue(new Promise((_, reject) => (failRates = reject)))
    vi.spyOn(client, 'fetchRoom').mockReturnValue(new Promise((_, reject) => (failRoom = reject)))
    vi.spyOn(client, 'fetchTenant').mockReturnValue(new Promise(() => {}))
    render(<ContractPdfDialog lease={LEASE} onClose={vi.fn()} />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThanOrEqual(6)

    failRates(new client.ApiError(500, 'down'))
    failRoom(new client.ApiError(500, 'down'))
    await waitFor(() => expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(4))
  })

  it('remembers the print options picked', async () => {
    resetMockStore()
    const { ContractPdfDialog } = await import('./ContractPdfDialog')
    render(<ContractPdfDialog lease={LEASE} onClose={vi.fn()} />)

    fireEvent.change(document.getElementById('print-destination')!, { target: { value: 'HP LaserJet Pro' } })
    fireEvent.change(document.getElementById('print-pages')!, { target: { value: 'Custom' } })
    fireEvent.change(document.getElementById('print-layout')!, { target: { value: 'Landscape' } })

    expect(document.getElementById('print-destination')).toHaveValue('HP LaserJet Pro')
    expect(document.getElementById('print-pages')).toHaveValue('Custom')
    expect(document.getElementById('print-layout')).toHaveValue('Landscape')
  })
})

describe('CreateMaintenanceDialog choices', () => {
  it('opens with no floors, switches availability back and clears the billed amount', async () => {
    resetMockStore()
    const { CreateMaintenanceDialog } = await import('./CreateMaintenanceDialog')
    const user = userEvent.setup()
    render(<CreateMaintenanceDialog rooms={[]} onClose={vi.fn()} onSave={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /Out of Service/ }))
    expect(screen.getByRole('radio', { name: /Out of Service/ })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: /Still Available/ }))
    expect(screen.getByRole('radio', { name: /Still Available/ })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('checkbox', { name: /Bill this repair to the tenant/ }))
    const amount = screen.getByLabelText('Amount')
    await user.clear(amount)
    expect(amount).toHaveValue(null)
    await user.type(amount, '300')
    expect(amount).toHaveValue(300)
  })
})
