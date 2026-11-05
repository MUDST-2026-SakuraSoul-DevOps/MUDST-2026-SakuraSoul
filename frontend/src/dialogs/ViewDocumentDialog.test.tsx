import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StoredDocument } from '../domain/documents'
import { ViewDocumentDialog } from './ViewDocumentDialog'

/*
  DocumentsPage.test.tsx already opens this dialog for a seeded archival record,
  so that path is covered. What was left untested is everything that only
  happens for a document people actually uploaded: the inline preview, the
  download, the print button, and the OCR block from SSK-175.

  PH2-02 / SSK-161 scenario S1 asks that an uploaded file come back byte for
  byte, compared by sha256. That belongs to a backend that does not exist yet:
  here the File object never leaves the browser, so this file checks that the
  preview and the download are wired to that same File, and no further.

  jsdom has no URL.createObjectURL, no real download, and no window.print or
  window.alert, so all four are replaced below. The stand-in URL is deliberately
  not a blob: one: the PDF preview puts it on an iframe, and jsdom gives a blob:
  frame an opaque origin whose localStorage getter then throws. The scheme is
  irrelevant to what these cases check, which is that the preview and the
  download both point at whatever URL the component made for that File.
*/

const OBJECT_URL = 'http://localhost/sakura-fake-object-url'

let clicked: HTMLAnchorElement[] = []
let printSpy: ReturnType<typeof vi.fn>
let alertSpy: ReturnType<typeof vi.fn>

function archivalDoc(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: 1,
    name: 'Lease agreement · Kant S.',
    category: 'Contract',
    unit: '101',
    tenant: 'Kant S.',
    date: '2026-10-01',
    size: '2.4 MB',
    ...overrides,
  }
}

function pdf(name = 'signed-lease.pdf') {
  return new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' })
}

function image(name = 'id-card.png') {
  return new File(['fake png bytes'], name, { type: 'image/png' })
}

beforeEach(() => {
  clicked = []
  URL.createObjectURL = vi.fn(() => OBJECT_URL)
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this)
  })
  printSpy = vi.fn()
  alertSpy = vi.fn()
  vi.stubGlobal('print', printSpy)
  vi.stubGlobal('alert', alertSpy)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ViewDocumentDialog', () => {
  it('renders nothing when there is no document selected', () => {
    const { container } = render(<ViewDocumentDialog doc={null} onClose={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the archival paper record when the document has no uploaded file', () => {
    render(<ViewDocumentDialog doc={archivalDoc()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Lease agreement · Kant S.' })).toBeInTheDocument()
    expect(screen.getByText('Contract · Unit 101 · Kant S.')).toBeInTheDocument()
    expect(screen.getByText('2.4 MB')).toBeInTheDocument()
    expect(screen.getByText(/Verified scanned archival record/)).toBeInTheDocument()

    // Nothing was uploaded, so there is no preview of real bytes to show.
    expect(screen.queryByTitle('Lease agreement · Kant S.')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to a placeholder size when the record has none', () => {
    render(<ViewDocumentDialog doc={archivalDoc({ size: undefined })} onClose={vi.fn()} />)

    // The fallback is cosmetic, but it must not render an empty cell.
    expect(screen.getByText('1.2 MB')).toBeInTheDocument()
  })

  it('previews an uploaded PDF in a frame pointed at the file itself', () => {
    const file = pdf()
    render(<ViewDocumentDialog doc={archivalDoc({ name: file.name, file })} onClose={vi.fn()} />)

    const frame = screen.getByTitle('signed-lease.pdf')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('src', OBJECT_URL)
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
  })

  it('previews an uploaded image with a described alt text', () => {
    const file = image()
    render(<ViewDocumentDialog doc={archivalDoc({ name: file.name, file })} onClose={vi.fn()} />)

    const img = screen.getByAltText('Document preview for id-card.png')
    expect(img).toHaveAttribute('src', OBJECT_URL)
    expect(screen.queryByTitle('id-card.png')).not.toBeInTheDocument()
  })

  it('releases the preview URL when the dialog closes', () => {
    const { unmount } = render(
      <ViewDocumentDialog doc={archivalDoc({ file: pdf() })} onClose={vi.fn()} />,
    )
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    unmount()

    // Without this the blob stays alive for the whole session, which matters
    // on a page people open one document after another from.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL)
  })

  it('shows the extracted OCR details when the document carries them', () => {
    render(
      <ViewDocumentDialog
        doc={archivalDoc({
          ocrData: {
            tenantName: 'Kant Sakda',
            nationalId: '1-1004-87654-32-1',
            phone: '081-234-5678',
            leaseStart: '2026-11-01',
            confidence: 94,
            // Required by OcrExtractionData and carried through the whole
            // upload flow, yet this block never puts it on screen.
            extractedAt: '02 Nov 2026',
          },
        })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/Extracted Contract Details \(Local OCR\)/)).toBeInTheDocument()
    expect(screen.getByText(/Confidence: 94% · Verified/)).toBeInTheDocument()
    expect(screen.getByText('Kant Sakda')).toBeInTheDocument()
    expect(screen.getByText('1-1004-87654-32-1')).toBeInTheDocument()
    expect(screen.getByText('081-234-5678')).toBeInTheDocument()
    expect(screen.getByText('2026-11-01')).toBeInTheDocument()
  })

  it('hides the OCR block for a document that was never scanned', () => {
    render(<ViewDocumentDialog doc={archivalDoc()} onClose={vi.fn()} />)

    expect(screen.queryByText(/Extracted Contract Details/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Confidence:/)).not.toBeInTheDocument()
  })

  it('downloads the uploaded file under the document name', async () => {
    const file = pdf('scan-0042.pdf')
    render(
      <ViewDocumentDialog
        doc={archivalDoc({ name: 'Lease agreement · Kant S.', file })}
        onClose={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Download file/ }))

    expect(clicked).toHaveLength(1)
    // The saved file is named after the document, not after whatever the
    // uploader happened to call it on their own disk.
    expect(clicked[0].download).toBe('Lease agreement · Kant S.')
    expect(clicked[0].href).toContain(OBJECT_URL)
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL)
  })

  it('only announces a download for an archival record with no file behind it', async () => {
    render(<ViewDocumentDialog doc={archivalDoc()} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /Download file/ }))

    // Seeded records have no bytes, so the button cannot save anything. Pinning
    // the alert keeps that honest instead of handing over an empty file.
    expect(alertSpy).toHaveBeenCalledWith('Downloading Lease agreement · Kant S....')
    expect(clicked).toHaveLength(0)
  })

  it('sends the document to the printer', async () => {
    render(<ViewDocumentDialog doc={archivalDoc()} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /Print/ }))

    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('closes from the footer button and from the dialog header', async () => {
    const onClose = vi.fn()
    render(<ViewDocumentDialog doc={archivalDoc()} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
