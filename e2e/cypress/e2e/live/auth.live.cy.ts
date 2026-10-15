/*
  SSK-123 — ล็อกอินกับ backend จริง

  ชุด mock-api พิสูจน์เรื่องนี้ไม่ได้ เพราะ backend จำลองรับรหัสอะไรก็ผ่าน
  ส่วนชุด stubbed-api ปลอมคำตอบ 401 เอง จึงพิสูจน์ได้แค่ว่าหน้าเว็บแสดงข้อความที่ได้รับมา
  ไม่ได้พิสูจน์ว่า Spring ตอบแบบนั้นจริง เทสนี้คุยกับ backend ตรง ๆ ทั้งเส้นทาง
*/
describe('auth (live-api)', () => {
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
  it('E2E-LIVE-SESSION-001: The session survives a full page reload', () => {
    cy.signInLive()

    cy.reload()

    cy.findByRole('heading', { name: 'Room Availability' }).should('be.visible')
    cy.location('pathname').should('eq', '/')
  })

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
