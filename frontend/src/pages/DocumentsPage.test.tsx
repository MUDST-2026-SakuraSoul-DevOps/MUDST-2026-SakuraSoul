import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DocumentsPage from './DocumentsPage'
import { resetStoredDocuments } from '../domain/documents'

function renderDocumentsPage(initialEntry = '/documents') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/documents" element={<DocumentsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DocumentsPage (SSK-161, SSK-172 & SSK-175)', () => {
  beforeEach(() => {
    resetStoredDocuments()
    vi.restoreAllMocks()
  })

  it('renders page header, 3 bento stat cards, and initial archival records', () => {
    renderDocumentsPage()

    // Page Header
    expect(screen.getByRole('heading', { name: 'Document Library' })).toBeInTheDocument()
    expect(screen.getByText(/Find contracts, maintenance reports, and receipts/i)).toBeInTheDocument()

    // Stat Cards
    expect(screen.getByText('STORED DOCUMENTS')).toBeInTheDocument()
    expect(screen.getByText('CONTRACTS')).toBeInTheDocument()
    expect(screen.getByText('REPORTS & RECEIPTS')).toBeInTheDocument()

    // Initial documents listed
    expect(screen.getByText('Lease agreement · Kant S.')).toBeInTheDocument()
    expect(screen.getByText('Air conditioner service report')).toBeInTheDocument()
    expect(screen.getByText('Payment receipt · November')).toBeInTheDocument()
  })

  it('filters documents by category tabs', () => {
    renderDocumentsPage()

    // Switch to Contract tab
    fireEvent.click(screen.getByRole('button', { name: 'Contract tab' }))
    expect(screen.getByText('Lease agreement · Kant S.')).toBeInTheDocument()
    expect(screen.queryByText('Air conditioner service report')).not.toBeInTheDocument()
    expect(screen.queryByText('Payment receipt · November')).not.toBeInTheDocument()

    // Switch to Maintenance report tab
    fireEvent.click(screen.getByRole('button', { name: 'Maintenance report tab' }))
    expect(screen.getByText('Air conditioner service report')).toBeInTheDocument()
    expect(screen.queryByText('Lease agreement · Kant S.')).not.toBeInTheDocument()

    // Switch to Receipt tab
    fireEvent.click(screen.getByRole('button', { name: 'Receipt tab' }))
    expect(screen.getByText('Payment receipt · November')).toBeInTheDocument()
    expect(screen.queryByText('Air conditioner service report')).not.toBeInTheDocument()

    // Switch back to All documents
    fireEvent.click(screen.getByRole('button', { name: 'All documents tab' }))
    expect(screen.getByText('Lease agreement · Kant S.')).toBeInTheDocument()
    expect(screen.getByText('Air conditioner service report')).toBeInTheDocument()
  })

  it('SSK-172: searches across document name, tenant, unit, and date', () => {
    renderDocumentsPage()

    const searchInput = screen.getByRole('textbox', { name: 'Search documents' })

    // Search by tenant
    fireEvent.change(searchInput, { target: { value: 'Yuki' } })
    expect(screen.getByText('Payment receipt · November')).toBeInTheDocument()
    expect(screen.queryByText('Air conditioner service report')).not.toBeInTheDocument()

    // Search by unit
    fireEvent.change(searchInput, { target: { value: '201' } })
    expect(screen.getByText('Plumbing inspection report')).toBeInTheDocument()
    expect(screen.queryByText('Payment receipt · November')).not.toBeInTheDocument()

    // Search by date
    fireEvent.change(searchInput, { target: { value: '09 Aug' } })
    expect(screen.getByText('Air conditioner service report')).toBeInTheDocument()
    expect(screen.queryByText('Lease agreement · Kant S.')).not.toBeInTheDocument()

    // Reset button clears search
    const resetBtn = screen.getByRole('button', { name: /Reset all filters/i })
    fireEvent.click(resetBtn)
    expect(searchInput).toHaveValue('')
    expect(screen.getByText('Lease agreement · Kant S.')).toBeInTheDocument()
  })

  it('filters documents by linked unit', () => {
    renderDocumentsPage()

    const unitSelect = screen.getByLabelText('Filter by unit')
    fireEvent.change(unitSelect, { target: { value: '102' } })

    expect(screen.getByText('Payment receipt · November')).toBeInTheDocument()
    expect(screen.getByText('Lease agreement · Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Air conditioner service report')).not.toBeInTheDocument()
  })

  it('SSK-161: validates file size and extension when uploading', () => {
    renderDocumentsPage()

    // Open upload dialog
    fireEvent.click(screen.getByRole('button', { name: /Upload document/i }))
    const fileInput = screen.getByLabelText('Document file')

    // 1. Invalid file format
    const invalidFile = new File(['bad content'], 'script.exe', { type: 'application/x-msdownload' })
    fireEvent.change(fileInput, { target: { files: [invalidFile] } })
    expect(screen.getByRole('alert')).toHaveTextContent(/Choose a PDF, JPG or PNG file no larger than 10 MB/i)

    // 2. File size exceeding 10 MB
    const hugeFile = new File([''], 'huge.pdf', { type: 'application/pdf' })
    Object.defineProperty(hugeFile, 'size', { value: 12 * 1024 * 1024 })
    fireEvent.change(fileInput, { target: { files: [hugeFile] } })
    expect(screen.getByRole('alert')).toHaveTextContent(/10 MB/i)
  })

  it('SSK-161 & SSK-175: uploads document with simulated local OCR and adds to library', () => {
    renderDocumentsPage()

    // Open upload dialog
    fireEvent.click(screen.getByRole('button', { name: /Upload document/i }))
    expect(screen.getByRole('dialog', { name: 'Upload document' })).toBeInTheDocument()

    const fileInput = screen.getByLabelText('Document file')
    const validPdf = new File(['%PDF-sample content'], 'signed-lease-101.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [validPdf] } })

    // Document title auto-populated
    expect(screen.getByDisplayValue('signed-lease-101.pdf')).toBeInTheDocument()

    // SSK-175 Bonus OCR Preview
    fireEvent.click(screen.getByRole('button', { name: /Preview extraction/i }))
    expect(screen.getByText('Needs manual review')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Kant Srisuk').length).toBeGreaterThanOrEqual(1)

    // Submit upload
    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    // Dialog closes and new document is in table
    expect(screen.queryByRole('dialog', { name: 'Upload document' })).not.toBeInTheDocument()
    expect(screen.getByText('signed-lease-101.pdf')).toBeInTheDocument()
    expect(screen.getByText('Kant Srisuk')).toBeInTheDocument()

    // View the newly uploaded contract with OCR breakdown
    const viewBtn = screen.getByRole('button', { name: 'View document signed-lease-101.pdf' })
    fireEvent.click(viewBtn)

    const viewModal = screen.getByRole('dialog', { name: 'signed-lease-101.pdf' })
    expect(within(viewModal).getByText(/Extracted Contract Details/i)).toBeInTheDocument()
    expect(within(viewModal).getByText(/Confidence: 94%/i)).toBeInTheDocument()
  })

  it('SSK-172: opens View Document modal with archival details', () => {
    renderDocumentsPage()

    // Click View document on Kant S. agreement
    const viewBtn = screen.getByRole('button', { name: 'View document Lease agreement · Kant S.' })
    fireEvent.click(viewBtn)

    const modal = screen.getByRole('dialog', { name: 'Lease agreement · Kant S.' })
    expect(modal).toBeInTheDocument()
    expect(within(modal).getByText('Unit 101')).toBeInTheDocument()
    expect(within(modal).getByText('Kant S.')).toBeInTheDocument()
    expect(within(modal).getByText(/Verified scanned archival record/i)).toBeInTheDocument()

    // Close modal
    fireEvent.click(within(modal).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Lease agreement · Kant S.' })).not.toBeInTheDocument()
  })

  it('deletes document with confirmation modal', () => {
    renderDocumentsPage()

    expect(screen.getByText('Payment receipt · October')).toBeInTheDocument()

    // Click Delete button
    const deleteBtn = screen.getByRole('button', { name: 'Delete document Payment receipt · October' })
    fireEvent.click(deleteBtn)

    const confirmDialog = screen.getByRole('dialog', { name: 'Confirm Delete Document' })
    expect(confirmDialog).toBeInTheDocument()
    expect(within(confirmDialog).getByText(/Are you sure you want to remove/i)).toBeInTheDocument()

    // Confirm delete
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))

    // Document removed
    expect(screen.queryByText('Payment receipt · October')).not.toBeInTheDocument()
  })

  it('supports URL deep linking (?type=Receipt&unit=102&upload=1)', () => {
    renderDocumentsPage('/documents?type=Receipt&unit=102&upload=1')

    // Dialog opens automatically due to ?upload=1
    const uploadDialog = screen.getByRole('dialog', { name: 'Upload document' })
    expect(uploadDialog).toBeInTheDocument()

    // Pre-populated type and unit
    expect(screen.getByLabelText('Document type')).toHaveValue('Receipt')
    expect(screen.getByLabelText('Linked unit')).toHaveValue('102')
  })

  it('SSK-172: applies both category and unit from a document-library URL', () => {
    renderDocumentsPage('/documents?type=Contract&unit=101')

    expect(screen.getByLabelText('Filter by unit')).toHaveValue('101')
    expect(screen.getByText('Lease agreement · Kant S.')).toBeInTheDocument()
    expect(screen.queryByText('Lease agreement · Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.queryByText('Air conditioner service report')).not.toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.tagName === 'STRONG' && element.textContent === '1')).toBeInTheDocument()
  })
})
