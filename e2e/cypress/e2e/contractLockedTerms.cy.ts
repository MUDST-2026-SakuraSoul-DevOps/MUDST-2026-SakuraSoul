// ============================== [NOTE] ==============================
// ไฟล์นี้: เงื่อนไขการเงินของสัญญาถูกล็อกตอนแก้ 2 เคส (SSK-180)
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory
// เทส: E2E-CONTRACT-003 โหมดแก้สัญญา รอบบิลกับเงินประกันอ่านได้แต่แก้ไม่ได้ ส่วนโหมดสร้างยังแก้ได้ตามเดิม
//      E2E-CONTRACT-004 แก้แค่วันสิ้นสุดแล้วบันทึกผ่าน และค่าที่ล็อกไว้ไม่ขยับหลังบันทึก
// รัน: cd e2e → $env:E2E_ADMIN_PASSWORD='x'; npm test (หรือ npm run open:mock แล้วคลิกไฟล์นี้)
// ====================================================================

/*
  SSK-180 — เงื่อนไขการเงินของสัญญาล็อกตั้งแต่วันเซ็น
  (คอมเมนต์อาจารย์ "สัญญาเก่าต้องไม่เปลี่ยนเมื่อมีการเปลี่ยนแปลงใหม่")

  ทีมตกลงวันที่ 7 พ.ย. ว่าไม่ทำ amendment ถ้าจะเปลี่ยนเงินประกันหรือรอบบิล ให้ปิดสัญญาแล้วทำใบใหม่
  backend (#198) ตอบ 409 ถ้าได้ค่าใหม่มา ส่วนหน้าเว็บ (#199) ปิดช่องไม่ให้แก้แล้วส่งค่าเดิมกลับไปเสมอ

  ที่ต้องมีเทสคุมคือฝั่งหน้าเว็บ เพราะถ้าวันหลังใครเผลอเปิดช่องให้แก้อีก จะไม่มีอะไรฟ้องเลย
  ผู้ใช้จะกดบันทึกแล้วเจอ 409 ที่อ่านไม่รู้เรื่อง ทั้งที่ฟอร์มเพิ่งให้พิมพ์ลงไปเอง

  E2E-CONTRACT-003 เช็คสองทางพร้อมกัน คือล็อกจริงในโหมดแก้ และ "ไม่ล็อกเกินไป" ในโหมดสร้าง
  ข้อหลังสำคัญ เพราะถ้าล็อกผิดโหมด จะกลายเป็นตั้งเงินประกันตอนทำสัญญาใหม่ไม่ได้เลย

  E2E-CONTRACT-004 ไม่เช็ค request body เพราะ mockApi ตอบอยู่ในเบราว์เซอร์ cy.intercept มองไม่เห็น
  ที่เช็คได้คือผล คือป็อปอัปปิด (ไม่โดนปฏิเสธ) และค่าที่ล็อกยังเดิมเมื่อเปิดดูอีกครั้ง
  การตรวจ body ไว้ให้ชุด live ทำ (E2E-LIVE-CONTRACT-003)

  สัญญาที่ใช้คือใบตั้งต้นของ backend จำลอง ห้อง 102 ของ Yuki Tanaka (MONTHLY, เงินประกัน 9,000)
  ปุ่มดินสอในตารางขึ้นเฉพาะตอนหน้าอยู่ในโหมดแก้ไข จึงต้องกดปุ่ม Edit ของหน้าก่อนทุกครั้ง
  เดินด้วยเมนูด้านข้างตลอด ไม่ cy.visit เพราะข้อมูลอยู่ใน memory รีโหลดแล้วกลับเป็นค่าตั้งต้น
*/
describe('contractLockedTerms (mock-api)', () => {
  const dialog = (name: string) => cy.findByRole('dialog', { name })

  function openEditContract() {
    cy.findByRole('link', { name: 'Contracts' }).click()
    // ปุ่ม Edit ของหน้า เปิดคอลัมน์ Actions ให้มีปุ่มดินสอ
    cy.findByRole('button', { name: 'Edit' }).click()
    cy.findByRole('button', { name: 'Edit contract for Unit 102' }).click()
  }

  it('E2E-CONTRACT-003: Editing a contract shows billing cycle and deposit as locked, while creating one still allows both', () => {
    cy.signIn()
    openEditContract()

    const edit = () => dialog('Edit Contract')

    // รอบบิล: เปลี่ยนจากดรอปดาวน์เป็นช่องอ่านอย่างเดียว ค่าที่โชว์ต้องเป็นของสัญญาใบนี้
    edit().findByLabelText(/Billing Cycle/).should('have.value', 'Monthly').and('have.attr', 'readonly')
    // ยืนยันว่าไม่ใช่ <select> อีกแล้ว ไม่งั้นยังมีทางเปลี่ยนค่าด้วยคีย์บอร์ดอยู่
    edit().findByLabelText(/Billing Cycle/).should('have.prop', 'tagName', 'INPUT')

    // เงินประกัน: โชว์เป็นจำนวนเงินที่จัดรูปแบบแล้ว และอ่านอย่างเดียว
    edit().findByLabelText(/Security Deposit/).should('have.value', '฿9,000.00').and('have.attr', 'readonly')

    // ต้องบอกผู้ใช้ด้วยว่าทำไมแก้ไม่ได้ และต้องทำอย่างไรถ้าอยากเปลี่ยน
    edit().should('contain.text', 'Locked when the contract was created')
    edit().should('contain.text', 'end this contract and create a new one')

    // พิมพ์ทับทั้งสองช่องแล้วค่าต้องไม่ขยับ (force เพราะ Cypress ไม่ยอมพิมพ์ลงช่อง readonly เอง)
    edit().findByLabelText(/Security Deposit/).type('1', { force: true })
    edit().findByLabelText(/Security Deposit/).should('have.value', '฿9,000.00')
    edit().findByLabelText(/Billing Cycle/).type('Yearly', { force: true })
    edit().findByLabelText(/Billing Cycle/).should('have.value', 'Monthly')

    edit().findByRole('button', { name: 'Cancel' }).click()
    edit().should('not.exist')

    // อีกด้านของกฎ: โหมดสร้างสัญญาใหม่ต้องยังตั้งสองค่านี้ได้ ไม่ใช่ล็อกยกแผง
    cy.findByRole('button', { name: 'Create Contract' }).click()
    const create = () => dialog('Create Contract')
    create().findByLabelText(/Security Deposit/).should('not.have.attr', 'readonly')
    create().findByLabelText(/Billing Cycle/).should('have.prop', 'tagName', 'SELECT')
    create().should('not.contain.text', 'end this contract and create a new one')
  })

  it('E2E-CONTRACT-004: Changing only the end date saves, and the locked terms are unchanged afterwards', () => {
    cy.signIn()
    openEditContract()
    const edit = () => dialog('Edit Contract')

    // แก้เฉพาะช่องที่ยังแก้ได้ ถ้าหน้าเว็บส่งค่าการเงินผิดไป backend จะตอบ 409
    // แล้วป็อปอัปจะไม่ปิด เคสนี้จึงเป็นตัวจับว่า "ส่งค่าเดิมกลับไป" ทำงานจริง
    edit().findByLabelText(/End Date/).clear().type('2030-06-30')
    edit().findByRole('button', { name: 'Confirm' }).click()

    // ปิดได้ = บันทึกผ่าน · ถ้ามี alert โผล่แปลว่าโดนปฏิเสธ
    edit().should('not.exist')
    cy.findByRole('alert').should('not.exist')

    // เปิดป็อปอัปเดิมอีกครั้ง วันสิ้นสุดต้องเป็นค่าใหม่ ส่วนค่าที่ล็อกต้องเท่าเดิมทุกตัวอักษร
    cy.findByRole('button', { name: 'Edit contract for Unit 102' }).click()
    edit().findByLabelText(/End Date/).should('have.value', '2030-06-30')
    edit().findByLabelText(/Billing Cycle/).should('have.value', 'Monthly')
    edit().findByLabelText(/Security Deposit/).should('have.value', '฿9,000.00')
    edit().findByRole('button', { name: 'Cancel' }).click()
  })
})
