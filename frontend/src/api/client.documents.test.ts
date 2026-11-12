import { beforeEach, describe, expect, it } from 'vitest'
import {
  ApiError,
  deleteAttachment,
  deleteDocument,
  deleteMaintenanceTicket,
  fetchAttachmentContent,
  fetchAttachments,
  fetchDocuments,
  uploadAttachment,
  uploadDocument,
} from './client'
import { mockFetch, resetMockStore } from './mockApi'
import { sha256Hex } from './mockFiles'
import type { DocumentUpload } from './types'
import { MAX_UPLOAD_BYTES } from '../lib/fileSignature'
import { todayInBangkok } from '../format'
import { jpegFile, pdfFile, pngFile, renamedExeFile } from '../test/files'

/*
  เทสผ่าน backend จำลอง (VITE_API_MOCK=1 ใน .env.test) ตัวจำลองต้องตอบเหมือน AttachmentController
  กับ DocumentController ทุกข้อที่หน้าเว็บพึ่ง ข้อความ error ตรงกับ docs/api-contract-documents.md
*/

beforeEach(() => {
  resetMockStore()
})

function upload(overrides: Partial<DocumentUpload> = {}) {
  return uploadDocument({
    file: pdfFile('lease-201.pdf'),
    type: 'CONTRACT_SCAN',
    scanDate: '2026-11-01',
    owner: { kind: 'LEASE', id: 2 },
    ...overrides,
  })
}

async function rejection(promise: Promise<unknown>): Promise<{ status: number; message: string }> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  return { status: (error as ApiError).status, message: (error as ApiError).message }
}

