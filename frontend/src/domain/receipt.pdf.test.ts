import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob, downloadDataUrl, downloadTextFile } from '../lib/downloadFile'
import {
  SAMPLE_RECEIPT,
  createReceiptPdfBlob,
  downloadReceipt,
  downloadReceiptImage,
  downloadReceiptPdf,
  renderReceiptToCanvas,
} from './receipt'

/*
  receipt.test.ts covers the arithmetic and the text rendering. This file covers
  the other half of the module: turning a receipt into a file people download.

  The PDF here is assembled byte by byte with a hand-written cross-reference
  table, and a wrong offset in that table produces a file that downloads
  perfectly and then refuses to open. Nothing was checking those offsets, so
  that is what most of this file does.

  Limit worth knowing: jsdom has no 2D canvas context, so renderReceiptToCanvas
  returns at its own `if (!ctx) return canvas` guard and the ~160 drawing lines
  after it never run here. Covering those needs the `canvas` package as a dev
  dependency, which is a team decision, not something a test can work around.
*/

vi.mock('../lib/downloadFile', () => ({
  downloadBlob: vi.fn(),
  downloadDataUrl: vi.fn(),
  downloadTextFile: vi.fn(),
}))

// A real 1x1 JPEG. The code only base64-decodes and embeds it, but using
// genuine JPEG bytes keeps the assertions about /DCTDecode honest.
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

// A real 1x1 red PNG, deliberately different bytes from the transparent
// placeholder the component falls back to, so the two cannot be confused.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * Stands in for a working canvas. It answers with the format the caller asked
 * for, because the PDF path requests image/jpeg and the image download path
 * requests image/png — returning JPEG to both would let a .png file be
 * asserted as holding JPEG bytes.
 */
function fakeCanvasExport() {
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation((type?: string) =>
      type === 'image/png' ? 'data:image/png;base64,' + PNG_BASE64 : 'data:image/jpeg;base64,' + JPEG_BASE64,
    )
}

async function readPdf(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // One character per byte, so a string index is also a byte offset.
  const text = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return { bytes, text }
}

/** The five offsets the cross-reference table claims, in object order. */
function xrefOffsets(text: string): number[] {
  const start = text.indexOf('xref\n0 6\n')
  expect(start).toBeGreaterThan(-1)
  const table = text.slice(start + 'xref\n0 6\n'.length, start + 'xref\n0 6\n'.length + 20 * 6)
  // Each entry is exactly 20 bytes and ends in a newline, so the character
  // class has to include it.
  const entries = table.match(/[\s\S]{20}/g) ?? []
  expect(entries).toHaveLength(6)
  expect(entries[0]).toContain('65535 f')
  return entries.slice(1).map((e) => Number(e.slice(0, 10)))
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('renderReceiptToCanvas', () => {
  it('sizes the canvas and gives up quietly when there is no 2D context', () => {
    const canvas = renderReceiptToCanvas(SAMPLE_RECEIPT)

    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(760)
    // jsdom returns no context. Returning the blank canvas rather than throwing
    // is what keeps the download paths below working in this environment.
    expect(canvas.getContext('2d')).toBeNull()
  })
})

describe('createReceiptPdfBlob', () => {
  it('still produces a PDF when the canvas cannot give back an image', async () => {
    const blob = createReceiptPdfBlob(SAMPLE_RECEIPT)

    expect(blob.type).toBe('application/pdf')
    const { text } = await readPdf(blob)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    // The fallback writes the receipt as text, so there is no image object.
    expect(text).not.toContain('/DCTDecode')
    expect(text).toContain(SAMPLE_RECEIPT.receiptNo)
  })

  it('embeds the canvas JPEG as an image object when one is available', async () => {
    fakeCanvasExport()

    const { bytes, text } = await readPdf(createReceiptPdfBlob(SAMPLE_RECEIPT))

    expect(text).toContain('/Filter /DCTDecode')
    expect(text).toContain('/Width 640 /Height 760')
    expect(text).toContain('/Type /Page')
    expect(text).toContain('/Count 1')

    // The JPEG bytes themselves have to survive into the stream.
    const jpeg = atob(JPEG_BASE64)
    expect(text).toContain(jpeg)
    // /Length must match the real byte count or readers stop at the wrong place.
    expect(text).toContain(`/Length ${jpeg.length} >>`)
    expect(bytes.length).toBeGreaterThan(jpeg.length)
  })

  it('writes a cross-reference offset that really points at each object', async () => {
    fakeCanvasExport()

    const { text } = await readPdf(createReceiptPdfBlob(SAMPLE_RECEIPT))

    // This is the assertion that matters: a PDF with a shifted offset still
    // downloads and still ends in %%EOF, and only fails when someone opens it.
    xrefOffsets(text).forEach((offset, i) => {
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })

  it('points startxref at the cross-reference table itself', async () => {
    fakeCanvasExport()

    const { text } = await readPdf(createReceiptPdfBlob(SAMPLE_RECEIPT))

    const declared = Number(text.match(/startxref\n(\d+)\n/)?.[1])
    expect(Number.isNaN(declared)).toBe(false)
    expect(text.slice(declared, declared + 4)).toBe('xref')
    expect(declared).toBe(text.indexOf('xref\n0 6\n'))
  })

  it('offsets stay correct for a receipt whose text length differs', async () => {
    fakeCanvasExport()

    // Object 5 holds the content stream and object 3 the page, so a longer
    // receipt must shift every later offset by the same amount.
    const longer = {
      ...SAMPLE_RECEIPT,
      receiptNo: 'RC-2026-000000000042',
      tenantName: 'A tenant with a considerably longer display name',
    }
    const { text } = await readPdf(createReceiptPdfBlob(longer))

    xrefOffsets(text).forEach((offset, i) => {
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })

  it('falls back to the plain PDF when the canvas throws', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      throw new Error('tainted canvas')
    })

    const { text } = await readPdf(createReceiptPdfBlob(SAMPLE_RECEIPT))

    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).not.toContain('/DCTDecode')

    // SSK-169 / QA review: /Length in object 4 must match UTF-8 byte count of the stream, not character count
    const streamMatch = text.match(/4 0 obj\n<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/)
    expect(streamMatch).not.toBeNull()
    const declaredLength = Number(streamMatch![1])
    const streamContent = streamMatch![2]
    expect(declaredLength).toBe(streamContent.length)
    expect(declaredLength).toBe(1068)
  })

  it('falls back when the canvas hands back something that is not a JPEG', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,iVBORw0KGgo=',
    )

    const { text } = await readPdf(createReceiptPdfBlob(SAMPLE_RECEIPT))

    // Declaring PNG bytes as /DCTDecode would produce a PDF no reader opens.
    expect(text).not.toContain('/DCTDecode')
    expect(text).toContain(SAMPLE_RECEIPT.receiptNo)
  })
})

