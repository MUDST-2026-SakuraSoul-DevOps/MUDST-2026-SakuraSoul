/**
 * กฎของไฟล์ที่อัปโหลดเข้าที่เก็บไฟล์กลาง (SSK-161) ชุดเดียวกับ backend
 * (CheckedFile กับ FileSignature ในแพ็กเกจ attachment และหัวข้อกฎของไฟล์ใน docs/api-contract-documents.md)
 *
 * หน้าเว็บตรวจก่อนส่ง ผู้ใช้จะรู้ทันทีโดยไม่ต้องรออัปโหลดจบ และไม่เจอหน้า 413 ของ nginx ตอนไฟล์เกิน 7 MB
 * backend ตรวจซ้ำเสมอ ข้อความจึงต้องตรงกับฝั่งนั้นทุกตัวอักษร ผู้ใช้เห็นคำเดียวกันไม่ว่าจะถูกจับที่ฝั่งไหน
 *
 * ชนิดดูจากไบต์แรกของไฟล์ ไม่ใช่ file.type หรือนามสกุล ไฟล์ .exe ที่เปลี่ยนชื่อเป็น .png ได้ type
 * เป็น image/png จากเบราว์เซอร์ แต่ backend ปฏิเสธด้วย 415 อยู่ดี
 */

/** 5 MB (5 x 1024 x 1024 ไบต์) ตรงกับ CheckedFile.MAX_BYTES */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const NO_FILE_MESSAGE = 'Please choose a file'
export const FILE_TOO_LARGE_MESSAGE = 'The file is larger than 5 MB'
export const UNSUPPORTED_FILE_MESSAGE = 'Only PDF, PNG and JPEG files are allowed'
/** ข้อความของหน้าเว็บเอง backend ไม่มีกรณีนี้ ไฟล์ถูกย้าย ลบ หรือล็อกไว้หลังเลือก เบราว์เซอร์จึงอ่านไม่ได้ */
export const UNREADABLE_FILE_MESSAGE = 'Could not read the file. Please choose it again.'

/** ข้อความใต้ช่องเลือกไฟล์ */
export const UPLOAD_HINT = 'PDF, PNG or JPEG · up to 5 MB'

/** ค่า accept ของ input ช่วยกรองในหน้าต่างเลือกไฟล์เท่านั้น ผู้ใช้เลือก "All files" ได้ ตัวตรวจจริงคือ checkUploadFile */
export const UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'

export type FileKind = 'PDF' | 'PNG' | 'JPEG'

/** ลายเซ็นที่ตำแหน่ง 0 ของไฟล์ ตรงกับ FileSignature ของ backend ลายเซ็นที่อยู่กลางไฟล์ไม่นับ */
const SIGNATURES: readonly (readonly [FileKind, readonly number[]])[] = [
  ['PDF', [0x25, 0x50, 0x44, 0x46, 0x2d]],
  ['PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['JPEG', [0xff, 0xd8, 0xff]],
]

/** อ่านจากต้นไฟล์เท่านี้พอ ลายเซ็นที่ยาวที่สุดคือ PNG */
const HEAD_BYTES = 8

/** Content-Type ที่ backend เก็บและส่งกลับตอนดาวน์โหลด ตรงกับ FileKind ของ backend */
export const FILE_KIND_CONTENT_TYPE: Record<FileKind, string> = {
  PDF: 'application/pdf',
  PNG: 'image/png',
  JPEG: 'image/jpeg',
}

export function detectFileKind(head: Uint8Array): FileKind | null {
  for (const [kind, signature] of SIGNATURES) {
    if (head.length >= signature.length && signature.every((byte, i) => head[i] === byte)) {
      return kind
    }
  }
  return null
}

/** อ่านแค่ไบต์แรก ๆ ไม่โหลดทั้งไฟล์เข้าหน่วยความจำ */
export async function sniffFileKind(blob: Blob): Promise<FileKind | null> {
  return detectFileKind(new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer()))
}

/**
 * ตรวจตามลำดับเดียวกับ backend: ไม่มีไฟล์หรือไฟล์ 0 ไบต์ → ขนาด → ชนิด
 * ไฟล์ใหญ่ที่ชนิดผิดด้วยจึงได้ข้อความเรื่องขนาดก่อน ซึ่งเป็นสิ่งที่ผู้ใช้ต้องแก้ก่อน
 *
 * @returns ข้อความที่โชว์ผู้ใช้ได้เลย หรือ null เมื่อไฟล์ผ่าน
 */
export async function checkUploadFile(file: Blob | null | undefined): Promise<string | null> {
  if (!file || file.size === 0) {
    return NO_FILE_MESSAGE
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return FILE_TOO_LARGE_MESSAGE
  }
  try {
    return (await sniffFileKind(file)) === null ? UNSUPPORTED_FILE_MESSAGE : null
  } catch {
    return UNREADABLE_FILE_MESSAGE
  }
}
