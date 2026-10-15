/*
  เทสกลุ่มนี้รันกับ dev server ที่ปิด backend จำลอง (ชุด stubbed-api)
  หน้าเว็บยิง /api ผ่าน network จริง cy.intercept จึงปลอมคำตอบได้ตรงตามที่ backend
  จริงตอบ คำขอที่ไม่ได้ตั้งไว้ตอบ 503 ทั้งหมด จะได้ไม่หลุดไปหา backend ที่ไม่ได้เปิด
  intercept ที่ตั้งทีหลังถูกเช็คก่อน จึงตั้งตัวกว้างไว้ก่อนตัวเจาะจง
  ตัวกว้างต้องเทียบจาก pathname ที่ขึ้นต้นด้วย /api/ เท่านั้น ถ้าใช้ glob แบบ "ทุก path ที่มี /api/"
  มันจะดักไฟล์โค้ดของแอปเองอย่าง /src/api/client.ts ไปด้วย แล้วหน้าเว็บโหลดไม่ขึ้น
*/
function problem(statusCode: number, title: string, detail?: string) {
  return {
    statusCode,
    headers: { 'content-type': 'application/problem+json' },
    body: { title, detail },
  }
}

describe('auth (stubbed-api)', () => {
  beforeEach(() => {
    cy.intercept({ pathname: /^\/api\// }, problem(503, 'Service Unavailable'))
    cy.intercept({ pathname: '/api/auth/me' }, problem(401, 'Unauthorized'))
  })

  it('E2E-LOGIN-002: Opening a page while signed out redirects to Login', () => {
    cy.visit('/contracts')

    cy.location('pathname').should('eq', '/login')
    cy.findByRole('button', { name: 'Sign In' }).should('be.visible')
  })

  it('E2E-LOGIN-003: Wrong password shows the backend error message and stays on Login', () => {
    const detail = 'The username or password is incorrect'
    cy.intercept({ pathname: '/api/auth/login' }, problem(401, 'Unauthorized', detail))

    cy.visit('/login')
    cy.findByLabelText('Username').type('adminsakura01')
    cy.findByLabelText('Password').type('wrong-password')
    cy.findByRole('button', { name: 'Sign In' }).click()

    cy.findByRole('alert').should('have.text', detail)
    cy.location('pathname').should('eq', '/login')
  })
})
