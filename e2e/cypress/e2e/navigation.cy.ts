// [NOTE] รายการ ชื่อเมนู → หัวข้อหลักของหน้านั้น ถ้าเพิ่มหน้าใหม่แก้ที่นี่ที่เดียว
// ============================== [NOTE] ==============================
// ไฟล์นี้: เมนูด้านข้าง 1 เคส
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory ไม่แตะ Spring/PostgreSQL
// เทส: E2E-NAV-001 กดเมนูครบ 7 หน้า แต่ละหน้าขึ้นหัวข้อของตัวเอง
// รัน: cd e2e → npm run open:mock แล้วคลิกไฟล์นี้ · หรือ npm run test:mock (รันทั้งชุด mock)
// ====================================================================

const PAGES = [
  { link: 'Units', heading: 'Unit Management' },
  { link: 'Tenants', heading: 'Tenant Directory' },
  { link: 'Payments', heading: 'Payment Management' },
  { link: 'Maintenance', heading: 'Maintenance Management' },
  { link: 'Contracts', heading: 'Contract Management' },
  { link: 'Appliances', heading: 'Appliance Rental' },
  { link: 'Dashboard', heading: 'Room Availability' },
]

describe('navigation (mock-api)', () => {
// [NOTE] E2E-NAV-001 วน for ทุกหน้า: คลิกเมนู → ตรวจว่า heading level 1 (h1) เป็นชื่อหน้านั้น
  it('E2E-NAV-001: Sidebar menu navigates to every page and each page shows its own heading', () => {
    cy.signIn()

    for (const { link, heading } of PAGES) {
      cy.findByRole('link', { name: link }).click()
      cy.findByRole('heading', { name: heading, level: 1 }).should('be.visible')
    }
  })
})
