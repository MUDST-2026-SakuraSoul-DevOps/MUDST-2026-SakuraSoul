import { describe, expect, it } from 'vitest'

/**
 * SSK-141 วิชากำหนดว่าห้ามพึ่ง external API หรือบริการภายนอก ทุกอย่างต้องรันได้ใน local
 * เดิม index.css โหลดฟอนต์จาก fonts.googleapis.com ตอนรัน ไม่มีเน็ตแล้วฟอนต์เพี้ยน
 * เทสนี้กันไม่ให้ไฟล์ที่ขึ้นไปกับหน้าเว็บกลับไปโหลดอะไรจากนอกเครื่องอีก
 * ลิงก์ในคอมเมนต์ (เช่น Figma) ไม่นับ เพราะเช็คเฉพาะจุดที่เบราว์เซอร์โหลดจริง
 */
const sources = import.meta.glob<string>(
  ['./**/*.{ts,tsx,css}', '!./**/*.test.{ts,tsx}', '../index.html'],
  { query: '?raw', import: 'default', eager: true },
)

const EXTERNAL_LOADS: [string, RegExp][] = [
  ['CSS @import from the internet', /@import\s+(url\(\s*)?["']?https?:\/\//i],
  ['CSS url() from the internet', /url\(\s*["']?https?:\/\//i],
  ['<link>/<script>/<img> from the internet', /<(link|script|img)\b[^>]*\b(href|src)=["']https?:\/\//i],
  ['fetch() to an absolute URL', /fetch\(\s*[`'"]https?:\/\//],
  ['import from a URL', /\bfrom\s+["']https?:\/\//],
]

describe('everything runs locally', () => {
  it('no file shipped to the browser loads anything from outside our own stack', () => {
    const offenders = Object.entries(sources).flatMap(([file, source]) =>
      EXTERNAL_LOADS.filter(([, pattern]) => pattern.test(source)).map(([what]) => `${file}: ${what}`),
    )
    expect(Object.keys(sources)).toContain('../index.html')
    expect(Object.keys(sources)).toContain('./index.css')
    expect(offenders).toEqual([])
  })
})
