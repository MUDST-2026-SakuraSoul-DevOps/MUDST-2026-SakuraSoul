import { beforeEach, describe, expect, it } from 'vitest'
import {
  INITIAL_DOCUMENTS,
  addStoredDocument,
  deleteStoredDocument,
  formatFileSize,
  getStoredDocuments,
  getTenantForUnit,
  resetStoredDocuments,
  simulateContractOcr,
  validateDocumentFile,
} from './documents'

describe('Documents domain (SSK-161 & SSK-172)', () => {
  beforeEach(() => {
    resetStoredDocuments()
  })

  it('provides initial seed documents', () => {
    const docs = getStoredDocuments()
    expect(docs).toHaveLength(INITIAL_DOCUMENTS.length)
    expect(docs.some(d => d.category === 'Contract')).toBe(true)
    expect(docs.some(d => d.category === 'Maintenance report')).toBe(true)
    expect(docs.some(d => d.category === 'Receipt')).toBe(true)
  })

  it('SSK-161: validates file types and 10MB size limit', () => {
    // Valid PDF
    const validPdf = new File(['%PDF-1.4 test'], 'lease.pdf', { type: 'application/pdf' })
    expect(validateDocumentFile(validPdf)).toEqual({ valid: true })

    // Valid JPG
    const validJpg = new File(['fake-jpg'], 'photo.jpg', { type: 'image/jpeg' })
    expect(validateDocumentFile(validJpg)).toEqual({ valid: true })

    // Valid PNG
    const validPng = new File(['fake-png'], 'receipt.png', { type: 'image/png' })
    expect(validateDocumentFile(validPng)).toEqual({ valid: true })

    // Invalid file type (e.g. text/plain or exe)
    const invalidTxt = new File(['some text'], 'test.txt', { type: 'text/plain' })
    const resTxt = validateDocumentFile(invalidTxt)
    expect(resTxt.valid).toBe(false)
    expect(resTxt.error).toContain('PDF, JPG or PNG')

    // File exceeding 10 MB
    const largeFile = new File([''], 'huge.pdf', { type: 'application/pdf' })
    Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 })
    const resLarge = validateDocumentFile(largeFile)
    expect(resLarge.valid).toBe(false)
    expect(resLarge.error).toContain('10 MB')
  })

  it('formats file sizes accurately', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('SSK-161: adds, retrieves, and deletes documents with persistence', () => {
    const newDoc = addStoredDocument({
      name: 'Test Report.pdf',
      category: 'Maintenance report',
      unit: '202',
      tenant: 'Pim W.',
      date: '02 Nov 2026',
    })

    expect(newDoc.id).toBeDefined()
    const listAfterAdd = getStoredDocuments()
    expect(listAfterAdd[0].name).toBe('Test Report.pdf')
    expect(listAfterAdd[0].id).toBe(newDoc.id)

    // Delete
    const deleted = deleteStoredDocument(newDoc.id)
    expect(deleted).toBe(true)
    const listAfterDel = getStoredDocuments()
    expect(listAfterDel.some(d => d.id === newDoc.id)).toBe(false)
  })

  it('SSK-175: simulates local OCR extraction for contracts with confidence score', () => {
    const ocr101 = simulateContractOcr(undefined, '101')
    expect(ocr101.tenantName).toBe('Kant Srisuk')
    expect(ocr101.nationalId).toBe('1-1004-87654-32-1')
    expect(ocr101.phone).toBe('081-234-5678')
    expect(ocr101.confidence).toBe(94)
    expect(ocr101.monthlyRent).toBe(4500)

    const ocr201 = simulateContractOcr(undefined, '201')
    expect(ocr201.tenantName).toBe('Narin K.')
    expect(ocr201.monthlyRent).toBe(5000)
  })

  it('resolves tenant names from room numbers', () => {
    expect(getTenantForUnit('101')).toBe('Kant S.')
    expect(getTenantForUnit('102')).toBe('Mali P.')
    expect(getTenantForUnit('999')).toBe('—')
  })
})