describe('download helpers', () => {
  it('names the PDF after the receipt number', () => {
    downloadReceiptPdf(SAMPLE_RECEIPT)

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [filename, blob] = vi.mocked(downloadBlob).mock.calls[0]
    expect(filename).toBe(`${SAMPLE_RECEIPT.receiptNo}.pdf`)
    expect((blob as Blob).type).toBe('application/pdf')
  })

  it('saves the canvas image as a PNG, matching the extension it writes', () => {
    fakeCanvasExport()

    downloadReceiptImage(SAMPLE_RECEIPT)

    // The file is named .png, so what goes inside it has to be a PNG.
    expect(downloadDataUrl).toHaveBeenCalledWith(
      `${SAMPLE_RECEIPT.receiptNo}.png`,
      'data:image/png;base64,' + PNG_BASE64,
    )
  })

  it('saves a placeholder rather than nothing when the canvas is unavailable', () => {
    downloadReceiptImage(SAMPLE_RECEIPT)

    const [filename, dataUrl] = vi.mocked(downloadDataUrl).mock.calls[0]
    expect(filename).toBe(`${SAMPLE_RECEIPT.receiptNo}.png`)
    // A 1x1 transparent PNG. Worth pinning: the file people get in this case
    // is blank, not a receipt, and nothing on screen says so.
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(dataUrl).toContain('iVBORw0KGgo')
    // It has to be the component's own fallback, not the canvas stub leaking
    // in from another case.
    expect(dataUrl).not.toContain(PNG_BASE64)
  })

  it('sends each requested format to its own writer', () => {
    downloadReceipt(SAMPLE_RECEIPT, 'image')
    expect(downloadDataUrl).toHaveBeenCalledTimes(1)
    expect(downloadBlob).not.toHaveBeenCalled()

    downloadReceipt(SAMPLE_RECEIPT, 'text')
    expect(downloadTextFile).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downloadTextFile).mock.calls[0][0]).toBe(`${SAMPLE_RECEIPT.receiptNo}.txt`)

    downloadReceipt(SAMPLE_RECEIPT)
    expect(downloadBlob).toHaveBeenCalledTimes(1)
  })
})
