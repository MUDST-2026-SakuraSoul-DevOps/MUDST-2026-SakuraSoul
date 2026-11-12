import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Phase2Preview from './Phase2Preview'

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

describe('phase 2 preview navigation & sections', () => {
  it.each([
    ['/phase2-preview/dashboard', 'Room Availability'],
    ['/phase2-preview/units', 'Unit Management'],
    ['/phase2-preview/units?view=utilities', 'Unit Management'],
    ['/phase2-preview/tenants', 'Tenant Directory'],
    ['/phase2-preview/appliances', 'Appliance Rental'],
    ['/phase2-preview/payments?view=reports', 'Payment Management'],
    ['/phase2-preview/settings', 'Profile Settings'],
  ])('renders %s section (%s)', (path, heading) => {
    openPreview(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('toggles mobile navigation and resets preview data', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/dashboard')

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getAllByRole('button', { name: 'Close navigation' }).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: 'Close navigation' })[0])

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('status')).toHaveTextContent('Preview data reset.')
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('edits profile and switches tabs in preview settings', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/settings')

    await user.click(screen.getByRole('button', { name: 'Edit profile' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit profile' })
    const nameInput = within(dialog).getByLabelText('Full name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Sakura Manager')
    await user.click(within(dialog).getByRole('button', { name: 'Save profile' }))
    expect(screen.getByRole('status')).toHaveTextContent('Profile updated in this preview only.')

    await user.click(screen.getByRole('button', { name: 'Team & Access' }))
    expect(screen.getByText('Team members')).toBeInTheDocument()
  })

  it('exercises UnitsDesign filters, apartment settings, rate history, and extra charges', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/units')

    await user.selectOptions(screen.getByLabelText('Floor'), '1')
    expect(screen.queryByText('201')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Apartment settings/i }))
    const configDialog = screen.getByRole('dialog', { name: 'Apartment settings' })
    const floorsInput = within(configDialog).getByLabelText('Number of floors')
    await user.clear(floorsInput)
    await user.type(floorsInput, '3')
    await user.click(within(configDialog).getByRole('button', { name: 'Preview layout' }))
    expect(screen.getByRole('status')).toHaveTextContent('Preview layout saved: 3 floors')

    await user.click(screen.getByRole('button', { name: 'View rates for unit 101' }))
    await user.click(screen.getByRole('button', { name: /Schedule rate/i }))
    const rateDialog = screen.getByRole('dialog', { name: 'Schedule room rate' })
    await user.type(within(rateDialog).getByLabelText('Reason / note'), 'Yearly bump')
    await user.click(within(rateDialog).getByRole('button', { name: 'Schedule rate' }))
    expect(screen.getByRole('status')).toHaveTextContent('Rate scheduled for unit 101')

    openPreview('/phase2-preview/units?view=charges')
    await user.click(screen.getByRole('button', { name: /Add charge/i }))
    const chargeDialog = screen.getByRole('dialog', { name: 'Add extra charge' })
    await user.type(within(chargeDialog).getByLabelText('Charge description'), 'Keycard fee')
    await user.click(within(chargeDialog).getByRole('button', { name: 'Add charge' }))
    expect(screen.getByText('Keycard fee')).toBeInTheDocument()
  })

  it('exercises MaintenanceWorkDesign create/edit/log/calendar flows', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/maintenance')

    await user.click(screen.getByRole('button', { name: /Create task/i }))
    const createDialog = screen.getByRole('dialog', { name: 'Create maintenance task' })
    await user.type(within(createDialog).getByLabelText('Issue description'), 'Fix hallway light')
    await user.selectOptions(within(createDialog).getByLabelText('Task status'), 'Done')
    await user.click(within(createDialog).getByRole('button', { name: 'Save task' }))
    expect(screen.getByRole('status')).toHaveTextContent('Task completed')

    await user.click(screen.getByRole('button', { name: 'View or update task MT-205' }))
    const editDialog = screen.getByRole('dialog', { name: 'Maintenance task' })
    await user.click(within(editDialog).getByRole('button', { name: 'Save task' }))
    expect(screen.getByRole('status')).toHaveTextContent('Maintenance task saved')

    await user.click(screen.getByRole('link', { name: 'Maintenance Log' }))
    expect(screen.getByText('Air conditioner service')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Schedule/i }))
    expect(screen.getByRole('table', { name: 'November 2026 maintenance calendar' })).toBeInTheDocument()
  })

  it('exercises PaymentsDesign, NextInvoiceDraft, Billing settings, and Bulk print', async () => {
    const user = userEvent.setup()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    openPreview('/phase2-preview/payments')

    await user.selectOptions(screen.getByLabelText('Payment status'), 'Partially paid')
    expect(screen.getByText('Kant S.')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Payment status'), 'All statuses')

    await user.click(screen.getByRole('checkbox', { name: 'Select invoice 101' }))
    await user.click(screen.getByRole('button', { name: /Bulk print receipts/i }))
    const printDialog = screen.getByRole('dialog', { name: 'Bulk print receipts' })
    await user.click(within(printDialog).getByRole('button', { name: /Print 1 receipts/i }))
    expect(printSpy).toHaveBeenCalled()
    await user.click(within(printDialog).getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: /Billing settings/i }))
    const settingsDialog = screen.getByRole('dialog', { name: 'Billing settings' })
    await user.click(within(settingsDialog).getByRole('checkbox'))
    await user.click(within(settingsDialog).getByRole('button', { name: 'Save preview' }))
    expect(screen.getByRole('status')).toHaveTextContent('Billing settings updated')

    await user.click(screen.getByRole('button', { name: 'Record payment for unit 101' }))
    const payDialog = screen.getByRole('dialog', { name: 'Record payment' })
    await user.click(within(payDialog).getByRole('button', { name: 'Record payment' }))
    expect(screen.getByRole('status')).toHaveTextContent('Sample payment of')

    await user.click(screen.getByRole('button', { name: /Next invoice draft/i }))
    const draftDialog = screen.getByRole('dialog', { name: 'Next invoice draft' })
    expect(within(draftDialog).getByText(/Unit 101 · 2026-12/)).toBeInTheDocument()
    const waterInput = within(draftDialog).getByLabelText('Water usage (m³)')
    await user.clear(waterInput)
    await user.type(waterInput, '-1')
    expect(within(draftDialog).getByRole('alert')).toHaveTextContent('Choose December 2026 or later')
    await user.click(within(draftDialog).getByRole('button', { name: 'Close draft' }))

    openPreview('/phase2-preview/payments?view=history')
    expect(screen.getByText('RC-2026-1101')).toBeInTheDocument()
    printSpy.mockRestore()
  })

  it('exercises UtilitiesDesign CSV import and ReportsDesign grouping/export', async () => {
    const user = userEvent.setup()
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:mock', writable: true })
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, writable: true })
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    openPreview('/phase2-preview/units?view=utilities')
    await user.click(screen.getByRole('button', { name: 'Electricity' }))
    await user.selectOptions(screen.getByLabelText('View'), 'Floor')
    await user.selectOptions(screen.getByLabelText('Period'), 'Yearly')

    await user.click(screen.getByRole('button', { name: /Import usage CSV/i }))
    const importDialog = screen.getByRole('dialog', { name: 'Import water & electricity usage' })
    await user.click(within(importDialog).getByRole('button', { name: 'Use sample file' }))
    await user.click(within(importDialog).getByRole('button', { name: 'Review rows' }))
    await user.click(within(importDialog).getByRole('button', { name: /Import \d+ rows/i }))
    await user.click(within(importDialog).getByRole('button', { name: 'View usage' }))

    cleanup()
    openPreview('/phase2-preview/payments?view=reports')
    await user.click(screen.getByRole('button', { name: 'Tenant' }))
    await user.selectOptions(screen.getByLabelText('Billing period'), 'All months')
    await user.click(screen.getByRole('button', { name: /Export report/i }))
    expect(screen.getByRole('status')).toHaveTextContent('Sample report exported')
    vi.restoreAllMocks()
  })

  it('exercises Phase1Design Dashboard, Contracts, and Appliances flows', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/dashboard')

    await user.selectOptions(screen.getByLabelText('Floor'), '1')
    await user.click(screen.getByRole('button', { name: 'Available' }))
    await user.click(screen.getByRole('button', { name: /Room 103/i }))
    const roomDialog = screen.getByRole('dialog', { name: 'Room 103' })
    await user.click(within(roomDialog).getByRole('button', { name: 'Close dialog' }))

    cleanup()
    openPreview('/phase2-preview/contracts')
    await user.click(screen.getByRole('button', { name: /Create contract/i }))
    const contractDialog = screen.getByRole('dialog', { name: 'Create contract' })
    await user.type(within(contractDialog).getByLabelText('Tenant name'), 'Kana S.')
    await user.click(within(contractDialog).getByRole('button', { name: 'Save contract' }))
    expect(screen.getByRole('status')).toHaveTextContent('Contract saved in preview memory')

    await user.click(screen.getByRole('button', { name: 'View contract 101' }))
    const viewContractDialog = screen.getByRole('dialog', { name: 'Contract details' })
    await user.click(within(viewContractDialog).getByRole('button', { name: 'Close' }))

    cleanup()
    openPreview('/phase2-preview/appliances')
    await user.click(screen.getByRole('button', { name: /New request/i }))
    const reqDialog = screen.getByRole('dialog', { name: 'New appliance request' })
    await user.click(within(reqDialog).getByRole('button', { name: 'Save request' }))
    expect(screen.getByRole('status')).toHaveTextContent('Rental request saved')

    await user.click(screen.getByRole('button', { name: 'Appliance catalog' }))
    await user.click(screen.getByRole('button', { name: /Add appliance/i }))
    const appDialog = screen.getByRole('dialog', { name: /Add appliance/i })
    await user.click(within(appDialog).getByRole('button', { name: /Cancel/i }))
  })

  it('exercises OperationsDesign supplies, schedule, fuzzy search, and RBAC matrix', async () => {
    const user = userEvent.setup()
    openPreview('/phase2-preview/maintenance?view=supplies')
    await user.click(screen.getByRole('button', { name: 'View low stock' }))
    await user.click(screen.getByRole('button', { name: /Restock Air Filters/i }))
    const restockDialog = screen.getByRole('dialog', { name: 'Restock supply' })
    await user.click(within(restockDialog).getByRole('button', { name: 'Confirm restock' }))
    expect(screen.getByRole('status')).toHaveTextContent('Sample inventory updated')

    cleanup()
    openPreview('/phase2-preview/maintenance?view=schedule')
    await user.click(screen.getByRole('button', { name: /Create draft task for Air conditioner/i }))
    expect(screen.getByRole('status')).toHaveTextContent('Draft maintenance task created')

    cleanup()
    openPreview('/phase2-preview/tenants')
    await user.type(screen.getByRole('textbox', { name: 'Search tenants' }), 'kart')
    expect(screen.getByText('Similar name')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Include similar names' }))

    cleanup()
    openPreview('/phase2-preview/settings')
    await user.click(screen.getByRole('button', { name: 'Team & Access' }))
    await user.click(screen.getByRole('checkbox', { name: 'Accountant: View unit & tenant details' }))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))
    expect(screen.getByRole('status')).toHaveTextContent('Role assignments and permissions saved')
    await user.click(screen.getByRole('button', { name: 'Reset permissions' }))
    await user.selectOptions(screen.getByLabelText('Preview as role'), 'Accountant')
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled()
  })
})
