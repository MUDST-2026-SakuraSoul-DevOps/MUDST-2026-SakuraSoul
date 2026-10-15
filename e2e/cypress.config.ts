import { defineConfig } from 'cypress'
import mochawesome from 'cypress-mochawesome-reporter/plugin'

/**
 * E2E ของหน้าเว็บ (SSK-26) — เปิดเบราว์เซอร์จริงแล้วกดตามที่แอดมินใช้งาน
 * เครื่องมือคือ Cypress ตามที่อาจารย์กำหนด (SSK-158)
 *
 * ชุดนี้อยู่นอก frontend/ เป็นโมดูลของตัวเองระดับเดียวกับ backend/ กับ frontend/
 * ตามที่อาจารย์สั่งไว้ เพราะ E2E ไม่ได้ทดสอบ "หน้าเว็บ" อย่างเดียว แต่ทดสอบทั้งระบบ
 * จากเบราว์เซอร์ไปจนถึงฐานข้อมูล การเอาไปฝังใน frontend/ ทำให้ดูเหมือนเป็นเทสของ
 * frontend และทำให้ dependency ของ Cypress ไปปนกับ dependency ของตัวเว็บ
 *
 * รันกับ Chrome ที่ติดตั้งในเครื่อง (cypress run --browser chrome) ทั้งบนเครื่องทีม
 * และบน ubuntu ของ GitHub Actions ซึ่งมี Chrome ติดมาให้แล้ว
 *
 * แบ่งเป็นสามชุด เลือกด้วยตัวแปร E2E_PROJECT แต่ละชุดคุยกับ dev server ของ frontend/ คนละพอร์ต
 * script ใน package.json ยก dev server ให้ก่อนด้วย start-server-and-test แล้วค่อยสั่ง Cypress
 *
 * mock-api (พอร์ต 4173) — backend จำลองในเบราว์เซอร์ (VITE_API_MOCK=1) ข้อมูลอยู่ใน memory
 * ของหน้า ทุกเทสจึงเริ่มจากข้อมูลชุดเดียวกัน เทสส่วนใหญ่อยู่ที่นี่ ไฟล์ cypress/e2e/*.cy.ts
 *
 * stubbed-api (พอร์ต 4174) — ปิด backend จำลอง ให้หน้าเว็บยิง /api ผ่าน network จริง
 * แล้วปลอมคำตอบเองด้วย cy.intercept ใช้กับเทสเรื่องล็อกอินที่ backend จำลองแสดงไม่ได้
 * เพราะมันรับรหัสอะไรก็ผ่านและตอบว่าล็อกอินอยู่ตลอด ส่วน mock เรียกเป็นฟังก์ชันตรง ๆ
 * ไม่ผ่าน network จึงดักด้วย cy.intercept ไม่ได้ ไฟล์เทสลงท้าย .stubbed.cy.ts
 *
 * live-api (พอร์ต 4175) — SSK-123 ยิงถึง backend Spring กับ PostgreSQL จริง ไม่มีของปลอม
 * คั่นกลางเลย ตามนิยาม E2E ในคาบเรียน (UI → API → Database) จับบั๊กที่สองชุดบน
 * มองไม่เห็น เช่น backend ปฏิเสธรูปแบบข้อมูลที่ mock ปล่อยผ่าน หรือ endpoint ที่ยังไม่มีจริง
 * ต้องเปิด docker compose db mailpit กับ backend โปรไฟล์ dev ไว้ก่อน จึงไม่รวมอยู่ใน `npm test`
 * สั่งแยกด้วย `npm run test:live` ใน CI มี job e2e-live (SSK-138) ยก stack ขึ้นมาแล้วสั่งคำสั่งนี้ให้
 * ไฟล์เทสอยู่ใน cypress/e2e/live/ ลงท้าย .live.cy.ts
 *
 * Cypress รันไฟล์เทสทีละไฟล์อยู่แล้ว ชุด live จึงไม่ชนกันในฐานข้อมูลก้อนเดียว
 * (เคยปล่อยขนานแล้วหน้าเว็บค้างที่ Loading units... และเก็บกวาดไม่จบ)
 *
 * พอร์ต 4173/4174/4175 ไม่ชนกับ dev server ที่ทีมเปิดทำงานกันอยู่ที่ 5173
 * ใช้ 127.0.0.1 แทน localhost ทุกที่ เพราะบน Windows ชื่อ localhost อาจชี้ไป ::1 ก่อน
 * ส่วน Mailpit ใน docker-compose.yml ผูกพอร์ตไว้กับ 127.0.0.1 อย่างเดียว
 */
type Project = 'mock-api' | 'stubbed-api' | 'live-api'

