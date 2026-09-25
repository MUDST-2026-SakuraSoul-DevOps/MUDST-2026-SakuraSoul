import { defineConfig } from '@playwright/test'

/**
 * E2E ของหน้าเว็บ (SSK-26) — เปิดเบราว์เซอร์จริงแล้วกดตามที่แอดมินใช้งาน
 *
 * ใช้ Chrome ที่ติดตั้งในเครื่องอยู่แล้ว (channel: 'chrome') แทนการโหลดเบราว์เซอร์
 * ของ Playwright เอง เพราะคำสั่ง playwright install เคยโหลดไม่สำเร็จบนเครื่องทีม
 * และเครื่อง ubuntu ของ GitHub Actions ก็มี Chrome ติดมาให้แล้ว
 *
 * แบ่งเป็นสองโปรเจกต์ รันกับ dev server คนละตัว
 *
 * mock-api (พอร์ต 4173) — backend จำลองในเบราว์เซอร์ (VITE_API_MOCK=1 จาก
 * .env.development) ข้อมูลอยู่ใน memory ของหน้า ทุกเทสจึงเริ่มจากข้อมูลชุดเดียวกัน
 * และรันขนานกันได้ เทสส่วนใหญ่อยู่ที่นี่
 *
 * stubbed-api (พอร์ต 4174) — ปิด backend จำลอง ให้หน้าเว็บยิง /api ผ่าน network
 * จริง แล้ว Playwright ปลอมคำตอบเองด้วย page.route ใช้กับเทสเรื่องล็อกอินที่ backend
 * จำลองแสดงไม่ได้ เพราะมันรับรหัสอะไรก็ผ่านและตอบว่าล็อกอินอยู่ตลอด ส่วน mock
 * เรียกเป็นฟังก์ชันตรง ๆ ไม่ผ่าน network จึงดักด้วย page.route ไม่ได้
 * ไฟล์เทสของโปรเจกต์นี้ลงท้าย .stubbed.spec.ts
 *
 * พอร์ต 4173/4174 ไม่ชนกับ dev server ที่ทีมเปิดทำงานกันอยู่ที่ 5173
 */
const STUBBED = /\.stubbed\.spec\.ts$/

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mock-api', testIgnore: STUBBED, use: { baseURL: 'http://localhost:4173' } },
    { name: 'stubbed-api', testMatch: STUBBED, use: { baseURL: 'http://localhost:4174' } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // ตัวแปรจาก process มาก่อนไฟล์ .env ของ Vite เสมอ จึงปิด mock ได้โดยไม่ต้องมีไฟล์ env เพิ่ม
      command: 'npm run dev -- --port 4174 --strictPort',
      url: 'http://localhost:4174',
      env: { VITE_API_MOCK: '0' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
