/**
 * สั่งให้เบราว์เซอร์ดาวน์โหลดข้อความเป็นไฟล์
 *
 * แยกออกมาไฟล์เดียวเพราะเป็นส่วนเดียวที่แตะ DOM API ตรง ๆ component ที่เรียกใช้
 * จะได้เทสง่ายโดยไม่ต้องไปยุ่งกับ URL.createObjectURL หรือ anchor ปลอม
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  downloadBlob(filename, blob)
}

