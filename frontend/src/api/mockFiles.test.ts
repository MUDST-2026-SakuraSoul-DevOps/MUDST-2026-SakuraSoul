import { afterEach, describe, expect, it, vi } from 'vitest'
import { isIsoDate, positiveId, safeFileName, samplePdf, samplePng, sha256Hex, withoutControls } from './mockFiles'
import { detectFileKind } from '../lib/fileSignature'

describe('safeFileName (mirrors SafeFileName in the backend)', () => {
  it('strips the path a browser or an attacker sends', () => {
    expect(safeFileName('C:\\fakepath\\slip.jpg', 'JPEG')).toBe('slip.jpg')
    expect(safeFileName('../../etc/passwd.pdf', 'PDF')).toBe('passwd.pdf')
  })

  it('adds the real extension when the name does not match the content', () => {
    expect(safeFileName('x.exe', 'PNG')).toBe('x.exe.png')
    expect(safeFileName('run.bat', 'PDF')).toBe('run.bat.pdf')
    expect(safeFileName('SCAN.JPEG', 'JPEG')).toBe('SCAN.JPEG')
  })

  it('removes control and direction characters, and names an empty result "file"', () => {
    expect(safeFileName('inv\u202Egpj.exe', 'PDF')).toBe('invgpj.exe.pdf')
    expect(safeFileName('a\u0000b.png', 'PNG')).toBe('ab.png')
    expect(safeFileName('..', 'PDF')).toBe('file.pdf')
    expect(safeFileName('', 'PNG')).toBe('file.png')
  })

  it('keeps the extension when it shortens a long name to 150 characters', () => {
    const name = safeFileName(`${'ก'.repeat(200)}.pdf`, 'PDF')
    expect([...name]).toHaveLength(150)
    expect(name.endsWith('.pdf')).toBe(true)
  })
})

describe('form value helpers', () => {
  it('accepts only real calendar dates in YYYY-MM-DD', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-2-3')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })

  it('accepts only positive whole numbers as ids', () => {
    expect(positiveId('12')).toBe(12)
    expect(positiveId(' 7 ')).toBe(7)
    expect(positiveId('0')).toBeNull()
    expect(positiveId('-3')).toBeNull()
    expect(positiveId('1.5')).toBeNull()
    expect(positiveId(null)).toBeNull()
  })

  it('drops control characters such as NUL', () => {
    expect(withoutControls('a\u0000b\tc')).toBe('abc')
  })
})

describe('sample files used by the seeded documents', () => {
  it('builds a PDF whose cross-reference table points at each object', () => {
    const bytes = new Uint8Array(samplePdf(['Lease agreement', 'Unit 102']))
    const text = new TextDecoder().decode(bytes)
    expect(detectFileKind(bytes)).toBe('PDF')

    const xrefAt = Number(text.match(/startxref\n(\d+)/)?.[1])
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const offsets = [...text.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(5)
    offsets.forEach((offset, i) => expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })

  it('decodes the sample PNG', () => {
    expect(detectFileKind(new Uint8Array(samplePng()))).toBe('PNG')
    expect(samplePng().byteLength).toBe(171)
  })

  it('hashes with SHA-256', async () => {
    const abc = new TextEncoder().encode('abc').buffer
    expect(await sha256Hex(abc)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  describe('outside a secure context', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    // เปิดหน้าเว็บจำลองผ่าน http ด้วย IP ของเครื่อง เบราว์เซอร์ไม่ให้ crypto.subtle ต้องได้ค่าว่าง ไม่ใช่ error
    it('leaves the hash empty when crypto.subtle is not available', async () => {
      vi.stubGlobal('crypto', {})
      expect(await sha256Hex(new TextEncoder().encode('abc').buffer)).toBe('')
    })
  })
})
