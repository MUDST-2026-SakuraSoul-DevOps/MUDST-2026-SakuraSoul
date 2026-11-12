import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UploadDocumentDialog } from './UploadDocumentDialog'

describe('UploadDocumentDialog', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <UploadDocumentDialog isOpen={false} onClose={() => {}} onUploaded={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows error when submitting without a file', () => {
    const onUploaded = vi.fn()
    render(
      <UploadDocumentDialog isOpen onClose={() => {}} onUploaded={onUploaded} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a PDF, JPG or PNG file first.')
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('rejects unsupported file type and accepts valid PDF with OCR extraction', () => {
    const onClose = vi.fn()
    const onUploaded = vi.fn()

    render(
      <UploadDocumentDialog isOpen onClose={onClose} onUploaded={onUploaded} />,
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const invalidFile = new File(['bad'], 'script.exe', { type: 'application/x-msdownload' })
    fireEvent.change(fileInput, { target: { files: [invalidFile] } })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Upload valid PDF
    const validFile = new File(['pdf content'], 'lease-201.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [validFile] } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Change unit via hidden native select
    const unitSelect = screen.getByLabelText('Linked unit')
    fireEvent.change(unitSelect, { target: { value: '201' } })

    // Trigger OCR extraction preview
    fireEvent.click(screen.getByRole('button', { name: /Preview extraction/i }))
    expect(screen.getByText('Needs manual review')).toBeInTheDocument()

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }))
    expect(onUploaded).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'lease-201.pdf',
        category: 'Contract',
        unit: '201',
        file: validFile,
        ocrData: expect.objectContaining({
          monthlyRent: 5000,
          securityDeposit: 10000,
          confidence: 94,
        }),
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
