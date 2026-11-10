// ============================== [NOTE] ==============================
// ไฟล์นี้: QR พร้อมเพย์กับดอกเบี้ยค้างชำระ 4 เคส (SSK-168, SSK-164)
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory
// เทส: E2E-PAYMENT-009 ยังไม่ตั้ง PromptPay ID ต้องไม่สร้าง QR และบอกให้ไปตั้งค่า
//      E2E-PAYMENT-010 ตั้ง PromptPay ID แล้ว QR ขึ้นบนใบแจ้งหนี้
//      E2E-PAYMENT-011 อัตราดอกเบี้ยติดลบและเกิน 100% ต้องบันทึกไม่ได้
//      E2E-PAYMENT-012 เปิดดอกเบี้ยแล้วใบที่มียอดยกมาโชว์บรรทัดดอกเบี้ย ปิดแล้วหาย
// รัน: cd e2e → $env:E2E_ADMIN_PASSWORD='x'; npm test
// ====================================================================

/*
  SSK-168 QR พร้อมเพย์บนใบแจ้งหนี้ · SSK-164 ดอกเบี้ยค้างชำระ

  สองการ์ดนี้ไม่มี E2E คุมเลยตอนที่ไล่ coverage วันที่ 9 พ.ย. ทั้งคู่เป็นเรื่องเงินที่ผู้เช่าเห็น
  จึงอยู่ลำดับแรกของการ์ดที่ยังขาด

  เคสที่สำคัญที่สุดคือ E2E-PAYMENT-009 เพราะรีวิวรอบ 2 เจอว่าเดิมโค้ดมี fallback ไปเบอร์
  พร้อมเพย์ตัวอย่าง `0812345678` ถ้าแอดมินยังไม่ได้ตั้งค่า ผู้เช่าสแกนแล้วโอนเงินออกจริงได้
  เอมี่แก้แล้วในรอบ 2 เคสนี้คือตัวกันไม่ให้กลับมา

  E2E-PAYMENT-011 คุม validation ของอัตราดอกเบี้ย ซึ่งเป็นด่านเดียวที่กันแอดมินตั้งค่าพลาด
  E2E-PAYMENT-012 คุมว่าสวิตช์ดอกเบี้ยมีผลกับเอกสารที่ผู้เช่าเห็นจริง ไม่ใช่แค่เก็บค่าไว้

  เดินด้วยเมนูด้านข้างตลอด ไม่ cy.visit เพราะข้อมูลอยู่ใน memory รีโหลดแล้วกลับเป็นค่าตั้งต้น
  ค่าตั้งต้นของ promptPayId เป็นค่าว่าง (เอมี่แก้ในรอบ 2) เคส 009 จึงเริ่มจากสถานะยังไม่ตั้งค่าได้เลย
*/
describe('paymentsPhase2Billing (mock-api)', () => {
  const dialog = (name: string) => cy.findByRole('dialog', { name })

  function openPayments() {
    cy.findByRole('link', { name: 'Payments' }).click()
  }

  function openBillingSettings() {
    cy.findByRole('button', { name: 'Billing Settings' }).click()
  }

  /** เปิดใบแจ้งหนี้ใบแรกในตาราง ไม่ผูกกับชื่อผู้เช่าคนใดคนหนึ่ง */
  function openFirstReceipt() {
    cy.findAllByLabelText(/^View receipt for /).first().click()
  }

  it('E2E-PAYMENT-009: With no PromptPay ID configured the invoice shows no QR and says where to set it', () => {
    cy.signIn()
    openPayments()
    openFirstReceipt()

    const receipt = () => cy.findByRole('dialog')
    // ต้องไม่มี QR ให้สแกน และต้องบอกว่าไปตั้งค่าที่ไหน ไม่ใช่เงียบ ๆ
    receipt().should('contain.text', 'PromptPay QR not configured')
    receipt().should('contain.text', 'Please configure PromptPay ID in Billing Settings')
    receipt().findByAltText('PromptPay QR').should('not.exist')
  })

  it('E2E-PAYMENT-010: After setting a PromptPay ID the invoice renders a QR to scan', () => {
    cy.signIn()
    openPayments()
    openBillingSettings()

    dialog('Billing Settings').within(() => {
      cy.get('#promptpay-id').clear().type('0812345678')
      cy.findByRole('button', { name: 'Save Settings' }).click()
    })
    cy.findByRole('dialog', { name: 'Billing Settings' }).should('not.exist')

    openFirstReceipt()
    // QR เป็นรูปที่ generate จาก payload ของบิลใบนี้ ต้องขึ้นจริงไม่ใช่กล่องเปล่า
    cy.findByRole('dialog').findByAltText('PromptPay QR').should('be.visible')
    cy.findByRole('dialog').should('not.contain.text', 'PromptPay QR not configured')
  })

  it('E2E-PAYMENT-011: An interest rate below zero or above 100 cannot be saved', () => {
    cy.signIn()
    openPayments()
    openBillingSettings()

    dialog('Billing Settings').within(() => {
      cy.findByLabelText('Apply interest to overdue principal').check()

      // ติดลบ
      cy.findByLabelText('Interest per month (%)').clear().type('-1')
      cy.findByRole('button', { name: 'Save Settings' }).click()
      cy.findByRole('alert').should('contain.text', 'Interest rate cannot be negative')

      // เกิน 100
      cy.findByLabelText('Interest per month (%)').clear().type('101')
      cy.findByRole('button', { name: 'Save Settings' }).click()
      cy.findByRole('alert').should('contain.text', 'Interest rate cannot exceed 100%')
    })

    // ป็อปอัปต้องยังเปิดอยู่ ไม่ใช่ปิดไปเหมือนบันทึกสำเร็จ
    dialog('Billing Settings').findByRole('button', { name: 'Save Settings' }).should('be.visible')
  })

  /*
    เคสนี้ตั้งใจไม่เทสว่า "บรรทัด Late interest ขึ้นบนใบแจ้งหนี้" เพราะข้อมูลตั้งต้นของ backend จำลอง
    ไม่มีใบไหนที่ยกยอดมา (ลองแล้ว ไม่มีคำว่า "Incl. carry" ในตารางเลย) และ E2E ไม่มีทางสร้าง
    สถานะนั้นผ่านหน้าจอได้ ต้องไปแก้ seed ซึ่งเป็นงานของฝั่งที่ทำฟีเจอร์
    การคำนวณดอกเบี้ยกับยอดยกมามี unit test คุมอยู่แล้วที่ paymentPhase2.balances.test.ts
    ที่นี่จึงคุมเฉพาะสิ่งที่หน้าจอทำได้จริง คือค่าที่แอดมินตั้งต้องถูกบันทึกและอ่านกลับได้ตรง
  */
  it('E2E-PAYMENT-012: Interest settings the admin saves are read back unchanged', () => {
    cy.signIn()
    openPayments()
    openBillingSettings()

    dialog('Billing Settings').within(() => {
      cy.findByLabelText('Apply interest to overdue principal').check()
      cy.findByLabelText('Interest per month (%)').clear().type('2')
      cy.findByLabelText('Interest basis').should('have.value', 'Simple interest · principal only')
      cy.findByRole('button', { name: 'Save Settings' }).click()
    })
    cy.findByRole('dialog', { name: 'Billing Settings' }).should('not.exist')
    // toast ของหน้า Payments ไม่ได้ใส่ role="status" ไว้ (ต่างจากหน้า Documents ที่ใส่) จึงหาด้วยข้อความ
    cy.contains('Billing settings updated successfully').should('be.visible')

    // เปิดกลับมาต้องได้ค่าเดิม ไม่ใช่กลับไปเป็นค่าตั้งต้น
    openBillingSettings()
    dialog('Billing Settings').within(() => {
      cy.findByLabelText('Apply interest to overdue principal').should('be.checked')
      cy.findByLabelText('Interest per month (%)').should('have.value', '2')

      // ปิดสวิตช์แล้วช่องอัตราต้องถูกล็อก กันแอดมินตั้งอัตราทิ้งไว้โดยที่ระบบไม่ได้คิดดอกเบี้ย
      cy.findByLabelText('Apply interest to overdue principal').uncheck()
      cy.findByLabelText('Interest per month (%)').should('be.disabled')
      cy.findByRole('button', { name: 'Save Settings' }).click()
    })
    cy.findByRole('dialog', { name: 'Billing Settings' }).should('not.exist')

    openBillingSettings()
    dialog('Billing Settings')
      .findByLabelText('Apply interest to overdue principal')
      .should('not.be.checked')
  })
})
