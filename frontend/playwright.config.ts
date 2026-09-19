import { defineConfig } from '@playwright/test'

/**
 * E2E ของหน้าเว็บ (SSK-26) — เปิดเบราว์เซอร์จริงแล้วกดตามที่แอดมินใช้งาน
 *
 * รันกับ dev server ในโหมด backend จำลอง (VITE_API_MOCK=1 จาก .env.development)
 * ข้อมูลเก็บใน memory ของหน้าเว็บ ทุกเทสเปิดหน้าใหม่จึงเริ่มจากข้อมูลชุดเดียวกัน
 * เสมอ ไม่ต้องล้างฐานข้อมูลระหว่างเทส และรันขนานกันได้โดยไม่ชนกัน
 *
 * ใช้ Chrome ที่ติดตั้งในเครื่องอยู่แล้ว (channel: 'chrome') แทนการโหลดเบราว์เซอร์
 * ของ Playwright เอง เพราะคำสั่ง playwright install เคยโหลดไม่สำเร็จบนเครื่องทีม
 * และเครื่อง ubuntu ของ GitHub Actions ก็มี Chrome ติดมาให้แล้ว
 *
 * ใช้พอร์ต 4173 ไม่ชนกับ dev server ที่ทีมเปิดทำงานกันอยู่ที่ 5173
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