function daysFromToday(days: number): string {
  const date = new Date(`${todayInBangkok()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('GET /documents (SSK-172)', () => {
  it('lists the seeded documents newest scan first, with the room and tenant of each owner', async () => {
    const docs = await fetchDocuments()

    expect(docs.map((d) => d.scanDate)).toEqual([...docs.map((d) => d.scanDate)].sort().reverse())
    expect(docs).toHaveLength(4)
    const lease = docs.find((d) => d.fileName === 'lease-102-signed.pdf')
    expect(lease).toMatchObject({
      type: 'CONTRACT_SCAN',
      description: 'Signed lease agreement',
      owner: { kind: 'LEASE', id: 1, roomNumber: '102', tenantId: 1, tenantName: 'Yuki Tanaka' },
      contentType: 'application/pdf',
    })
    expect(lease?.attachmentId).not.toBe(lease?.id)
    expect(lease?.contentUrl).toBe(`/api/attachments/${lease?.attachmentId}/content`)
    const report = docs.find((d) => d.type === 'MAINTENANCE_REPORT')
    expect(report?.owner).toMatchObject({ kind: 'MAINTENANCE_TICKET', roomNumber: '106', tenantId: null, tenantName: null })
  })

  it('filters by type, room, tenant and scan date range', async () => {
    expect((await fetchDocuments({ type: 'RECEIPT_SCAN' })).map((d) => d.fileName)).toEqual(['RC-2026-0001-stamped.pdf'])

    const room102 = (await fetchDocuments()).find((d) => d.owner.roomNumber === '102')?.owner.roomId
    const inRoom = await fetchDocuments({ roomId: room102 })
    // สัญญาสแกนกับใบเสร็จของสัญญานั้นอยู่ห้องเดียวกัน ค้นข้ามเจ้าของได้
    expect(inRoom.map((d) => d.type).sort()).toEqual(['CONTRACT_SCAN', 'RECEIPT_SCAN'])
    expect(await fetchDocuments({ tenantId: 5 })).toHaveLength(1)
    expect(await fetchDocuments({ roomId: 9999 })).toEqual([])

    const recent = await fetchDocuments({ from: daysFromToday(-30), to: todayInBangkok() })
    expect(recent.map((d) => d.type).sort()).toEqual(['MAINTENANCE_REPORT', 'RECEIPT_SCAN'])
  })

  it('searches the description, file name, room number and tenant name, ignoring case', async () => {
    expect((await fetchDocuments({ q: 'COMPRESSOR' })).map((d) => d.type)).toEqual(['MAINTENANCE_REPORT'])
    expect((await fetchDocuments({ q: 'stamped' })).map((d) => d.type)).toEqual(['RECEIPT_SCAN'])
    expect(await fetchDocuments({ q: '103' })).toHaveLength(1)
    expect(await fetchDocuments({ q: 'arisa' })).toHaveLength(1)
    expect(await fetchDocuments({ q: '%' })).toEqual([])
  })

  it('reads an empty number filter as no filter and refuses one that is not a number, like Spring', async () => {
    const empty = await mockFetch('/documents?roomId=&tenantId=')
    expect(empty.status).toBe(200)
    expect(await empty.json()).toHaveLength(4)
    expect((await mockFetch('/documents?roomId=abc')).status).toBe(400)
  })

  it('rejects an unknown type and a backwards date range with the contract messages', async () => {
    expect(await rejection(fetchDocuments({ type: 'INVOICE' as never }))).toEqual({
      status: 400,
      message: 'Document type must be CONTRACT_SCAN, MAINTENANCE_REPORT or RECEIPT_SCAN',
    })
    expect(await rejection(fetchDocuments({ from: '2026-11-02', to: '2026-11-01' }))).toEqual({
      status: 400,
      message: 'from and to must be YYYY-MM-DD with from not after to',
    })
  })
})

describe('POST /documents (SSK-172)', () => {
  it('stores the real file with a server id and returns the owner details', async () => {
    const created = await upload({ description: '  Renewed lease  ' })

    expect(created).toMatchObject({
      type: 'CONTRACT_SCAN',
      description: 'Renewed lease',
      scanDate: '2026-11-01',
      fileName: 'lease-201.pdf',
      sizeBytes: 1024,
      uploadedBy: 'admin',
      owner: { kind: 'LEASE', id: 2, roomNumber: '201', tenantName: 'Kenji Sato' },
    })
    expect((await fetchDocuments()).map((d) => d.id)).toContain(created.id)

    const content = await fetchAttachmentContent(created.attachmentId)
    expect(content.type).toBe('application/pdf')
    const bytes = await content.arrayBuffer()
    expect(bytes.byteLength).toBe(1024)
    expect(await sha256Hex(bytes)).toBe(created.sha256)
  })

  it('attaches maintenance reports to closed tickets and receipt scans to receipts', async () => {
    const report = await upload({ type: 'MAINTENANCE_REPORT', owner: { kind: 'MAINTENANCE_TICKET', id: 4 } })
    expect(report.owner).toMatchObject({ kind: 'MAINTENANCE_TICKET', id: 4, roomNumber: '201', tenantName: null })

    const receipt = await upload({ type: 'RECEIPT_SCAN', owner: { kind: 'RECEIPT', id: 2 }, file: jpegFile('slip') })
    expect(receipt).toMatchObject({ fileName: 'slip.jpg', contentType: 'image/jpeg' })
    expect(receipt.owner).toMatchObject({ kind: 'RECEIPT', id: 2, roomNumber: '201', tenantId: 2 })
  })

  it('checks the form in the contract order', async () => {
    const empty = new File([], 'empty.pdf', { type: 'application/pdf' })
    expect((await rejection(upload({ file: empty, type: 'INVOICE' as never }))).message).toBe('Please choose a file')
    expect((await rejection(upload({ type: 'INVOICE' as never, scanDate: '' }))).message).toBe(
      'Document type must be CONTRACT_SCAN, MAINTENANCE_REPORT or RECEIPT_SCAN',
    )
    expect((await rejection(upload({ scanDate: '2026-02-30' }))).message).toBe('Please choose the scan date (YYYY-MM-DD)')
    expect((await rejection(upload({ scanDate: '1899-12-31' }))).message).toBe('Please choose the scan date (YYYY-MM-DD)')
    expect((await rejection(upload({ scanDate: daysFromToday(1) }))).message).toBe('The scan date cannot be in the future')
    expect((await rejection(upload({ description: 'x'.repeat(201) }))).message).toBe(
      'The description must be 200 characters or fewer',
    )
    expect(await rejection(upload({ owner: { kind: 'LEASE', id: 999 }, file: renamedExeFile() }))).toEqual({
      status: 404,
      message: 'No lease with id 999',
    })
    expect((await rejection(upload({ owner: { kind: 'MAINTENANCE_TICKET', id: 999 } }))).message).toBe(
      'No maintenance ticket with id 999',
    )
    expect(await rejection(upload({ file: renamedExeFile('huge.pdf', MAX_UPLOAD_BYTES + 1) }))).toEqual({
      status: 413,
      message: 'The file is larger than 5 MB',
    })
    expect(await rejection(upload({ file: renamedExeFile('photo.png') }))).toEqual({
      status: 415,
      message: 'Only PDF, PNG and JPEG files are allowed',
    })
    expect(await fetchDocuments()).toHaveLength(4)
  })

  it('accepts a 200 character description and a file of exactly 5 MB', async () => {
    const created = await upload({ description: 'ก'.repeat(200), file: pdfFile('big.pdf', MAX_UPLOAD_BYTES) })
    expect(created.sizeBytes).toBe(MAX_UPLOAD_BYTES)
  })

  it('names the file after its real content', async () => {
    const created = await upload({ file: pngFile('C:\\fakepath\\contract.exe') })
    expect(created).toMatchObject({ fileName: 'contract.exe.png', contentType: 'image/png' })
  })
})

describe('DELETE /documents/{id} (SSK-172)', () => {
  it('hides the document and its file, and a second delete gets 404', async () => {
    const [first] = await fetchDocuments()

    await deleteDocument(first.id)

    expect((await fetchDocuments()).map((d) => d.id)).not.toContain(first.id)
    expect(await rejection(fetchAttachmentContent(first.attachmentId))).toEqual({
      status: 404,
      message: `No attachment with id ${first.attachmentId}`,
    })
    expect(await rejection(deleteDocument(first.id))).toEqual({ status: 404, message: `No document with id ${first.id}` })
  })

  it('loses the documents of a maintenance ticket that is deleted', async () => {
    const report = await upload({ type: 'MAINTENANCE_REPORT', owner: { kind: 'MAINTENANCE_TICKET', id: 4 } })

    await deleteMaintenanceTicket(4)

    expect((await fetchDocuments()).map((d) => d.id)).not.toContain(report.id)
  })
})

describe('/attachments (SSK-161)', () => {
  it('uploads, lists newest first and deletes a plain attachment', async () => {
    const older = await uploadAttachment(pdfFile('inspection.pdf'), 'LEASE', 3)
    const newer = await uploadAttachment(pngFile('meter.png'), 'LEASE', 3)
    expect(newer).toMatchObject({ ownerType: 'LEASE', ownerId: 3, fileName: 'meter.png', contentType: 'image/png' })

    const listed = await fetchAttachments('LEASE', 3)
    expect(listed.map((a) => a.id)).toEqual([newer.id, older.id])

    await deleteAttachment(older.id)
    expect((await fetchAttachments('LEASE', 3)).map((a) => a.id)).toEqual([newer.id])
  })

  it('keeps the files of scanned documents out of the list and refuses to delete them there', async () => {
    const [seeded] = await fetchDocuments({ type: 'RECEIPT_SCAN' })

    expect(await fetchAttachments('RECEIPT', seeded.owner.id)).toEqual([])
    expect(await rejection(deleteAttachment(seeded.attachmentId))).toEqual({
      status: 409,
      message: 'This file belongs to a document. Delete the document instead',
    })
  })

  it('reports a missing owner and a missing file with the contract messages', async () => {
    expect(await rejection(uploadAttachment(pdfFile(), 'PAYMENT', 5))).toEqual({
      status: 404,
      message: 'No payment with id 5',
    })
    expect(await rejection(fetchAttachments('RECEIPT', 999))).toEqual({ status: 404, message: 'No receipt with id 999' })
    expect(await rejection(uploadAttachment(new File([], 'x.pdf'), 'LEASE', 1))).toEqual({
      status: 400,
      message: 'Please choose a file',
    })
    expect((await rejection(uploadAttachment(pdfFile(), 'TENANT' as never, 1))).message).toBe(
      'Choose what this file belongs to',
    )
    expect((await rejection(fetchAttachmentContent(9999))).message).toBe('No attachment with id 9999')
  })
})
