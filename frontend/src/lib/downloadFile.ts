/**
 * สั่งให้เบราว์เซอร์ดาวน์โหลดข้อความเป็นไฟล์
 *
 * แยกออกมาไฟล์เดียวเพราะเป็นส่วนเดียวที่แตะ DOM API ตรง ๆ component ที่เรียกใช้
 * จะได้เทสง่ายโดยไม่ต้องไปยุ่งกับ URL.createObjectURL หรือ anchor ปลอม
 */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()

  // เก็บกวาดทันที ไม่งั้น blob ค้างในหน่วยความจำจนกว่าจะปิดแท็บ
  link.remove()
  URL.revokeObjectURL(url)
}
