import type { FileKind } from '../lib/fileSignature'

/**
 * ของที่ backend จำลองใช้กับไฟล์ (SSK-161, SSK-172) แยกจาก mockApi.ts เพราะเป็นตรรกะล้วนที่เทสแยกได้
 * ทำตัวเหมือน SafeFileName, CheckedFile, DocumentRules และ OwnerRef ของ backend เท่าที่หน้าเว็บมองเห็น
 */

/** ชื่อไฟล์ยาวไม่เกินนี้ นับเป็นตัวอักษร ตรงกับ SafeFileName.MAX_LENGTH */
const MAX_FILE_NAME = 150

/** นามสกุลยาวกว่านี้ไม่ถือว่าเป็นนามสกุล ตรงกับ SafeFileName */
const MAX_EXTENSION = 10

const EXTENSIONS: Record<FileKind, string[]> = {
  PDF: ['.pdf'],
  PNG: ['.png'],
  JPEG: ['.jpg', '.jpeg'],
}

/** อักขระควบคุมกับอักขระกลับทิศที่ใช้ปลอมนามสกุล (เช่นทำให้ "gpj.exe" ดูเหมือน "exe.jpg") */
const UNSAFE_IN_NAME = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu

const CONTROLS = /\p{Cc}/gu

/**
 * ชื่อไฟล์ที่เก็บ: ตัด path ที่ติดมา (C:\fakepath\…, ../) ตัดอักขระควบคุมและอักขระกลับทิศ ชื่อที่เหลือว่างเป็น file
 * และเติมนามสกุลของชนิดจริงเมื่อนามสกุลไม่ตรงกับเนื้อไฟล์ (PNG ชื่อ x.exe เก็บเป็น x.exe.png)
 */
export function safeFileName(original: string, kind: FileKind): string {
  let name = original.normalize('NFC')
  name = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
  name = name.replace(UNSAFE_IN_NAME, '').trim()
  if (name === '' || name === '.' || name === '..') {
    name = 'file'
  }
  const lower = name.toLowerCase()
  if (!EXTENSIONS[kind].some((extension) => lower.endsWith(extension))) {
    name += EXTENSIONS[kind][0]
  }
  return shorten(name)
}

/** ตัดที่ชื่อก่อนนามสกุล นามสกุลจึงยังอยู่ */
function shorten(name: string): string {
  const chars = [...name]
  if (chars.length <= MAX_FILE_NAME) {
    return name
  }
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 && name.length - dot <= MAX_EXTENSION + 1 ? name.slice(dot) : ''
  const stem = [...name.slice(0, name.length - extension.length)]
  return stem.slice(0, MAX_FILE_NAME - [...extension].length).join('') + extension
}

/** ตัดอักขระควบคุมออกจากข้อความที่ผู้ใช้พิมพ์ เหมือน DocumentRules.withoutControls */
export function withoutControls(text: string): string {
  return text.replace(CONTROLS, '')
}

/** YYYY-MM-DD ที่เป็นวันจริงในปฏิทิน 2026-02-30 ไม่ผ่าน */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false
  }
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

/** จำนวนเต็มบวกจากช่องในฟอร์มหรือ query เหมือน OwnerRef.positiveId ค่าอื่นเป็น null */
export function positiveId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return null
  }
  const id = Number(value.trim())
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/**
 * SHA-256 เป็นเลขฐานสิบหก crypto.subtle มีเฉพาะใน secure context (https หรือ localhost)
 * ถ้าเปิดหน้าเว็บจำลองผ่าน http ด้วย IP ของเครื่องจะได้สตริงว่าง ไม่มีหน้าไหนโชว์ค่านี้
 */
export async function sha256Hex(content: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return ''
  }
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', content))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * PDF หน้าเดียวที่เปิดดูได้จริงในเบราว์เซอร์ ใช้เป็นไฟล์ของเอกสารตัวอย่าง ตารางตำแหน่ง (xref) คิดจากความยาวจริง
 * ข้อความต้องเป็น ASCII เพราะใช้ฟอนต์ Helvetica ที่ติดมากับโปรแกรมอ่าน PDF และนับหนึ่งตัวเป็นหนึ่งไบต์
 */
export function samplePdf(lines: string[]): ArrayBuffer {
  const text = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf 40 ${150 - i * 28} Td (${line.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf).buffer
}

/** รูปกระดาษเอกสาร 160 x 100 จุด (171 ไบต์) ใช้เป็นรูปถ่ายรายงานซ่อมตัวอย่าง */
const SAMPLE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAABkAgMAAAB82NMcAAAADFBMVEX87vGML0vZuML////R5FeKAAAAWklEQVR42u3VKw4AIRAEUS6J5n4Y7oeBhICbjOAT' +
  'WlSJVc81kw2B7hXdgEAPNjfgT1izmRRkwldb60EmfHjXRQsy4Wr8MdMurMZdpflRgVZAVXj2HrnrG5BO64JWNpVZBbPOAAAAAElFTkSuQmCC'

export function samplePng(): ArrayBuffer {
  return Uint8Array.from(atob(SAMPLE_PNG), (char) => char.charCodeAt(0)).buffer
}
