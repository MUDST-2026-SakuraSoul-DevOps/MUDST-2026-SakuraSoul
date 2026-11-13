import { describe, expect, it, vi, afterEach } from 'vitest'
import { downloadBlob, downloadDataUrl, downloadTextFile } from './downloadFile'

describe('downloadFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloads a Blob by creating and revoking an object URL', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const blob = new Blob(['hello'], { type: 'text/plain' })
    downloadBlob('hello.txt', blob)

    expect(createSpy).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('downloads a Data URL directly via an anchor element', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const createElementSpy = vi.spyOn(document, 'createElement')

    downloadDataUrl('qr.png', 'data:image/png;base64,abc123')

    const anchor = createElementSpy.mock.results.find(
      (r) => r.value instanceof HTMLAnchorElement,
    )?.value as HTMLAnchorElement
    expect(anchor.href).toBe('data:image/png;base64,abc123')
    expect(anchor.download).toBe('qr.png')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('wraps text content into a Blob and downloads it', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:text-url')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadTextFile('report.csv', 'a,b\n1,2', 'text/csv;charset=utf-8')

    expect(createSpy).toHaveBeenCalledTimes(1)
    const arg = createSpy.mock.calls[0][0] as Blob
    expect(arg.type).toBe('text/csv;charset=utf-8')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith('blob:text-url')
  })
})
