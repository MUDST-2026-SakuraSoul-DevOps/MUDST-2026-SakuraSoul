import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { deleteDocument, fetchDocuments } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import { sha256Hex } from '../api/mockFiles'
import type { ScannedDocument } from '../api/types'
import { formatFileSize } from '../domain/documents'
import { ViewDocumentDialog } from './ViewDocumentDialog'

/*
  DocumentsPage.test.tsx opens this dialog from the page. This file works it on its own: the inline
  preview, the download, the details and both ways to close it.

  PH2-02 / SSK-161 scenario S1 asks that an uploaded file come back byte for byte, compared by sha256.
  Since SSK-161/172 the file lives on the server (here the in-browser mock backend, which follows the
  Spring rules), so this file checks that the preview and the download are made from the bytes the
  server sends back, and that their sha256 is the one the API reported for the document.

  jsdom has no URL.createObjectURL and no real download, so both are replaced below. The stand-in URL
  is deliberately not a blob: one: the PDF preview puts it on an iframe, and jsdom gives a blob: frame
  an opaque origin whose localStorage getter then throws. The scheme is irrelevant to what these cases
  check, which is that the preview and the download both point at the URL made for the stored file.

  The cases for the old paper card, the Print button and the OCR block are gone with those features:
  every document has a real file now, the browser's PDF viewer prints it, and OCR data (with the
  national ID) is no longer stored with a document.
*/

const OBJECT_URL = 'http://localhost/sakura-fake-object-url'

let clicked: HTMLAnchorElement[] = []
let previewed: Blob[] = []

async function seeded(fileName: string): Promise<ScannedDocument> {
  const doc = (await fetchDocuments()).find((d) => d.fileName === fileName)
  if (!doc) {
    throw new Error(`No seeded document ${fileName}`)
  }
  return doc
}

async function sha256Of(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer())
}

beforeEach(() => {
  resetMockStore()
  clicked = []
  previewed = []
  URL.createObjectURL = vi.fn((blob: Blob) => {
    previewed.push(blob)
    return OBJECT_URL
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ViewDocumentDialog', () => {
  it('previews a PDF in a frame made from the stored file, byte for byte', async () => {
    const doc = await seeded('lease-102-signed.pdf')

    render(<ViewDocumentDialog doc={doc} onClose={vi.fn()} />)

    const frame = await screen.findByTitle('File of Signed lease agreement')
    expect(frame).toHaveAttribute('src', OBJECT_URL)
    expect(previewed).toHaveLength(1)
    expect(await sha256Of(previewed[0])).toBe(doc.sha256)
  })

  it('previews an image with a described alt text', async () => {
    const doc = await seeded('ac-compressor-106.png')

    render(<ViewDocumentDialog doc={doc} onClose={vi.fn()} />)

    expect(await screen.findByAltText('Scan of Technician report for the AC compressor')).toHaveAttribute('src', OBJECT_URL)
    expect(screen.queryByTitle(/^File of/)).not.toBeInTheDocument()
  })

  it('releases the preview URL when the dialog closes', async () => {
    const doc = await seeded('lease-102-signed.pdf')
    const { unmount } = render(<ViewDocumentDialog doc={doc} onClose={vi.fn()} />)
    await screen.findByTitle('File of Signed lease agreement')

    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL)
  })

  it('shows what the file is attached to, when it was scanned and who uploaded it', async () => {
    const doc = await seeded('RC-2026-0001-stamped.pdf')

    render(<ViewDocumentDialog doc={doc} onClose={vi.fn()} />)

    // ไม่มีคำอธิบาย หัวป็อปอัปจึงเป็นชื่อไฟล์
    expect(screen.getByRole('dialog', { name: 'RC-2026-0001-stamped.pdf' })).toBeInTheDocument()
    expect(screen.getByText('Receipt · Unit 102 · Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Receipt #1')).toBeInTheDocument()
    expect(screen.getByText(`RC-2026-0001-stamped.pdf · ${formatFileSize(doc.sizeBytes)}`)).toBeInTheDocument()
    expect(screen.getByText(/by admin$/)).toBeInTheDocument()
  })

  it('downloads the stored file under its stored name', async () => {
    const doc = await seeded('lease-102-signed.pdf')
    render(<ViewDocumentDialog doc={doc} onClose={vi.fn()} />)
    await screen.findByTitle('File of Signed lease agreement')

    await userEvent.click(screen.getByRole('button', { name: 'Download file' }))

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('lease-102-signed.pdf')
    expect(clicked[0].href).toBe(OBJECT_URL)
    expect(await sha256Of(previewed[previewed.length - 1])).toBe(doc.sha256)
  })

  it('keeps Download disabled and explains why when the file cannot be opened', async () => {
    const doc = await seeded('lease-103-ended.pdf')
    await deleteDocument(doc.id)

    render(<ViewDocumentDialog doc={doc} onClose={vi.fn()} />)

    expect(await screen.findByText(`No attachment with id ${doc.attachmentId}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download file' })).toBeDisabled()
    expect(clicked).toHaveLength(0)
  })

  it('closes from the footer button and from the dialog header', async () => {
    const doc = await seeded('lease-102-signed.pdf')
    const onClose = vi.fn()
    render(<ViewDocumentDialog doc={doc} onClose={onClose} />)
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
