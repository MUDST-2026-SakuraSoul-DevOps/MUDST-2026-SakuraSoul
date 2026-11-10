// ============================== [NOTE] ==============================
// ไฟล์นี้: ล็อกอินและ session กับ backend จริง 4 เคส (US-01, US-02)
// ชุด: live-api (พอร์ต 4175) — Vite proxy ส่ง /api → Spring Boot :8080 → PostgreSQL จริง ไม่มีของปลอม ต้องเปิด docker compose ก่อน
// เทส: E2E-LIVE-LOGIN-001 Spring ปฏิเสธรหัสผิดจริง (401)
//      E2E-LIVE-LOGIN-002 ล็อกอินแล้วห้อง 24 ห้องมาจากฐานข้อมูล
//      E2E-LIVE-SESSION-001 รีโหลดแล้วยังล็อกอินอยู่
//      E2E-LIVE-SESSION-002 ออกจากระบบแล้ว session ถูกล้างที่ backend
// ไฟล์นี้ไม่สร้างข้อมูล จึงไม่มี afterEach เก็บกวาด
// รัน: cd e2e → ตั้ง $env:E2E_ADMIN_PASSWORD → npm run open:live แล้วคลิกไฟล์นี้ · หรือ npm run test:live
// ====================================================================

/*
  SSK-123 — ล็อกอินกับ backend จริง

  ชุด mock-api พิสูจน์เรื่องนี้ไม่ได้ เพราะ backend จำลองรับรหัสอะไรก็ผ่าน
  ส่วนชุด stubbed-api ปลอมคำตอบ 401 เอง จึงพิสูจน์ได้แค่ว่าหน้าเว็บแสดงข้อความที่ได้รับมา
  ไม่ได้พิสูจน์ว่า Spring ตอบแบบนั้นจริง เทสนี้คุยกับ backend ตรง ๆ ทั้งเส้นทาง
*/
describe('auth (live-api)', () => {
// [NOTE] E2E-LIVE-LOGIN-001 เตรียม: ดัก POST /api/auth/login (ดูอย่างเดียว ไม่ปลอม) · กด: กรอกรหัสผิด → Sign In
//   ตรวจ: backend จริงตอบ 401 · alert "The username or password is incorrect" · ยังอยู่ /login
  it('E2E-LIVE-LOGIN-001: Wrong password is rejected by the real backend', () => {
    cy.intercept({ method: 'POST', pathname: '/api/auth/login' }).as('login')
    cy.visit('/login')
    cy.findByLabelText('Username').type(Cypress.expose('E2E_ADMIN_USERNAME'))
    cy.findByLabelText('Password').type('definitely-not-the-password')
    cy.findByRole('button', { name: 'Sign In' }).click()

    cy.wait('@login').its('response.statusCode').should('eq', 401)
    cy.findByRole('alert').should('have.text', 'The username or password is incorrect')
    cy.location('pathname').should('eq', '/login')
  })

// [NOTE] E2E-LIVE-LOGIN-002 ตรวจ: หลังล็อกอินเห็นชั้น 1-2 และห้อง 101 กับ 212 ซึ่งมาจากตาราง room ที่ Flyway ใส่ไว้
  it('E2E-LIVE-LOGIN-002: Signing in loads the 24 units from the database', () => {
    cy.signInLive()

    cy.findByRole('heading', { name: 'Floor 1' }).should('be.visible')
    cy.findByRole('heading', { name: 'Floor 2' }).should('be.visible')
    // ห้องมาจากตาราง room ที่ Flyway seed ไว้ (V2) ไม่ใช่ข้อมูลที่ฝังในหน้าเว็บ
    cy.findByLabelText('Unit 101').should('be.visible')
    cy.findByLabelText('Unit 212').should('be.visible')
  })

  /*
    session เก็บที่ cookie ฝั่ง backend การรีโหลดหน้าจึงต้องยัง "ล็อกอินอยู่" ได้เอง
    เทสนี้จับเคสที่หน้าเว็บเก็บสถานะล็อกอินไว้ใน memory อย่างเดียวแล้วรีเฟรชทีเด้งออก
  */
// [NOTE] E2E-LIVE-SESSION-001 กด: cy.reload() · ตรวจ: ยังเห็น Room Availability และอยู่ / (session เก็บที่ backend ผูก cookie)
  it('E2E-LIVE-SESSION-001: The session survives a full page reload', () => {
    cy.signInLive()

    cy.reload()

    cy.findByRole('heading', { name: 'Room Availability' }).should('be.visible')
    cy.location('pathname').should('eq', '/')
  })

// [NOTE] E2E-LIVE-SESSION-002 กด: Log out → CONFIRM → ลองเปิด /tenants ตรง ๆ
//   ตรวจ: โดนเด้งกลับ /login = backend ล้าง session จริง ไม่ใช่แค่หน้าเว็บเปลี่ยนหน้า
  it('E2E-LIVE-SESSION-002: Signing out clears the session on the backend', () => {
    cy.signInLive()

    cy.findByRole('button', { name: 'Log out' }).click()
    cy.findByRole('button', { name: 'CONFIRM' }).click()
    cy.location('pathname').should('eq', '/login')

    // เปิดหน้าในอีกครั้งต้องโดนเด้งกลับ แปลว่า cookie ถูกล้างที่ backend จริง ไม่ใช่แค่เปลี่ยนหน้า
    cy.visit('/tenants')
    cy.location('pathname').should('eq', '/login')
  })
})
