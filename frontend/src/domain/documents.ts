import { useState, useEffect } from 'react'

export type DocumentCategory = 'Contract' | 'Maintenance report' | 'Receipt'

export interface OcrExtractionData {
  tenantName: string
  nationalId: string
  phone: string
  leaseStart: string
  monthlyRent?: number
  securityDeposit?: number
  confidence: number
  extractedAt: string
}

export interface StoredDocument {
  id: number
  name: string
  category: DocumentCategory
  unit: string
  tenant: string
  date: string
  size?: string
  file?: File
  ocrData?: OcrExtractionData
}

export const INITIAL_DOCUMENTS: StoredDocument[] = [
  { id: 1, name: 'Lease agreement · Kant S.', category: 'Contract', unit: '101', tenant: 'Kant S.', date: '01 Jan 2026', size: '2.4 MB' },
  { id: 2, name: 'Air conditioner service report', category: 'Maintenance report', unit: '101', tenant: 'Kant S.', date: '09 Aug 2026', size: '1.8 MB' },
  { id: 3, name: 'Payment receipt · November', category: 'Receipt', unit: '102', tenant: 'Mali P.', date: '04 Nov 2026', size: '640 KB' },
  { id: 4, name: 'Lease agreement · Mali P.', category: 'Contract', unit: '102', tenant: 'Mali P.', date: '01 Feb 2026', size: '2.1 MB' },
  { id: 5, name: 'Plumbing inspection report', category: 'Maintenance report', unit: '201', tenant: 'Narin K.', date: '15 Oct 2026', size: '3.2 MB' },
  { id: 6, name: 'Payment receipt · October', category: 'Receipt', unit: '101', tenant: 'Kant S.', date: '05 Oct 2026', size: '580 KB' },
]

export const ALL_ROOM_NUMBERS = [
  '101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112',
  '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212',
]

export const KNOWN_TENANTS: Record<string, string> = {
  '101': 'Kant S.',
  '102': 'Mali P.',
  '103': 'Kenji S.',
  '104': 'Aoi T.',
  '201': 'Narin K.',
  '202': 'Pim W.',
  '206': 'Yuki T.',
  '207': 'Daiki M.',
}

export function getTenantForUnit(unit: string): string {
  return KNOWN_TENANTS[unit] || '—'
}

/**
 * SSK-175: Local OCR contract simulation
 * Extracts tenant name, masked national ID, phone, lease start date, and rates
 */
export function simulateContractOcr(_file?: File, unit = '101'): OcrExtractionData {
  const defaultTenant = getTenantForUnit(unit)
  const tenantName = unit === '101' ? 'Kant Srisuk' : defaultTenant !== '—' ? defaultTenant : 'Kant Srisuk'
  const isFloor2 = unit.startsWith('2')

  return {
    tenantName,
    nationalId: '1-1004-87654-32-1',
    phone: '081-234-5678',
    leaseStart: '2026-11-01',
    monthlyRent: isFloor2 ? 5000 : 4500,
    securityDeposit: isFloor2 ? 10000 : 9000,
    confidence: 94,
    extractedAt: '02 Nov 2026',
  }
}

const STORAGE_KEY = 'sakura_soul_documents'
const EVENT_KEY = 'sakura_soul_documents_updated'

// In-memory file cache for files uploaded during current session
const fileCache = new Map<number, File>()

export function validateDocumentFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Choose a PDF, JPG or PNG file no larger than 10 MB.',
    }
  }

  const maxSizeBytes = 10 * 1024 * 1024 // 10 MB
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: 'Choose a PDF, JPG or PNG file no larger than 10 MB.',
    }
  }

  return { valid: true }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getStoredDocuments(): StoredDocument[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return INITIAL_DOCUMENTS.map(doc => ({ ...doc, file: fileCache.get(doc.id) }))
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return INITIAL_DOCUMENTS.map(doc => ({ ...doc, file: fileCache.get(doc.id) }))
    }
    const docs = JSON.parse(raw) as StoredDocument[]
    return docs.map(doc => ({
      ...doc,
      file: fileCache.get(doc.id),
    }))
  } catch {
    return INITIAL_DOCUMENTS.map(doc => ({ ...doc, file: fileCache.get(doc.id) }))
  }
}

export function getCategoryBadgeClass(category: DocumentCategory): string {
  switch (category) {
    case 'Contract':
      return 'bg-blue-50 text-blue-700 border-blue-200/70'
    case 'Maintenance report':
      return 'bg-amber-50 text-amber-700 border-amber-200/70'
    case 'Receipt':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
  }
}

export function saveStoredDocuments(docs: StoredDocument[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    // Strip file property before serializing to localStorage
    const serializable = docs.map((doc) => {
      const copy = { ...doc }
      delete copy.file
      return copy
    })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
    window.dispatchEvent(new Event(EVENT_KEY))
  } catch {
    // Ignore storage quota errors
  }
}

export function addStoredDocument(docData: Omit<StoredDocument, 'id'> & { file?: File }): StoredDocument {
  const existing = getStoredDocuments()
  const nextId = existing.length > 0 ? Math.max(...existing.map(d => d.id)) + 1 : 1

  if (docData.file) {
    fileCache.set(nextId, docData.file)
  }

  const newDoc: StoredDocument = {
    ...docData,
    id: nextId,
    size: docData.size || (docData.file ? formatFileSize(docData.file.size) : '1.0 MB'),
  }

  const updated = [newDoc, ...existing]
  saveStoredDocuments(updated)
  return newDoc
}

export function deleteStoredDocument(id: number): boolean {
  const existing = getStoredDocuments()
  const filtered = existing.filter(d => d.id !== id)
  if (filtered.length === existing.length) return false

  fileCache.delete(id)
  saveStoredDocuments(filtered)
  return true
}

export function resetStoredDocuments(): void {
  fileCache.clear()
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new Event(EVENT_KEY))
  }
}

export function useDocuments(): [
  StoredDocument[],
  (doc: Omit<StoredDocument, 'id'> & { file?: File }) => StoredDocument,
  (id: number) => boolean,
  () => void,
] {
  const [docs, setDocs] = useState<StoredDocument[]>(getStoredDocuments)

  useEffect(() => {
    function handleUpdate() {
      setDocs(getStoredDocuments())
    }

    window.addEventListener(EVENT_KEY, handleUpdate)
    window.addEventListener('storage', handleUpdate)

    return () => {
      window.removeEventListener(EVENT_KEY, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  return [docs, addStoredDocument, deleteStoredDocument, resetStoredDocuments]
}
