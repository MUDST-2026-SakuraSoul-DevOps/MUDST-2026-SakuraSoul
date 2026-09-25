/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * SSK-141 วิชากำหนดว่าห้ามพึ่ง external API หรือบริการภายนอก ทุกอย่างต้องรันได้ใน local
 * เดิม index.css โหลดฟอนต์จาก fonts.googleapis.com ตอนรัน ไม่มีเน็ตแล้วฟอนต์เพี้ยน
 * เทสนี้กันไม่ให้ไฟล์ที่ขึ้นไปกับหน้าเว็บกลับไปโหลดอะไรจากนอกเครื่องอีก
 * ลิงก์ในคอมเมนต์ (เช่น Figma) ไม่นับ เพราะเช็คเฉพาะจุดที่เบราว์เซอร์โหลดจริง
 */
const codeAndHtml = import.meta.glob<string>(
  ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '../index.html'],
  { query: '?raw', import: 'default', eager: true },
)

/*
  vite.config.ts ตั้ง css: false ไว้ให้เทส ไฟล์ .css ที่ import ผ่าน ?raw จึงได้สตริงว่างเสมอ
  (ลองแล้ว index.css ยาว 0) ถ้าอ่านแบบนั้นเทสจะผ่านเสมอไม่ว่าในไฟล์มีอะไร
  เลยใช้ glob แค่หารายชื่อไฟล์ แล้วอ่านเนื้อหาจากดิสก์ตรง ๆ
*/
const css = Object.fromEntries(
  Object.keys(import.meta.glob('./**/*.css')).map((file) => [
    file,
    readFileSync(new URL(file, import.meta.url), 'utf8'),
  ]),
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
    const sources = { ...codeAndHtml, ...css }
    const offenders = Object.entries(sources).flatMap(([file, source]) =>
      EXTERNAL_LOADS.filter(([, pattern]) => pattern.test(source)).map(([what]) => `${file}: ${what}`),
    )
    expect(Object.keys(sources)).toContain('../index.html')
    // กันเทสว่างเปล่าแบบเดิม ต้องอ่านเนื้อหา index.css ได้จริง
    expect(css['./index.css']).toContain('@import "tailwindcss"')
    expect(offenders).toEqual([])
  })
})
