import { fireEvent, render, screen, within } from '@testing-library/react'
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
