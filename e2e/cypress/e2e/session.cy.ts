// ============================== [NOTE] ==============================
// ไฟล์นี้: ออกจากระบบ 2 เคส (US-02)
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory ไม่แตะ Spring/PostgreSQL
// เทส: E2E-LOGOUT-001 Log out → CONFIRM แล้วกลับหน้า Login · E2E-LOGOUT-002 กด CANCEL แล้วอยู่หน้าเดิม
// รัน: cd e2e → npm run open:mock แล้วคลิกไฟล์นี้ · หรือ npm run test:mock (รันทั้งชุด mock)
// ====================================================================

describe('session (mock-api)', () => {
// [NOTE] E2E-LOGOUT-001 กด: Log out → เห็นคำถามยืนยัน → CONFIRM · ตรวจ: path เป็น /login · มีปุ่ม Sign In
  it('E2E-LOGOUT-001: Logging out returns to the Login page', () => {
    cy.signIn()

    cy.findByRole('button', { name: 'Log out' }).click()
    cy.findByText('Are you sure you want to logout?').should('be.visible')
    cy.findByRole('button', { name: 'CONFIRM' }).click()

    cy.location('pathname').should('eq', '/login')
    cy.findByRole('button', { name: 'Sign In' }).should('be.visible')
  })

// [NOTE] E2E-LOGOUT-002 กด: Log out → CANCEL · ตรวจ: คำถามยืนยันหายไป · ยังอยู่ path / (Dashboard)
  it('E2E-LOGOUT-002: Clicking CANCEL on the logout popup stays on the current page', () => {
    cy.signIn()

    cy.findByRole('button', { name: 'Log out' }).click()
    cy.findByRole('button', { name: 'CANCEL' }).click()

    cy.findByText('Are you sure you want to logout?').should('not.exist')
    cy.location('pathname').should('eq', '/')
  })
})
