import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_TYPE_LABEL,
  documentOwnerLabel,
  documentTitle,
  documentTypeFromParam,
  formatFileSize,
  ocrDescription,
  simulateContractOcr,
} from './documents'

describe('documentTypeFromParam (SSK-172)', () => {
  it('reads the labels that other pages link with, and the API names', () => {
    expect(documentTypeFromParam('Contract')).toBe('CONTRACT_SCAN')
    expect(documentTypeFromParam('Maintenance report')).toBe('MAINTENANCE_REPORT')
    expect(documentTypeFromParam('Receipt')).toBe('RECEIPT_SCAN')
    expect(documentTypeFromParam('RECEIPT_SCAN')).toBe('RECEIPT_SCAN')
  })

  it('treats a missing or unknown value as all types', () => {
    expect(documentTypeFromParam(null)).toBeNull()
    expect(documentTypeFromParam('receipt')).toBeNull()
    expect(documentTypeFromParam('Invoice')).toBeNull()
  })

  it('labels every type the way the tabs show it', () => {
    expect(DOCUMENT_TYPE_LABEL).toEqual({
      CONTRACT_SCAN: 'Contract',
      MAINTENANCE_REPORT: 'Maintenance report',
      RECEIPT_SCAN: 'Receipt',
    })
  })
})

describe('document display helpers (SSK-172)', () => {
  it('uses the description as the title and falls back to the file name', () => {
    expect(documentTitle({ description: 'Signed lease agreement', fileName: 'lease.pdf' })).toBe('Signed lease agreement')
    expect(documentTitle({ description: null, fileName: 'lease.pdf' })).toBe('lease.pdf')
  })

  it('names the owner a document is attached to', () => {
    expect(documentOwnerLabel({ kind: 'LEASE', id: 3 })).toBe('Lease #3')
    expect(documentOwnerLabel({ kind: 'MAINTENANCE_TICKET', id: 41 })).toBe('Maintenance ticket #41')
    expect(documentOwnerLabel({ kind: 'RECEIPT', id: 7 })).toBe('Receipt #7')
  })

  it('formats file sizes', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
})

describe('contract OCR preview (SSK-175)', () => {
  it('fills only the tenant name and start date, never a national ID', () => {
    const ocr = simulateContractOcr({ tenantName: 'Yuki Tanaka', startDate: '2026-01-15' })
    expect(ocr).toEqual({ tenantName: 'Yuki Tanaka', leaseStart: '2026-01-15' })
    expect(ocrDescription(ocr)).toBe('Lease agreement · Yuki Tanaka · from 2026-01-15')
  })
})
