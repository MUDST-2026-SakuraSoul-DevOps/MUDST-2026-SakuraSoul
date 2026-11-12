import { describe, expect, it } from 'vitest'
import {
  FILE_TOO_LARGE_MESSAGE,
  MAX_UPLOAD_BYTES,
  NO_FILE_MESSAGE,
  UNREADABLE_FILE_MESSAGE,
  UNSUPPORTED_FILE_MESSAGE,
  checkUploadFile,
  detectFileKind,
  sniffFileKind,
} from './fileSignature'
import { jpegFile, pdfFile, pngFile, renamedExeFile } from '../test/files'

describe('detectFileKind (SSK-161)', () => {
  it('reads the PDF, PNG and JPEG signatures at the start of the file', () => {
    expect(detectFileKind(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('PDF')
    expect(detectFileKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('PNG')
    expect(detectFileKind(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('JPEG')
  })

  it('rejects a signature that is cut short or does not start at byte 0', () => {
    expect(detectFileKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(detectFileKind(new Uint8Array([0x20, 0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull()
    expect(detectFileKind(new Uint8Array([]))).toBeNull()
  })
})

describe('sniffFileKind (SSK-161)', () => {
  it('trusts the content, not the name or the type the browser reports', async () => {
    expect(await sniffFileKind(pngFile('slip.exe'))).toBe('PNG')
    expect(await sniffFileKind(jpegFile('scan.pdf'))).toBe('JPEG')
    expect(await sniffFileKind(pdfFile('lease'))).toBe('PDF')
    expect(await sniffFileKind(renamedExeFile('photo.png'))).toBeNull()
  })
})

describe('checkUploadFile (SSK-161)', () => {
  it('asks for a file when none is chosen or the file is empty', async () => {
    expect(await checkUploadFile(null)).toBe(NO_FILE_MESSAGE)
    expect(await checkUploadFile(undefined)).toBe(NO_FILE_MESSAGE)
    expect(await checkUploadFile(new File([], 'empty.pdf', { type: 'application/pdf' }))).toBe(NO_FILE_MESSAGE)
  })

  it('accepts a file of exactly 5 MB and rejects one byte more', async () => {
    expect(await checkUploadFile(pdfFile('exact.pdf', MAX_UPLOAD_BYTES))).toBeNull()
    expect(await checkUploadFile(pdfFile('over.pdf', MAX_UPLOAD_BYTES + 1))).toBe(FILE_TOO_LARGE_MESSAGE)
  })

  it('checks the size before the type, like the backend', async () => {
    expect(await checkUploadFile(renamedExeFile('huge.png', MAX_UPLOAD_BYTES + 1))).toBe(FILE_TOO_LARGE_MESSAGE)
    expect(await checkUploadFile(renamedExeFile('small.png'))).toBe(UNSUPPORTED_FILE_MESSAGE)
  })

  it('explains a file that the browser can no longer read', async () => {
    const file = pdfFile('moved.pdf')
    Object.defineProperty(file, 'slice', {
      value: () => ({ arrayBuffer: () => Promise.reject(new DOMException('gone', 'NotReadableError')) }),
    })
    expect(await checkUploadFile(file)).toBe(UNREADABLE_FILE_MESSAGE)
  })

  it('uses the same wording as the backend error responses', () => {
    expect(NO_FILE_MESSAGE).toBe('Please choose a file')
    expect(FILE_TOO_LARGE_MESSAGE).toBe('The file is larger than 5 MB')
    expect(UNSUPPORTED_FILE_MESSAGE).toBe('Only PDF, PNG and JPEG files are allowed')
  })
})
