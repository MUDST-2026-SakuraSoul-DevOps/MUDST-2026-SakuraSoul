import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import Phase2Preview from './Phase2Preview'
import { NextInvoiceDraft } from './NextInvoiceDraft'
import { SettingsDesign } from './SettingsDesign'
import { UnitsDesign } from './UnitsDesign'
import { UtilitiesDesign } from './UtilitiesDesign'
import { MaintenanceDesign, PeopleDesign } from './OperationsDesign'
import { MaintenanceWorkDesign } from './MaintenanceWorkDesign'
import { initialCatalog, initialContracts } from './phase1Data'
import type { RentalRequest } from '../domain/appliance'

// jsdom does not implement native dialog methods; keep this shim test-local.
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function openPreview(path = '/phase2-preview/documents') {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/phase2-preview/:section" element={<Phase2Preview />} /></Routes></MemoryRouter>)
}

describe('central document library', () => {
  it.each([['contracts','Contract'],['maintenance','Maintenance report'],['payments','Receipt']])('opens all %s documents from a page-level shortcut', async (section,type) => {
    const user = userEvent.setup()
    openPreview(`/phase2-preview/${section}?room=101`)
    await user.click(screen.getByRole('link', { name: 'View all documents' }))
    expect(screen.getByRole('heading', { name: 'Document Library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: type })).toHaveAttribute('aria-pressed','true')
    expect(screen.getByRole('textbox', { name: 'Search documents' })).toHaveValue('')
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })
  it('labels icon-only contract actions and shows dismissible hover/focus tooltips', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/contracts')
    const action = screen.getByRole('button', { name: 'View contract 101' })
    expect(action.textContent).toBe('')
    expect(action.closest('td')).toHaveClass('p2-action-cell')
    expect(screen.getByRole('columnheader', { name: 'ACTIONS' })).toHaveClass('p2-action-cell')
    await user.hover(action)
    expect(screen.getByRole('tooltip')).toHaveTextContent('View contract 101')
    await user.unhover(action)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    act(() => action.focus())
    expect(await screen.findByRole('tooltip')).toHaveTextContent('View contract 101')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.click(action)
    expect(screen.getByRole('dialog', { name: 'Contract details' })).toBeInTheDocument()
  })
  it('opens as a main menu and searches across tenant names and dates', async () => {
    const user = userEvent.setup()
    openPreview()
    const nav = screen.getByRole('navigation', { name: 'Apartment management' })
    expect(within(nav).getByRole('link', { name: 'Documents' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('row')).toHaveLength(4)
    await user.type(screen.getByRole('textbox', { name: 'Search documents' }), 'Kant')
    expect(screen.getByText('Air conditioner service report')).toBeInTheDocument()
    expect(screen.queryByText('Payment receipt · November')).not.toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Search documents' }))
    await user.type(screen.getByRole('textbox', { name: 'Search documents' }), '04 Nov')
    expect(screen.getByText('Payment receipt · November')).toBeInTheDocument()
    expect(screen.queryByText('Air conditioner service report')).not.toBeInTheDocument()
  })

  it.each(['Receipt','Maintenance report','Contract'])('respects %s deep links for filtering and upload', async type => {
    const user = userEvent.setup()
    openPreview(`/phase2-preview/documents?${new URLSearchParams({type, unit:'101', upload:'1'})}`)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('combobox', { name: 'Document type' })).toHaveValue(type)
    expect(within(dialog).getByRole('combobox', { name: 'Linked unit' })).toHaveValue('101')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: 'Search documents' })).toHaveValue('101')
  })

  it('shares uploaded files between the owner view and the central library', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/contracts')
    expect(screen.queryByRole('navigation', { name: 'Contracts sections' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View contract 101' }))
    await user.click(screen.getByRole('link', { name: 'Attach scan' }))
    expect(screen.getByRole('combobox', { name: 'Document type' })).toHaveValue('Contract')
    expect(screen.getByRole('combobox', { name: 'Linked unit' })).toHaveValue('101')
    await user.upload(screen.getByLabelText(/Document file/), new File(['sample'], 'shared-contract.pdf', {type:'application/pdf'}))
    // jsdom's native validation does not recognize userEvent's FileList.
    expect((screen.getByLabelText(/Document file/) as HTMLInputElement).files).toHaveLength(1)
    fireEvent.submit(screen.getByRole('button', { name: 'Add to preview library' }).closest('form')!)
    expect(screen.getByText('shared-contract.pdf')).toBeInTheDocument()
    await user.click(within(screen.getByRole('navigation', { name: 'Apartment management' })).getByRole('link', { name: 'Documents' }))
    expect(screen.getByText('shared-contract.pdf')).toBeInTheDocument()
    expect(screen.getByText('Payment receipt · November')).toBeInTheDocument()
    await user.click(within(screen.getByRole('navigation', { name: 'Apartment management' })).getByRole('link', { name: 'Contracts' }))
    await user.click(within(screen.getByRole('row', { name: /Kant S\./ })).getByRole('link', { name: /Files/ }))
    expect(screen.getByText('shared-contract.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Payment receipt · November')).not.toBeInTheDocument()
  })
  it('opens maintenance uploads in Documents without a duplicate tab', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/maintenance')
    expect(within(screen.getByRole('navigation', { name: 'Maintenance sections' })).queryByRole('link', { name: 'Documents' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Attach report for task MT-205' }))
    expect(screen.getByRole('combobox', { name: 'Document type' })).toHaveValue('Maintenance report')
    expect(screen.getByRole('combobox', { name: 'Linked unit' })).toHaveValue('205')
  })
  it('opens receipt documents from invoice details without a duplicate tab', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/payments')
    expect(within(screen.getByRole('navigation', { name: 'Payments sections' })).queryByRole('link', { name: 'Receipts & slips' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View invoice 102' }))
    await user.click(screen.getByRole('link', { name: 'Receipts & slips' }))
    expect(screen.getByRole('textbox', { name: 'Search documents' })).toHaveValue('102')
    expect(screen.getByText('Payment receipt · November')).toBeInTheDocument()
    expect(screen.queryByText('Air conditioner service report')).not.toBeInTheDocument()
  })
})

describe('NextInvoiceDraft', () => {
  it('calculates a future draft from the active lease, usage, and approved rental snapshots', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const rentals: RentalRequest[] = [
      { id: 11, room: '101', sku: 'AP-001', monthlyFee: 300, deposit: 1000, startDate: '2026-11-06', status: 'Active' },
      { id: 12, room: '101', sku: 'AP-UNKNOWN', monthlyFee: 125, deposit: 300, startDate: '2026-12-01', status: 'Active' },
      { id: 13, room: '101', sku: 'AP-004', monthlyFee: 450, deposit: 1500, startDate: '2026-12-01', status: 'Pending' },
      { id: 14, room: '201', sku: 'AP-004', monthlyFee: 450, deposit: 1500, startDate: '2026-12-01', status: 'Active' },
    ]

    render(
      <MemoryRouter>
        <NextInvoiceDraft room="101" rentals={rentals} catalog={initialCatalog} contracts={initialContracts} onClose={onClose} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('dialog', { name: 'Next invoice draft' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unit 101 · 2026-12' })).toBeInTheDocument()
    expect(screen.getByText('Kant S.')).toBeInTheDocument()
    expect(screen.getByText('Appliance rental · Refrigerator 5.9 cu.ft')).toBeInTheDocument()
    expect(screen.getByText('Appliance rental · AP-UNKNOWN')).toBeInTheDocument()
    expect(screen.queryByText('Appliance rental · Washing Machine 7 kg')).not.toBeInTheDocument()
    expect(screen.getByText('Current charges subtotal').parentElement).toHaveTextContent('฿5,725.00')
    fireEvent.change(screen.getByLabelText('Electricity usage (kWh)'), { target: { value: '120' } })
    expect(screen.getByText('Current charges subtotal').parentElement).toHaveTextContent('฿5,705.00')
    expect(screen.getByRole('link', { name: 'Manage appliance rentals' })).toHaveAttribute('href', '/phase2-preview/appliances')
    await user.click(screen.getByRole('button', { name: 'Close draft' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('validates the month and usage, falls back for an unknown room, and shows lease/rental empty states', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <NextInvoiceDraft room="999" rentals={[]} catalog={[]} contracts={initialContracts} onClose={() => {}} />
      </MemoryRouter>,
    )

    const unit = screen.getByLabelText('Unit')
    expect(unit).toHaveValue('101')
    const month = screen.getByLabelText('Billing month')
    fireEvent.change(month, { target: { value: '2026-11' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Choose December 2026 or later')

    fireEvent.change(month, { target: { value: '2026-12' } })
    await user.selectOptions(unit, '102')
    expect(screen.getByRole('alert')).toHaveTextContent('No lease covers this billing month')

    await user.selectOptions(unit, '201')
    expect(screen.getByText('No approved appliance rentals for this room/month.')).toBeInTheDocument()
    const water = screen.getByLabelText('Water usage (m³)')
    fireEvent.change(water, { target: { value: '' } })
    expect(screen.getByRole('alert')).toHaveTextContent('enter non-negative usage')
    fireEvent.change(water, { target: { value: '-1' } })
    expect(screen.getByRole('alert')).toHaveTextContent('enter non-negative usage')
  })
})

describe('SettingsDesign profile behavior', () => {
  function renderSettings(path = '/phase2-preview/settings') {
    const onProfileChange = vi.fn()
    const notify = vi.fn()
    render(
      <MemoryRouter initialEntries={[path]}>
        <SettingsDesign profile={{ fullName: 'Waity S.', email: 'manager@example.com', phone: '' }} onProfileChange={onProfileChange} notify={notify} />
      </MemoryRouter>,
    )
    return { onProfileChange, notify }
  }

  it('edits and saves trimmed profile details and switches to team settings', async () => {
    const user = userEvent.setup()
    const { onProfileChange, notify } = renderSettings()

    expect(screen.getByText('Not provided')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit profile' })
    await user.clear(within(dialog).getByLabelText('Full name'))
    await user.type(within(dialog).getByLabelText('Full name'), '  Waity Tan  ')
    await user.clear(within(dialog).getByLabelText('Email address'))
    await user.type(within(dialog).getByLabelText('Email address'), 'waity@example.com')
    await user.clear(within(dialog).getByLabelText('Phone number (optional)'))
    await user.type(within(dialog).getByLabelText('Phone number (optional)'), '080-555-1212')
    await user.click(within(dialog).getByRole('button', { name: 'Save profile' }))

    expect(onProfileChange).toHaveBeenCalledWith({ fullName: 'Waity Tan', email: 'waity@example.com', phone: '080-555-1212' })
    expect(notify).toHaveBeenCalledWith('Profile updated in this preview only.')

    await user.click(screen.getByRole('button', { name: 'Team & Access' }))
    expect(screen.getByRole('combobox', { name: 'Preview as role' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'My Profile' }))
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument()
  })

  it('discards an unsaved profile draft when cancelled', async () => {
    const user = userEvent.setup()
    const { onProfileChange, notify } = renderSettings()
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit profile' })
    const name = within(dialog).getByLabelText('Full name')
    await user.clear(name)
    await user.type(name, 'Unsaved Name')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(onProfileChange).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('closes the profile editor with the dialog close control without saving', async () => {
    const user = userEvent.setup()
    const { onProfileChange } = renderSettings()
    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))

    expect(screen.queryByRole('dialog', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(onProfileChange).not.toHaveBeenCalled()
  })
})

describe('UnitsDesign interactions', () => {
  function renderUnits(view: string, path = '/phase2-preview/units') {
    const onViewChange = vi.fn()
    const notify = vi.fn()
    render(
      <MemoryRouter initialEntries={[path]}>
        <UnitsDesign view={view} onViewChange={onViewChange} notify={notify} />
      </MemoryRouter>,
    )
    return { onViewChange, notify }
  }

  it('filters sample rooms by the selected floor', async () => {
    const user = userEvent.setup()
    renderUnits('rooms')
    const roomTable = () => screen.getAllByRole('table')[0]

    expect(within(roomTable()).getAllByRole('row')).toHaveLength(5)
    await user.selectOptions(screen.getByLabelText('Floor'), '1')
    expect(within(roomTable()).getAllByRole('row')).toHaveLength(4)
    expect(within(roomTable()).getByText('103')).toBeInTheDocument()
    expect(within(roomTable()).queryByText('201')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Floor'), '2')
    expect(within(roomTable()).getAllByRole('row')).toHaveLength(2)
    expect(within(roomTable()).getByText('201')).toBeInTheDocument()
    expect(within(roomTable()).queryByText('101')).not.toBeInTheDocument()
  })

  it('opens the selected room rate history from its row action', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/units')
    const row = screen.getByRole('row', { name: /Unit 102|102/ })
    await user.click(within(row).getByRole('button', { name: 'View rates for unit 102' }))

    expect(within(screen.getByRole('navigation', { name: 'Units sections' })).getByRole('link', { name: 'Rate history' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Rate history · Unit 102' })).toBeInTheDocument()
    expect(screen.getByText(/No rate changes in this sample/)).toBeInTheDocument()
  })

  it('schedules an effective rate for the selected room and keeps the empty state for rooms without history', async () => {
    const user = userEvent.setup()
    const { notify } = renderUnits('rates', '/phase2-preview/units?room=102')
    expect(screen.getByLabelText('Unit')).toHaveValue('102')
    expect(screen.getByText(/No rate changes in this sample/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Schedule rate' }))
    const dialog = screen.getByRole('dialog', { name: 'Schedule room rate' })
    await user.selectOptions(within(dialog).getByLabelText('Unit'), '201')
    fireEvent.change(within(dialog).getByLabelText('Effective from'), { target: { value: '2026-12-15' } })
    await user.clear(within(dialog).getByLabelText('Monthly rent (THB)'))
    await user.type(within(dialog).getByLabelText('Monthly rent (THB)'), '5300')
    await user.type(within(dialog).getByLabelText('Reason / note'), 'Annual adjustment')
    await user.click(within(dialog).getByRole('button', { name: 'Schedule rate' }))

    expect(screen.getByText('Annual adjustment')).toBeInTheDocument()
    expect(screen.getByText('2026-12-15')).toBeInTheDocument()
    expect(screen.getByText('฿5,300.00')).toBeInTheDocument()
    expect(notify).toHaveBeenCalledWith('Rate scheduled for unit 201 from 2026-12-15.')
  })

  it('closes a rate form without saving and uses the default note when no reason is entered', async () => {
    const user = userEvent.setup()
    renderUnits('rates')

    await user.click(screen.getByRole('button', { name: 'Schedule rate' }))
    const firstDialog = screen.getByRole('dialog', { name: 'Schedule room rate' })
    await user.clear(within(firstDialog).getByLabelText('Monthly rent (THB)'))
    await user.type(within(firstDialog).getByLabelText('Monthly rent (THB)'), '9900')
    await user.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('฿9,900.00')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Schedule rate' }))
    const closeDialog = screen.getByRole('dialog', { name: 'Schedule room rate' })
    await user.click(within(closeDialog).getByRole('button', { name: 'Close dialog' }))
    expect(screen.queryByRole('dialog', { name: 'Schedule room rate' })).not.toBeInTheDocument()
    expect(screen.getByText('Original rate')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Schedule rate' }))
    const secondDialog = screen.getByRole('dialog', { name: 'Schedule room rate' })
    await user.click(within(secondDialog).getByRole('button', { name: 'Schedule rate' }))
    expect(screen.getByText('Scheduled rate')).toBeInTheDocument()
  })

  it('adds a one-time or monthly charge to the chosen room', async () => {
    const user = userEvent.setup()
    renderUnits('charges')

    expect(screen.getByText('Parking space')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add charge' }))
    const dialog = screen.getByRole('dialog', { name: 'Add extra charge' })
    await user.selectOptions(within(dialog).getByLabelText('Unit'), '102')
    await user.selectOptions(within(dialog).getByLabelText('Frequency'), 'One-time')
    await user.type(within(dialog).getByLabelText('Charge description'), 'Replacement key card')
    await user.clear(within(dialog).getByLabelText('Amount (THB)'))
    await user.type(within(dialog).getByLabelText('Amount (THB)'), '225.50')
    await user.click(within(dialog).getByRole('button', { name: 'Add charge' }))

    const row = screen.getByText('Replacement key card').closest('tr')
    expect(row).toHaveTextContent('102')
    expect(row).toHaveTextContent('225.50')
    expect(row).toHaveTextContent('One-time')

    await user.click(screen.getByRole('button', { name: 'Add charge' }))
    const monthlyDialog = screen.getByRole('dialog', { name: 'Add extra charge' })
    await user.selectOptions(within(monthlyDialog).getByLabelText('Frequency'), 'Monthly')
    await user.clear(within(monthlyDialog).getByLabelText('Charge description'))
    await user.type(within(monthlyDialog).getByLabelText('Charge description'), 'Monthly parking')
    await user.click(within(monthlyDialog).getByRole('button', { name: 'Add charge' }))
    expect(screen.getByText('Monthly parking').closest('tr')).toHaveTextContent('Monthly')
  })

  it('discards an extra charge when its form is cancelled or closed', async () => {
    const user = userEvent.setup()
    renderUnits('charges')

    await user.click(screen.getByRole('button', { name: 'Add charge' }))
    const cancelDialog = screen.getByRole('dialog', { name: 'Add extra charge' })
    await user.type(within(cancelDialog).getByLabelText('Charge description'), 'Unsaved charge')
    await user.click(within(cancelDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Unsaved charge')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add charge' }))
    const closeDialog = screen.getByRole('dialog', { name: 'Add extra charge' })
    await user.type(within(closeDialog).getByLabelText('Charge description'), 'Discarded charge')
    await user.click(within(closeDialog).getByRole('button', { name: 'Close dialog' }))
    expect(screen.queryByText('Discarded charge')).not.toBeInTheDocument()
  })
})

describe('phase 1 preview interactions', () => {
  it('filters room availability and opens details for the selected room', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/dashboard')
    await user.click(screen.getByRole('button', { name: 'Room 205, Maintenance' }))
    expect(screen.getByRole('dialog', { name: 'Room 205' })).toHaveTextContent('No active tenant')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close dialog' }))
    await user.selectOptions(screen.getByLabelText('Floor'), '2')
    expect(screen.getByRole('button', { name: 'Room 201, Occupied' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Room 101, Occupied' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Search rooms' }), 'Narin')
    expect(screen.getByRole('button', { name: 'Room 201, Occupied' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Room 202, Occupied' })).not.toBeInTheDocument()
  })

  it('validates overlapping contracts, then saves a new lease and updates occupancy', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/contracts')
    await user.click(screen.getByRole('button', { name: 'Create contract' }))
    let dialog = screen.getByRole('dialog', { name: 'Create contract' })
    await user.type(within(dialog).getByLabelText('Tenant name'), '  New Resident  ')
    await user.selectOptions(within(dialog).getByLabelText('Unit'), '101')
    await user.click(within(dialog).getByRole('button', { name: 'Save contract' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('overlapping lease')
    await user.selectOptions(within(dialog).getByLabelText('Unit'), '103')
    fireEvent.change(within(dialog).getByLabelText('Lease start'), { target: { value: '2026-11-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save contract' }))
    expect(screen.getByText('New Resident')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Contract saved in preview memory')
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Room 103, Occupied' }))
    expect(screen.getByRole('dialog', { name: 'Room 103' })).toHaveTextContent('New Resident')
  })
})

describe('utility usage import flow', () => {
  it('reviews and imports sample rows, updating the selected usage value', async () => {
    const user = userEvent.setup()
    const notify = vi.fn()
    render(<MemoryRouter><UtilitiesDesign notify={notify} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Import usage CSV' }))
    await user.click(screen.getByRole('button', { name: 'Use sample file' }))
    await user.click(screen.getByRole('button', { name: 'Review rows' }))
    expect(screen.getByText(/valid rows · No rows saved yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Import .* rows/ }))
    expect(notify).toHaveBeenCalledWith('Usage rows imported into preview memory only.')
    await user.click(screen.getByRole('button', { name: 'View usage' }))
    await user.click(screen.getByText('View usage data table'))
    expect(screen.getByRole('row', { name: /^Nov/ })).toHaveTextContent('10')
    expect(screen.getByText('3 rows')).toBeInTheDocument()
  })

  it('shows a useful CSV validation error and accepts a corrected file', async () => {
    const user = userEvent.setup()
    const notify = vi.fn()
    render(<MemoryRouter><UtilitiesDesign notify={notify} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Import usage CSV' }))
    const chooseFile = screen.getByLabelText(/Choose CSV file/)
    await user.upload(chooseFile, new File(['room,billing_month,water_m3,electricity_kwh\n999,2026-11,10,124'], 'bad-usage.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Review rows' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('unknown room')
    expect(screen.getByRole('dialog')).toHaveTextContent('bad-usage.csv')

    await user.upload(chooseFile, new File(['room,billing_month,water_m3,electricity_kwh\n101,2026-11,11,125'], 'corrected.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Review rows' }))
    expect(screen.getByText('1 valid rows · No rows saved yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Import 1 rows' }))
    await user.click(screen.getByRole('button', { name: 'View usage' }))
    await user.click(screen.getByText('View usage data table'))
    expect(screen.getByRole('row', { name: /^Nov/ })).toHaveTextContent('11')
    expect(notify).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Import usage CSV' }))
    await user.upload(screen.getByLabelText(/Choose CSV file/), new File(['room,billing_month,water_m3,electricity_kwh\n101,2026-11,12,126'], 'replacement.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Review rows' }))
    await user.click(screen.getByRole('button', { name: 'Import 1 rows' }))
    await user.click(screen.getByRole('button', { name: 'View usage' }))
    await user.click(screen.getByText('View usage data table'))
    expect(screen.getByRole('row', { name: /^Nov/ })).toHaveTextContent('12')
    expect(screen.getByText('1 rows')).toBeInTheDocument()
  })

  it('rejects a CSV larger than the documented upload limit', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><UtilitiesDesign notify={vi.fn()} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Import usage CSV' }))
    const largeCsv = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/Choose CSV file/), largeCsv)
    expect(await screen.findByRole('alert')).toHaveTextContent('smaller than 2 MB')
    expect(screen.getByRole('button', { name: 'Review rows' })).toBeDisabled()
  })

  it('sums floor electricity usage by year and switches utility units', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><UtilitiesDesign notify={vi.fn()} /></MemoryRouter>)
    await user.selectOptions(screen.getByLabelText('View'), 'Floor')
    expect(screen.getByLabelText('Floor')).toHaveValue('1')
    await user.selectOptions(screen.getByLabelText('Period'), 'Yearly')
    await user.click(screen.getByRole('button', { name: 'Electricity' }))
    expect(screen.getByText(/ELECTRICITY USAGE/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('2024–2026')).toBeInTheDocument()
    await user.click(screen.getByText('View usage data table'))
    expect(screen.getByRole('row', { name: /2024/ })).toHaveTextContent('2976')
    expect(screen.getByRole('row', { name: /2026/ })).toHaveTextContent('3381')
  })
})

describe('maintenance and people interactions', () => {
  it('labels fuzzy tenant matches and allows exact-only search', async () => {
    const user = userEvent.setup()
    render(<PeopleDesign permissions={false} notify={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Search tenants' }), 'kart')
    expect(screen.getByText('Kant Srisuk')).toBeInTheDocument()
    expect(screen.getByText('Similar name')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Include similar names' }))
    expect(screen.getByText(/0 results for “kart”/)).toBeInTheDocument()
    expect(screen.queryByText('Kant Srisuk')).not.toBeInTheDocument()
  })

  it('keeps role settings read-only for staff and saves a manager permission change', async () => {
    const user = userEvent.setup()
    const notify = vi.fn()
    render(<PeopleDesign permissions notify={notify} />)
    await user.selectOptions(screen.getByLabelText('Preview as role'), 'Maintenance Staff')
    expect(screen.getByLabelText('Role for Nok T.')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Preview as role'), 'Manager')
    await user.selectOptions(screen.getByLabelText('Role for Nok T.'), 'Maintenance Staff')
    const permission = screen.getByRole('checkbox', { name: 'Maintenance Staff: Manage invoices & payments' })
    await user.click(permission)
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))
    expect(notify).toHaveBeenCalledWith('Role assignments and permissions saved in this preview only. No account access was changed.')
  })

  it('restocks an item and recalculates its low-stock alert', async () => {
    const user = userEvent.setup()
    const notify = vi.fn()
    render(<MemoryRouter><MaintenanceDesign view="supplies" notify={notify} /></MemoryRouter>)
    expect(screen.getByText('2 items need restocking')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restock Air Filters 16×20×1' }))
    const dialog = screen.getByRole('dialog', { name: 'Restock supply' })
    expect(within(dialog).getByText('8 / 80')).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('Quantity to add'))
    await user.type(within(dialog).getByLabelText('Quantity to add'), '12')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm restock' }))
    expect(screen.getByText('1 items need restocking')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(notify).toHaveBeenCalledWith('Sample inventory updated. Low-stock status recalculated.')
  })

  it('creates a maintenance task, updates its status, and exposes it in the log', async () => {
    const user = userEvent.setup()
    const notify = vi.fn()
    const { rerender } = render(<MemoryRouter><MaintenanceWorkDesign view="tasks" notify={notify} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    const dialog = screen.getByRole('dialog', { name: 'Create maintenance task' })
    await user.type(within(dialog).getByLabelText('Issue description'), '  Replace hallway light  ')
    await user.selectOptions(within(dialog).getByLabelText('Task status'), 'Done')
    await user.clear(within(dialog).getByLabelText('Recorded cost (THB)'))
    await user.type(within(dialog).getByLabelText('Recorded cost (THB)'), '725.50')
    await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
    expect(screen.queryByText('Replace hallway light')).not.toBeInTheDocument()
    expect(notify).toHaveBeenCalledWith('Task completed. View its record in Maintenance Log.')
    rerender(<MemoryRouter><MaintenanceWorkDesign view="log" notify={notify} /></MemoryRouter>)
    expect(screen.getByText('Replace hallway light')).toBeInTheDocument()
    expect(screen.getByText('฿725.50')).toBeInTheDocument()
  })
})

describe('payment collection and billing settings', () => {
  it('records partial and final payments once, updating the invoice and receipt history', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/payments')
    const invoice = () => screen.getByRole('row', { name: /Narin K\./ })

    await user.click(within(invoice()).getByRole('button', { name: 'Record payment for unit 201' }))
    let dialog = screen.getByRole('dialog', { name: 'Record payment' })
    await user.selectOptions(within(dialog).getByLabelText('Payment method'), 'Cash')
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(within(invoice()).getByText('Partially paid')).toBeInTheDocument()
    expect(within(invoice()).getByText('฿4,610.00')).toBeInTheDocument()

    await user.click(within(invoice()).getByRole('button', { name: 'Record payment for unit 201' }))
    dialog = screen.getByRole('dialog', { name: 'Record payment' })
    await user.clear(within(dialog).getByRole('spinbutton', { name: /Amount received/ }))
    await user.type(within(dialog).getByRole('spinbutton', { name: /Amount received/ }), '4610')
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(within(invoice()).getByText('Paid')).toBeInTheDocument()
    expect(within(invoice()).getByText('฿0.00')).toBeInTheDocument()

    await user.click(within(screen.getByRole('navigation', { name: 'Payments sections' })).getByRole('link', { name: 'Payment history' }))
    expect(screen.getByText('RC-DEMO-3')).toBeInTheDocument()
    expect(screen.getByText('RC-DEMO-4')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(5)
  })

  it('saves billing preferences and keeps them when reopening settings', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/payments')
    await user.click(screen.getByRole('button', { name: 'Billing settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Billing settings' })
    const interest = within(dialog).getByLabelText('Interest per month (%)')
    expect(interest).toHaveValue(1)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Apply interest to overdue principal' }))
    expect(interest).toBeDisabled()
    await user.clear(within(dialog).getByLabelText('Bank name'))
    await user.type(within(dialog).getByLabelText('Bank name'), 'Siam Example Bank')
    await user.click(within(dialog).getByRole('button', { name: 'Save preview' }))
    expect(screen.getByRole('status')).toHaveTextContent('Billing settings updated in the preview')
    await user.click(screen.getByRole('button', { name: 'Billing settings' }))
    const reopened = screen.getByRole('dialog', { name: 'Billing settings' })
    expect(within(reopened).getByLabelText('Bank name')).toHaveValue('Siam Example Bank')
    expect(within(reopened).getByRole('checkbox', { name: 'Apply interest to overdue principal' })).not.toBeChecked()
  })

  it('enables bulk receipt printing only when selected invoices have receipts', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/payments')
    await user.click(screen.getByRole('checkbox', { name: 'Select invoice 201' }))
    expect(screen.getByText('1 invoices selected · 0 payment receipts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bulk print receipts' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Select invoice 101' }))
    expect(screen.getByText('2 invoices selected · 1 payment receipts')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bulk print receipts' }))
    expect(screen.getByRole('dialog', { name: 'Bulk print receipts' })).toHaveTextContent('RC-2026-1101')
    expect(screen.getByRole('button', { name: 'Print 1 receipts' })).toBeInTheDocument()
  })
})

describe('contract and appliance management', () => {
  it('filters contracts by status and text search', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/contracts')
    await user.selectOptions(screen.getByLabelText('Contract status'), 'Ending soon')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText('Mali P.')).toBeInTheDocument()
    expect(screen.queryByText('Kant S.')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Search contracts' }), 'LS-102')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await user.clear(screen.getByRole('textbox', { name: 'Search contracts' }))
    await user.selectOptions(screen.getByLabelText('Contract status'), 'Ended')
    expect(screen.queryByText('Mali P.')).not.toBeInTheDocument()
    expect(screen.queryByText('Kant S.')).not.toBeInTheDocument()
  })

  it('creates an active appliance rental with catalog price snapshots', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/appliances')
    await user.click(screen.getByRole('button', { name: 'New request' }))
    const dialog = screen.getByRole('dialog', { name: 'New appliance request' })
    await user.selectOptions(within(dialog).getByLabelText('Unit'), '102')
    await user.selectOptions(within(dialog).getByLabelText('Rental status'), 'Active')
    expect(within(dialog).getByLabelText('Monthly fee (THB)')).toHaveValue('฿300.00')
    await user.click(within(dialog).getByRole('button', { name: 'Save request' }))
    expect(screen.getByRole('row', { name: /Refrigerator 5\.9 cu\.ft.*102/ })).toBeInTheDocument()
    expect(screen.getByText('ACTIVE RENTALS').closest('.p2-stat')).toHaveTextContent('2')
    expect(screen.getByRole('status')).toHaveTextContent('Rental request saved in preview')
  })

  it('creates an appliance catalog item with a generated category SKU', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/appliances')
    await user.click(screen.getByRole('button', { name: 'Appliance catalog' }))
    await user.click(screen.getByRole('button', { name: 'Add appliance' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Appliance' })
    await user.type(within(dialog).getByLabelText('Appliance name *'), 'Compact washer')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Category/ }), 'Laundry')
    await user.clear(within(dialog).getByRole('spinbutton', { name: /Monthly fee/ }))
    await user.type(within(dialog).getByRole('spinbutton', { name: /Monthly fee/ }), '525')
    await user.clear(within(dialog).getByRole('spinbutton', { name: /Deposit/ }))
    await user.type(within(dialog).getByRole('spinbutton', { name: /Deposit/ }), '1600')
    await user.clear(within(dialog).getByRole('spinbutton', { name: /Quantity owned/ }))
    await user.type(within(dialog).getByRole('spinbutton', { name: /Quantity owned/ }), '4')
    await user.clear(within(dialog).getByRole('spinbutton', { name: /Low stock alert/ }))
    await user.type(within(dialog).getByRole('spinbutton', { name: /Low stock alert/ }), '1')
    expect(within(dialog).getByDisplayValue('LA-001')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Add Appliance' }))
    const row = screen.getByRole('row', { name: /Compact washer/ })
    expect(row).toHaveTextContent('LA-001')
    expect(row).toHaveTextContent('฿525.00')
    expect(screen.getByRole('status')).toHaveTextContent('Appliance catalog updated. Existing rental fees remain unchanged.')
  })
})

describe('preview shell behavior', () => {
  it('opens and closes mobile navigation when a section is selected', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/dashboard')
    const sidebar = screen.getByRole('complementary')
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(sidebar).toHaveClass('is-open')
    await user.click(within(screen.getByRole('navigation', { name: 'Apartment management' })).getByRole('link', { name: 'Contracts' }))
    expect(screen.getByRole('heading', { name: 'Contract Management' })).toBeInTheDocument()
    expect(sidebar).not.toHaveClass('is-open')
  })

  it('resets preview edits to the original sample data', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/contracts')
    await user.click(screen.getByRole('button', { name: 'Create contract' }))
    const dialog = screen.getByRole('dialog', { name: 'Create contract' })
    await user.type(within(dialog).getByLabelText('Tenant name'), 'Temporary resident')
    await user.click(within(dialog).getByRole('button', { name: 'Save contract' }))
    expect(screen.getByText('Temporary resident')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.queryByText('Temporary resident')).not.toBeInTheDocument()
    expect(screen.getByText('Kant S.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Preview data reset.')
  })
})
