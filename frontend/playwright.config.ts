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
 * live-api (พอร์ต 4175) — SSK-123 ยิงถึง backend Spring กับ PostgreSQL จริง ไม่มีของปลอม
 * คั่นกลางเลย ตามนิยาม E2E ในคาบเรียน (UI → API → Database) จับบั๊กที่สองโปรเจกต์บน
 * มองไม่เห็น เช่น backend ปฏิเสธรูปแบบข้อมูลที่ mock ปล่อยผ่าน หรือ endpoint ที่ยังไม่มีจริง
 * ต้องเปิด docker compose db กับ backend โปรไฟล์ dev ไว้ก่อน จึงไม่รวมอยู่ใน `npm run test:e2e`
 * และไม่ได้อยู่ใน CI สั่งแยกด้วย `npm run test:e2e:live` ไฟล์เทสลงท้าย .live.spec.ts
 *
 * พอร์ต 4173/4174/4175 ไม่ชนกับ dev server ที่ทีมเปิดทำงานกันอยู่ที่ 5173
 */
const STUBBED = /\.stubbed\.spec\.ts$/
const LIVE = /\.live\.spec\.ts$/

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
    { name: 'mock-api', testIgnore: [STUBBED, LIVE], use: { baseURL: 'http://localhost:4173' } },
    { name: 'stubbed-api', testMatch: STUBBED, use: { baseURL: 'http://localhost:4174' } },
    { name: 'live-api', testMatch: LIVE, use: { baseURL: 'http://localhost:4175' } },
  ],
  webServer: [
    {
      /*
        สั่งเปิด backend จำลองตรง ๆ ไม่ปล่อยให้ไปหยิบค่าจาก .env.development เอง
        เพราะใครที่เทส UI กับ backend จริงจะมีไฟล์ .env.development.local (VITE_API_MOCK=0)
        อยู่ในเครื่อง ซึ่งชนะไฟล์ .env.development เสมอ แล้วเทสชุดนี้จะยิงไปหา backend จริง
        ที่ไม่ได้เปิด ล็อกอินไม่ผ่านตั้งแต่เทสแรก (CI ไม่เจอเพราะ runner ไม่มีไฟล์ .local)
        ตัวแปรจาก process ชนะไฟล์ .env ทุกใบ จึงคุมได้แน่นอนจากตรงนี้
      */
      command: 'npm run dev -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      env: { VITE_API_MOCK: '1' },
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
    {
      /*
        เซิร์ฟเวอร์ของชุด live ปิด backend จำลองเหมือนตัว stubbed ต่างกันตรงที่ไม่มี
        page.route มาปลอมคำตอบ คำขอ /api จึงวิ่งผ่าน proxy ของ vite ไปที่ Spring
        ที่พอร์ต 8080 จริง ถ้า backend ไม่ได้เปิด เทสชุดนี้จะแดงทั้งหมด จึงไม่ถูกเรียก
        จาก `npm run test:e2e` และไม่อยู่ใน CI
      */
      command: 'npm run dev -- --port 4175 --strictPort',
      url: 'http://localhost:4175',
      env: { VITE_API_MOCK: '0' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
