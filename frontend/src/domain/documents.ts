import type { DocumentOwner, DocumentOwnerKind, DocumentType, Lease, ScannedDocument } from '../api/types'

/**
 * คลังเอกสารสแกน (SSK-161, SSK-172) ฝั่งหน้าจอ ข้อมูลกับไฟล์จริงอยู่ที่ /api/documents (docs/api-contract-documents.md)
 * ไฟล์นี้เหลือแค่ป้าย การอ่านค่าจาก URL การจัดรูปแบบ และ OCR จำลองของ SSK-175
 */

export const DOCUMENT_TYPES: readonly DocumentType[] = ['CONTRACT_SCAN', 'MAINTENANCE_REPORT', 'RECEIPT_SCAN']

/** ป้ายของแต่ละชนิด ใช้ทั้งแท็บ ป้ายในตาราง และค่า ?type= ที่หน้าอื่นลิงก์มา (เช่น /documents?type=Receipt&unit=102) */
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  CONTRACT_SCAN: 'Contract',
  MAINTENANCE_REPORT: 'Maintenance report',
  RECEIPT_SCAN: 'Receipt',
}

/** ?type= รับทั้งป้าย (ลิงก์จากหน้าอื่น) และชื่อชนิดของ API ค่าอื่นหรือไม่ส่งคือทุกชนิด */
export function documentTypeFromParam(param: string | null): DocumentType | null {
  return DOCUMENT_TYPES.find((type) => type === param || DOCUMENT_TYPE_LABEL[type] === param) ?? null
}

export function documentTypeBadgeClass(type: DocumentType): string {
  switch (type) {
    case 'CONTRACT_SCAN':
      return 'bg-blue-50 text-blue-700 border-blue-200/70'
    case 'MAINTENANCE_REPORT':
      return 'bg-amber-50 text-amber-700 border-amber-200/70'
    case 'RECEIPT_SCAN':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
  }
}

/** เจ้าของที่หน้าเว็บให้เลือกตามชนิดเอกสาร backend รับได้ทุกคู่ แต่หน้าเว็บให้เลือกคู่ที่ตรงความหมายเท่านั้น */
export const OWNER_KIND_OF_TYPE: Record<DocumentType, DocumentOwnerKind> = {
  CONTRACT_SCAN: 'LEASE',
  MAINTENANCE_REPORT: 'MAINTENANCE_TICKET',
  RECEIPT_SCAN: 'RECEIPT',
}

const OWNER_KIND_LABEL: Record<DocumentOwnerKind, string> = {
  LEASE: 'Lease',
  MAINTENANCE_TICKET: 'Maintenance ticket',
  RECEIPT: 'Receipt',
}

/** บอกว่าเอกสารแนบกับอะไร เช่น "Lease #3" */
export function documentOwnerLabel(owner: Pick<DocumentOwner, 'kind' | 'id'>): string {
  return `${OWNER_KIND_LABEL[owner.kind]} #${owner.id}`
}

/** ชื่อที่โชว์ในตารางและหัวป็อปอัป คำอธิบายถ้ามี ไม่งั้นชื่อไฟล์ */
export function documentTitle(doc: Pick<ScannedDocument, 'description' | 'fileName'>): string {
  return doc.description ?? doc.fileName
}

/** ตรงกับ document.description VARCHAR(200) */
export const MAX_DESCRIPTION_LENGTH = 200

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ---------- OCR ของสัญญา (SSK-175) ---------- */

export interface OcrExtractionData {
  tenantName: string
  /** YYYY-MM-DD */
  leaseStart: string
}

/**
 * อ่านสัญญาที่สแกนในเบราว์เซอร์ ตอนนี้เป็นตัวจำลองที่ยังไม่ได้อ่านไฟล์จริง จึงตอบชื่อผู้เช่ากับวันเริ่มจากสัญญาที่เลือก
 * ผลลัพธ์ใช้เติมคำอธิบายของเอกสารเท่านั้น ไม่อ่านหรือเก็บเลขบัตรประชาชน (สัญญาเอกสาร หัวข้อสิ่งที่หน้าเว็บต้องเปลี่ยน ข้อ 6)
 */
export function simulateContractOcr(lease: Pick<Lease, 'tenantName' | 'startDate'>): OcrExtractionData {
  return { tenantName: lease.tenantName, leaseStart: lease.startDate }
}

export function ocrDescription(ocr: OcrExtractionData): string {
  return `Lease agreement · ${ocr.tenantName.trim()} · from ${ocr.leaseStart}`
}

/* ---------- ของเดิมที่หน้า Payments ยังเรียกอยู่ ---------- */

/**
 * paymentPhase2.ts ยังเก็บ PDF ของการชำระผ่าน addStoredDocument กับ getStoredDocuments
 * ตอนนี้สองฟังก์ชันนี้เก็บใน localStorage ของเครื่องนี้อย่างเดียว ไม่ส่ง API และหน้า Documents ไม่อ่านค่านี้แล้ว
 * (กับ backend จริงก็ไม่เคยขึ้น เพราะ /api/documents ตอบ 415 กับ JSON)
 * สลิปจะย้ายไป POST /api/attachments ด้วย ownerType=PAYMENT พร้อมหน้าเว็บของการชำระ แล้วลบส่วนนี้ทิ้ง
 */
export type DocumentCategory = 'Contract' | 'Maintenance report' | 'Receipt'

export interface StoredDocument {
  id: number
  name: string
  category: DocumentCategory
  unit: string
  tenant: string
  date: string
  size?: string
  /** ไม่ถูกเก็บ localStorage เก็บไฟล์ไม่ได้ */
  file?: File
}

const LEGACY_STORAGE_KEY = 'sakura_soul_documents'

export function getStoredDocuments(): StoredDocument[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as StoredDocument[]) : []
  } catch {
    return []
  }
}

export function addStoredDocument(doc: Omit<StoredDocument, 'id'>): StoredDocument {
  const existing = getStoredDocuments()
  const created: StoredDocument = {
    id: existing.reduce((max, d) => Math.max(max, d.id), 0) + 1,
    name: doc.name,
    category: doc.category,
    unit: doc.unit,
    tenant: doc.tenant,
    date: doc.date,
    size: doc.size ?? (doc.file ? formatFileSize(doc.file.size) : undefined),
  }
  try {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([created, ...existing]))
  } catch {
    // ที่เก็บเต็มหรือถูกปิดไว้ ค่านี้มีไว้กันบันทึกซ้ำของ paymentPhase2 เท่านั้น
  }
  return created
}
