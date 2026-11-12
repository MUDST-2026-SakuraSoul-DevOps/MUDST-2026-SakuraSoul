// ============================== [NOTE] ==============================
// ไฟล์นี้: ไฟล์เตรียมตัวที่ Cypress โหลดก่อนไฟล์เทสทุกไฟล์ (supportFile ใน cypress.config.ts) ไม่มีเทส
// ลงคำสั่งเสริม 4 อย่าง: 1) Testing Library → cy.findByRole / findByLabelText / findByText
// 2) รายงาน HTML (mochawesome)  3) cypress-real-events → cy.realPress กดแป้นจริง
// 4) ./commands → cy.signIn() / cy.signInLive() ที่ทีมเขียนเอง
// ====================================================================

// โหลดก่อนไฟล์เทสทุกไฟล์ (supportFile ใน cypress.config.ts)
// findByRole / findByLabelText / findByText มาจาก Testing Library ชุดเดียวกับที่ unit test ของ frontend ใช้
import '@testing-library/cypress/add-commands'
import 'cypress-mochawesome-reporter/register'
// กดแป้นพิมพ์จริงผ่าน Chrome (realPress) ปุ่มที่โฟกัสอยู่จึงทำงานเมื่อกด Enter เหมือนผู้ใช้กดจริง
import 'cypress-real-events'
import './commands'
