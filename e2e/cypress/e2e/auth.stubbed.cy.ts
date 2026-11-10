// ============================== [NOTE] ==============================
// ไฟล์นี้: ล็อกอินในกรณีที่ต้องบังคับให้ API ตอบ error 2 เคส
// ชุด: stubbed-api (พอร์ต 4174) — ปิด backend ปลอม หน้าเว็บยิง /api ผ่าน network จริง แล้ว cy.intercept ตอบแทน ไม่ต้องเปิด backend
// เทส: E2E-LOGIN-002 ยังไม่ล็อกอินแล้วเปิดหน้าอื่น ต้องเด้งไป Login
//      E2E-LOGIN-003 รหัสผิดต้องโชว์ข้อความจาก backend และอยู่หน้า Login
// รัน: cd e2e → npm run open:stubbed แล้วคลิกไฟล์นี้ · หรือ npm run test:stubbed
// ====================================================================

/*
  เทสกลุ่มนี้รันกับ dev server ที่ปิด backend จำลอง (ชุด stubbed-api)
  หน้าเว็บยิง /api ผ่าน network จริง cy.intercept จึงปลอมคำตอบได้ตรงตามที่ backend
  จริงตอบ คำขอที่ไม่ได้ตั้งไว้ตอบ 503 ทั้งหมด จะได้ไม่หลุดไปหา backend ที่ไม่ได้เปิด
  intercept ที่ตั้งทีหลังถูกเช็คก่อน จึงตั้งตัวกว้างไว้ก่อนตัวเจาะจง
  ตัวกว้างต้องเทียบจาก pathname ที่ขึ้นต้นด้วย /api/ เท่านั้น ถ้าใช้ glob แบบ "ทุก path ที่มี /api/"
  มันจะดักไฟล์โค้ดของแอปเองอย่าง /src/api/client.ts ไปด้วย แล้วหน้าเว็บโหลดไม่ขึ้น
*/
// [NOTE] problem(): สร้างคำตอบ error ปลอมให้หน้าตาเหมือน backend จริง (ProblemDetail: statusCode + content-type + body title/detail)
function problem(statusCode: number, title: string, detail?: string) {
  return {
    statusCode,
    headers: { 'content-type': 'application/problem+json' },
    body: { title, detail },
  }
}

describe('auth (stubbed-api)', () => {
// [NOTE] ก่อนทุกเคส: 1) ทุกคำขอ /api ตอบ 503 กันหลุดไปหา backend 2) /api/auth/me ตอบ 401 = ยังไม่ล็อกอิน
//   intercept ที่ตั้งทีหลังถูกเช็คก่อน ตัวเจาะจงจึงตั้งหลังตัวกว้าง
  beforeEach(() => {
    cy.intercept({ pathname: /^\/api\// }, problem(503, 'Service Unavailable'))
    cy.intercept({ pathname: '/api/auth/me' }, problem(401, 'Unauthorized'))
  })

// [NOTE] E2E-LOGIN-002 (US-01) กด: cy.visit('/contracts') ตรง ๆ · ตรวจ: path เปลี่ยนเป็น /login · มีปุ่ม Sign In
  it('E2E-LOGIN-002: Opening a page while signed out redirects to Login', () => {
    cy.visit('/contracts')

    cy.location('pathname').should('eq', '/login')
    cy.findByRole('button', { name: 'Sign In' }).should('be.visible')
  })

// [NOTE] E2E-LOGIN-003 (US-01) เตรียม: ปลอม /api/auth/login ให้ตอบ 401 พร้อมข้อความ · กด: กรอกรหัสผิด → Sign In
//   ตรวจ: กล่อง alert ขึ้นข้อความนั้นตรงตัว · ยังอยู่ /login (ส่วน backend ตอบ 401 จริงไหม พิสูจน์ที่ LIVE-LOGIN-001)
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
