/**
 * ไฟล์ตัวอย่างสำหรับเทสที่อัปโหลดไฟล์ (SSK-161, SSK-172)
 *
 * เนื้อไฟล์ขึ้นต้นด้วยลายเซ็นจริง เพราะหน้าเว็บ backend จำลอง และ backend จริงตรวจชนิดจากเนื้อไฟล์
 * ไฟล์ที่สร้างจากข้อความอย่าง new File(['fake'], 'x.pdf') จะถูกปฏิเสธเหมือนไฟล์เสีย
 */

const PDF_HEAD = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0]
/** ต้นไฟล์โปรแกรมของ Windows (MZ) */
const EXE_HEAD = [0x4d, 0x5a, 0x90, 0x00]

function fileOf(head: number[], name: string, type: string, size: number): File {
  const bytes = new Uint8Array(Math.max(size, head.length))
  bytes.set(head)
  return new File([bytes], name, { type })
}

export function pdfFile(name = 'scan.pdf', size = 1024): File {
  return fileOf(PDF_HEAD, name, 'application/pdf', size)
}

export function pngFile(name = 'photo.png', size = 1024): File {
  return fileOf(PNG_HEAD, name, 'image/png', size)
}

export function jpegFile(name = 'photo.jpg', size = 1024): File {
  return fileOf(JPEG_HEAD, name, 'image/jpeg', size)
}

/** โปรแกรมที่ถูกเปลี่ยนชื่อเป็นรูป เบราว์เซอร์ให้ type ตามนามสกุล จึงหลอกการตรวจที่ดูแค่ file.type ได้ */
export function renamedExeFile(name = 'photo.png', size = 1024): File {
  return fileOf(EXE_HEAD, name, 'image/png', size)
}
