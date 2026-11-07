import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getTenantForUnit } from '../domain/documents'
import { todayInBangkok } from '../format'
import { UploadDocumentDialog } from './UploadDocumentDialog'

/*
  DocumentsPage.test.tsx already drives this dialog end to end once: it rejects
  a .exe and an oversized PDF, auto-fills the title, previews the OCR, and
  submits. What it never touches is every field people actually type in, so the
  eight onChange handlers and the fallbacks in handleSubmit were untested.

  This file works the dialog on its own and asserts the payload handed to
  onUploaded, because that payload is the whole contract between this dialog and
  the library: whatever is wrong in it is wrong in the stored document.

  Dates come from todayInBangkok() rather than a literal, so these cases do not
  start failing on their own tomorrow.
*/

const onUploaded = vi.fn()
const onClose = vi.fn()

function renderDialog(props: Partial<Parameters<typeof UploadDocumentDialog>[0]> = {}) {
  return render(
    <UploadDocumentDialog isOpen onClose={onClose} onUploaded={onUploaded} {...props} />,
  )
}

function pdf(name = 'signed-lease.pdf') {
  return new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' })
}

function fileInput() {
  return screen.getByLabelText('Document file')
}

function titleInput() {
  // The visible labels in this form are not tied to their inputs, so the
  // placeholders are the only stable handles.
  return screen.getByPlaceholderText('e.g. Lease agreement · Kant S.')
}

function tenantInput() {
  return screen.getByPlaceholderText('Tenant name')
}

function ocrFields() {
  // Previewing the extraction copies the tenant name into the main Tenant
  // field too, so the panel's own input is the later of the two.
  const names = screen.getAllByDisplayValue('Kant Srisuk')
  return {
    tenantName: names[names.length - 1],
    nationalId: screen.getByDisplayValue('1-1004-87654-32-1'),
    phone: screen.getByDisplayValue('081-234-5678'),
    leaseStart: screen.getByDisplayValue('2026-11-01'),
  }
}

