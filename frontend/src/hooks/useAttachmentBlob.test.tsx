import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAttachmentBlob } from './useAttachmentBlob'
import { resetMockStore } from '../api/mockApi'

/** ไฟล์ของเอกสารตัวอย่างใน backend จำลอง 11 เป็น PDF 12 เป็น PNG */
const PDF_FILE = 11
const PNG_FILE = 12

let created = 0

beforeEach(() => {
  resetMockStore()
  created = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:file-${++created}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAttachmentBlob (SSK-161)', () => {
  it('loads the file into an object URL and revokes it when unmounted', async () => {
    const { result, unmount } = renderHook(() => useAttachmentBlob(PNG_FILE))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.url).toBe('blob:file-1'))
    expect(result.current.blob?.type).toBe('image/png')
    expect(result.current.loading).toBe(false)

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file-1')
  })

  it('shows nothing while another file loads', async () => {
    const { result, rerender } = renderHook(({ id }) => useAttachmentBlob(id), { initialProps: { id: PDF_FILE } })
    await waitFor(() => expect(result.current.url).toBe('blob:file-1'))

    rerender({ id: PNG_FILE })
    expect(result.current).toMatchObject({ url: null, loading: true })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file-1')
    await waitFor(() => expect(result.current.url).toBe('blob:file-2'))
  })

  it('never shows a revoked URL when going back to a file before the other one loads', async () => {
    const { result, rerender } = renderHook(({ id }) => useAttachmentBlob(id), { initialProps: { id: PDF_FILE } })
    await waitFor(() => expect(result.current.url).toBe('blob:file-1'))

    rerender({ id: PNG_FILE })
    rerender({ id: PDF_FILE })

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file-1')
    expect(result.current).toMatchObject({ url: null, loading: true })
    await waitFor(() => expect(result.current.url).toBe('blob:file-2'))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('reports a file that cannot be opened', async () => {
    const { result } = renderHook(() => useAttachmentBlob(9999))

    await waitFor(() => expect(result.current.error).toBe('No attachment with id 9999'))
    expect(result.current).toMatchObject({ url: null, blob: null, loading: false })
  })

  it('does nothing without a file', () => {
    const { result } = renderHook(() => useAttachmentBlob(null))
    expect(result.current).toEqual({ url: null, blob: null, error: null, loading: false })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