const PROJECTS: Record<Project, { port: number; specPattern: string; excludeSpecPattern?: string }> = {
  'mock-api': { port: 4173, specPattern: 'cypress/e2e/*.cy.ts', excludeSpecPattern: '**/*.stubbed.cy.ts' },
  'stubbed-api': { port: 4174, specPattern: 'cypress/e2e/*.stubbed.cy.ts' },
  'live-api': { port: 4175, specPattern: 'cypress/e2e/live/*.live.cy.ts' },
}

const project = (process.env.E2E_PROJECT || 'mock-api') as Project
if (!(project in PROJECTS)) {
  throw new Error(`E2E_PROJECT ต้องเป็น ${Object.keys(PROJECTS).join(' | ')} แต่ได้ "${project}"`)
}
const LIVE = project === 'live-api'
const { port, specPattern, excludeSpecPattern } = PROJECTS[project]

/*
  รหัสผ่านที่ใช้ล็อกอินอ่านจาก E2E_ADMIN_PASSWORD ไม่เขียนไว้ในโค้ด (feedback อาจารย์ SSK-125)
  ชุด mock/stubbed รับรหัสอะไรก็ได้ที่ไม่ว่าง ส่วนชุด live ต้องตรงกับ APP_ADMIN_PASSWORD ที่ backend
  ใช้ตอนสตาร์ต บน CI สุ่มให้ตอนรัน ตรวจตั้งแต่ตรงนี้ให้ล้มก่อนเปิดเบราว์เซอร์ จะได้เห็นสาเหตุทันที
  ไม่ใช่ไปตายที่หน้า Login ทีละเคส
*/
const password = process.env.E2E_ADMIN_PASSWORD
if (!password) {
  throw new Error(
    LIVE
      ? "ยังไม่ได้ตั้ง E2E_ADMIN_PASSWORD — ตั้งให้ตรงกับ APP_ADMIN_PASSWORD ที่ backend ใช้ตอนสตาร์ต เช่น $env:E2E_ADMIN_PASSWORD='...' แล้วค่อยรัน npm run test:live"
      : "E2E_ADMIN_PASSWORD is not set. From e2e/, run: $env:E2E_ADMIN_PASSWORD='<any>'; npm test",
  )
}

const CI = !!process.env.CI

export default defineConfig({
  e2e: {
    baseUrl: `http://127.0.0.1:${port}`,
    specPattern,
    ...(excludeSpecPattern ? { excludeSpecPattern } : {}),
    supportFile: 'cypress/support/e2e.ts',
    /*
      1280x720 เท่ากับขนาดหน้าจอที่ชุดเดิมใช้มาตลอด ค่าตั้งต้นของ Cypress (1000x660)
      แคบกว่า breakpoint lg (1024px) แถบเมนูด้านข้างที่มีปุ่ม Log out จะเลื่อนออกนอกจอ
      (frontend/src/layouts/AppLayout.tsx) แล้วทุกเทสที่กดเมนูจะพัง
    */
    viewportWidth: 1280,
    viewportHeight: 720,
    // ชุด live รอ Spring กับ PostgreSQL จริง จึงให้เวลามากกว่าชุดที่ข้อมูลอยู่ในหน้า
    defaultCommandTimeout: LIVE ? 10_000 : 5_000,
    retries: { runMode: CI ? 1 : 0, openMode: 0 },
    video: false,
    screenshotOnRunFailure: true,
    setupNodeEvents(on, config) {
      mochawesome(on)
      return config
    },
  },
  fixturesFolder: false,
  // ค่าลับอ่านในเทสด้วย cy.env() ซึ่งไม่พิมพ์ค่าลง log ส่วนค่าทั่วไปอ่านด้วย Cypress.expose()
  env: { E2E_ADMIN_PASSWORD: password },
  expose: {
    E2E_PROJECT: project,
    E2E_ADMIN_USERNAME: process.env.E2E_ADMIN_USERNAME || (LIVE ? 'admin' : 'adminsakura01'),
  },
  /*
    รายงาน HTML ของแต่ละชุดแยกโฟลเดอร์กัน CI เก็บเป็น artifact ทุกครั้ง ไม่ใช่เฉพาะตอนพัง
    เพราะรายงานนี้คือหลักฐานว่า E2E ครอบเคสอะไรไปแล้วบ้าง (หัวข้อ "E2E coverage" ตอนนำเสนอ)
    รูปหน้าจอตอนพังฝังอยู่ในไฟล์ HTML เลย เปิดไฟล์เดียวก็เห็นครบ
  */
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    reportDir: `cypress/reports/${project}`,
    reportPageTitle: `Sakura Soul E2E (${project})`,
    charts: true,
    embeddedScreenshots: true,
    inlineAssets: true,
    saveAllAttempts: false,
  },
})