function uploadedPayload() {
  expect(onUploaded).toHaveBeenCalledTimes(1)
  return onUploaded.mock.calls[0][0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UploadDocumentDialog', () => {
  it('renders nothing while closed', () => {
    const { container } = render(
      <UploadDocumentDialog isOpen={false} onClose={onClose} onUploaded={onUploaded} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('starts on the category and unit it was opened for', () => {
    renderDialog({ initialCategory: 'Receipt', initialUnit: '102' })

    expect(screen.getByLabelText('Document type')).toHaveValue('Receipt')
    expect(screen.getByLabelText('Linked unit')).toHaveValue('102')
    expect(tenantInput()).toHaveValue('Mali P.')
  })

  it('refuses to submit without a file and never calls onUploaded', async () => {
    // Submitting empty must stop at the message. If it falls through instead,
    // the next line reads file.name off null, so the listener catches that
    // crash as well as the assertions below.
    const crashes: string[] = []
    const onError = (e: ErrorEvent) => crashes.push(String(e.message))
    window.addEventListener('error', onError)

    try {
      renderDialog()

      await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

      expect(screen.getByRole('alert')).toHaveTextContent('Choose a PDF, JPG or PNG file first.')
      expect(onUploaded).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(crashes).toEqual([])
    } finally {
      window.removeEventListener('error', onError)
    }
  })

  it('shows the chosen file with its size and type', async () => {
    renderDialog()
    const file = pdf('scan-0042.pdf')
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 })

    await userEvent.upload(fileInput(), file)

    expect(screen.getByText('scan-0042.pdf')).toBeInTheDocument()
    expect(screen.getByText('2.00 MB · application/pdf')).toBeInTheDocument()
    expect(screen.queryByText('Click or drag a file to upload')).not.toBeInTheDocument()
  })

  it('goes back to the empty state when the file picker is cleared', async () => {
    renderDialog()
    await userEvent.upload(fileInput(), pdf())
    expect(screen.getByText('signed-lease.pdf')).toBeInTheDocument()

    // userEvent cannot hand back an empty FileList, so this is the raw event.
    fireEvent.change(fileInput(), { target: { files: [] } })

    expect(screen.getByText('Click or drag a file to upload')).toBeInTheDocument()
  })

  it('keeps a title the uploader typed instead of overwriting it with the file name', async () => {
    renderDialog()

    await userEvent.type(titleInput(), 'Lease agreement · unit 101')
    await userEvent.upload(fileInput(), pdf('raw-scan-0001.pdf'))

    expect(titleInput()).toHaveValue('Lease agreement · unit 101')

    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))
    expect(uploadedPayload().name).toBe('Lease agreement · unit 101')
  })

  it('falls back to the file name when the title is left blank or spaces', async () => {
    renderDialog()

    await userEvent.upload(fileInput(), pdf('raw-scan-0001.pdf'))
    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    expect(uploadedPayload().name).toBe('raw-scan-0001.pdf')
  })

  it('suggests the tenant of the unit that was picked', async () => {
    renderDialog()

    await userEvent.selectOptions(screen.getByLabelText('Linked unit'), '206')

    expect(tenantInput()).toHaveValue('Yuki T.')
  })

  it('leaves the tenant alone for a unit nobody is registered to', async () => {
    renderDialog()
    await userEvent.clear(tenantInput())
    await userEvent.type(tenantInput(), 'Walk-in viewer')

    // 105 has no known tenant, and overwriting with the placeholder dash would
    // throw away what was typed.
    expect(getTenantForUnit('105')).toBe('—')
    await userEvent.selectOptions(screen.getByLabelText('Linked unit'), '105')

    expect(tenantInput()).toHaveValue('Walk-in viewer')
  })

  it('falls back to the unit tenant when the tenant field is emptied', async () => {
    renderDialog({ initialUnit: '102' })

    await userEvent.upload(fileInput(), pdf())
    await userEvent.clear(tenantInput())
    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    expect(uploadedPayload().tenant).toBe('Mali P.')
  })

  it('only offers OCR for contracts', async () => {
    renderDialog()
    expect(screen.getByRole('button', { name: /Preview extraction/ })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Document type'), 'Receipt')

    expect(screen.queryByRole('button', { name: /Preview extraction/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Auto-fill tenant details')).not.toBeInTheDocument()
  })

  it('still fills the OCR panel when asked to extract before a file is chosen', async () => {
    renderDialog()

    // Nothing stops this click, and the extraction is simulated, so it answers
    // with defaults for a document that does not exist yet. Pinned because a
    // real OCR would have to refuse here instead.
    await userEvent.click(screen.getByRole('button', { name: /Preview extraction/ }))

    expect(screen.getByText('Needs manual review')).toBeInTheDocument()
    expect(ocrFields().nationalId).toHaveValue('1-1004-87654-32-1')
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('submits without OCR data when the extraction was never previewed', async () => {
    renderDialog()

    await userEvent.upload(fileInput(), pdf())
    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    const payload = uploadedPayload()
    expect(payload.ocrData).toBeUndefined()
    expect(payload.category).toBe('Contract')
    expect(payload.date).toBe(todayInBangkok())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('carries corrections made to the extracted values into the upload', async () => {
    renderDialog()

    await userEvent.upload(fileInput(), pdf())
    await userEvent.click(screen.getByRole('button', { name: /Preview extraction/ }))

    const ocr = ocrFields()
    await userEvent.clear(ocr.tenantName)
    await userEvent.type(ocr.tenantName, '  Kant Sakda  ')
    await userEvent.clear(ocr.nationalId)
    await userEvent.type(ocr.nationalId, ' 1-2345-67890-12-3 ')
    await userEvent.clear(ocr.phone)
    await userEvent.type(ocr.phone, ' 082-000-1111 ')
    fireEvent.change(ocr.leaseStart, { target: { value: '2026-12-01' } })

    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    const payload = uploadedPayload()
    // The panel calls itself "Needs manual review", so a correction has to win
    // over what the extraction guessed, and stray spaces must not be stored.
    expect(payload.ocrData).toEqual({
      tenantName: 'Kant Sakda',
      nationalId: '1-2345-67890-12-3',
      phone: '082-000-1111',
      leaseStart: '2026-12-01',
      monthlyRent: 4500,
      securityDeposit: 9000,
      confidence: 94,
      extractedAt: todayInBangkok(),
    })
    expect(payload.tenant).toBe('Kant Sakda')
  })

  it('prices a second floor unit higher than a first floor one', async () => {
    renderDialog()

    await userEvent.upload(fileInput(), pdf())
    await userEvent.selectOptions(screen.getByLabelText('Linked unit'), '206')
    await userEvent.click(screen.getByRole('button', { name: /Preview extraction/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    const payload = uploadedPayload()
    expect(payload.unit).toBe('206')
    expect(payload.ocrData?.monthlyRent).toBe(5000)
    expect(payload.ocrData?.securityDeposit).toBe(10000)
  })

  it('closes from Cancel without uploading anything', async () => {
    renderDialog()
    await userEvent.upload(fileInput(), pdf())

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUploaded).not.toHaveBeenCalled()
  })
})
