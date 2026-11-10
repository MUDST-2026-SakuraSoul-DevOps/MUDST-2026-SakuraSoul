// ============================== [NOTE] ==============================
// ไฟล์นี้: กฎธุรกิจ 3 เคส ที่เช็คผ่านหน้าจอ
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory ไม่แตะ Spring/PostgreSQL
// เทส: E2E-CONTRACT-002 ฟอร์มสัญญาไม่มีห้องที่มีคนอยู่ และห้องที่เพิ่งทำสัญญาหายจากรายการทันที
//      E2E-CONFIG-001 เปลี่ยนค่าไฟใน Config แล้วฟอร์มสัญญาใช้ค่าใหม่
//      E2E-CONFIG-002 เปลี่ยนค่าไฟแล้วบิลของสัญญาเดิมยังใช้อัตราที่ล็อกไว้
// รัน: cd e2e → npm run open:mock แล้วคลิกไฟล์นี้ · หรือ npm run test:mock (รันทั้งชุด mock)
// ====================================================================

import { optionLabels } from '../support/helpers'

describe('businessRules (mock-api)', () => {
  /*
    US-05 ห้องเดียวกันห้ามมีสัญญาซ้อนช่วงเวลากัน ในหน้าเว็บกันไว้ด้วยการให้ฟอร์ม
    สร้างสัญญาเลือกได้แค่ห้องว่าง ห้องที่มีผู้เช่าอยู่จึงต้องไม่อยู่ในรายการเลย
    และห้องที่เพิ่งทำสัญญาไปต้องหายไปจากรายการทันที ไม่ใช่รอรีโหลด
    (ส่วนฐานข้อมูลกันซ้อนเองได้หรือไม่ พิสูจน์ที่ LeaseOverlapIntegrationTest ฝั่ง backend)
    ห้อง 102 มีสัญญาของ Yuki Tanaka อยู่แล้วในข้อมูลตั้งต้นของ backend จำลอง
  */
// [NOTE] E2E-CONTRACT-002 (US-05 กันสัญญาซ้อน)
//   ตรวจ 1: optionLabels อ่านรายการห้อง → ไม่มีห้อง 102 (Yuki มีสัญญาอยู่) · มีห้อง 105
//   กด: เลือก 105 → Create Contract · ตรวจ 2: เปิดฟอร์มใหม่ ห้อง 105 ต้องหายทันที (.should ถามซ้ำจนผ่าน)
  it('E2E-CONTRACT-002: Create Contract form excludes occupied rooms, and a just-leased room disappears from the list immediately', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Contracts' }).click()

    openCreateContract()
    unitSelect().then(optionLabels).then((units) => {
      expect(units.some((label) => label.startsWith('102 '))).to.eq(false)
      const unit105 = units.find((label) => label.startsWith('105 '))
      expect(unit105).to.not.be.undefined

      unitSelect().select(unit105!, { force: true })
    })
    contractDialog().findByRole('button', { name: 'Create Contract' }).click()
    contractDialog().should('not.exist')

    openCreateContract()
    unitSelect().should(($select) => {
      expect(optionLabels($select).some((label) => label.startsWith('105 '))).to.eq(false)
    })
  })

  /*
    อัตราค่าไฟที่ตั้งในหน้า Apartment Config ต้องไปถึงทุกที่ที่ใช้คิดเงิน บั๊ก SSK-116
    คือเอกสารสัญญาไม่อ่านค่าจาก Config เทสนี้กันไม่ให้เรื่องแบบเดียวกันกลับมาที่ฟอร์มสัญญา
  */
// [NOTE] E2E-CONFIG-001 (US-16) กด: setElectricityRate('77') ผ่าน Units → Config → Contracts → Create Contract
//   ตรวจ: dropdown #electric-billing มีตัวเลือกที่มี 77.00 · กันบั๊ก SSK-116
  it('E2E-CONFIG-001: Changing the electricity rate in Apartment Config updates the Create Contract form', () => {
    cy.signIn()
    setElectricityRate('77')

    cy.findByRole('link', { name: 'Contracts' }).click()
    openCreateContract()
    // ป็อปอัปโหลดอัตราจาก Config เองหลังเปิด ระหว่างนั้นตัวเลือกเป็น "Per unit - loading..." จึงถามซ้ำจนโหลดเสร็จ
    contractDialog()
      .find('#electric-billing')
      .should(($select) => {
        const rates = optionLabels($select)
        expect(rates.some((label) => label.includes('77.00'))).to.eq(true)
      })
  })

  /*
    บิลของสัญญาที่เซ็นไปแล้วต้องใช้อัตราที่ล็อกไว้ตอนเซ็น ไม่ใช่อัตราใน Config ที่แก้ทีหลัง
    ห้อง 207 ล็อกค่าไฟไว้ 50 เปลี่ยน Config เป็น 77 แล้วฟอร์มออกบิลของห้องนี้ต้องยังเป็น 50
    เดิมเทสนี้เช็คว่าฟอร์มออกบิลตาม Config ใหม่ ซึ่งตรงข้ามกับกฎล็อกอัตราที่ QA ย้ำไว้
  */
// [NOTE] E2E-CONFIG-002 (US-16) กด: ตั้งค่าไฟ 77 → Payments → New Invoice → พิมพ์ห้อง 207
//   ตรวจ: มี × 50.00 / unit (อัตราที่ล็อกในสัญญาห้อง 207) และไม่มี × 77.00 / unit
  it('E2E-CONFIG-002: Changing the electricity rate in Apartment Config does not change the rate on an existing contract bill', () => {
    cy.signIn()
    setElectricityRate('77')

    cy.findByRole('link', { name: 'Payments' }).click()
    cy.findByRole('button', { name: 'New Invoice' }).click()
    const dialog = () => cy.findByRole('dialog')
    dialog().find('#payment-room').clear().type('207')
    dialog().should('contain.text', '× 50.00 / unit')
    dialog().should('not.contain.text', '× 77.00 / unit')
  })
})

// [NOTE] ฟังก์ชันช่วย: contractDialog หาป็อปอัป · unitSelect หา select ห้อง · openCreateContract เปิดฟอร์ม
//   setElectricityRate เปลี่ยนค่าไฟผ่าน Units → Config → Save Rates
/** ป็อปอัป Create Contract */
function contractDialog(): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.findByRole('dialog', { name: 'Create Contract' })
}

/** select จริงที่ซ่อนไว้ใต้ dropdown ที่ทีมทำเอง (CustomSelect) เลือกค่าต้องใช้ force */
function unitSelect(): Cypress.Chainable<JQuery<HTMLElement>> {
  return contractDialog().find('#unit-select')
}

function openCreateContract() {
  cy.findByRole('button', { name: 'Create Contract' }).click()
  contractDialog().should('be.visible')
}

function setElectricityRate(rate: string) {
  cy.findByRole('link', { name: 'Units' }).click()
  cy.findByRole('button', { name: 'Config' }).click()
  const dialog = () => cy.findByRole('dialog')
  dialog().findByLabelText(/Electricity Rate per Unit/).clear().type(rate)
  dialog().findByRole('button', { name: 'Save Rates' }).click()
  dialog().should('not.exist')
}
