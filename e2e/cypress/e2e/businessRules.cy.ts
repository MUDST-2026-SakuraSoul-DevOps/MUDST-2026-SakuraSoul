import { optionLabels } from '../support/helpers'

describe('businessRules (mock-api)', () => {
  /*
    US-05 ห้องเดียวกันห้ามมีสัญญาซ้อนช่วงเวลากัน ในหน้าเว็บกันไว้ด้วยการให้ฟอร์ม
    สร้างสัญญาเลือกได้แค่ห้องว่าง ห้องที่มีผู้เช่าอยู่จึงต้องไม่อยู่ในรายการเลย
    และห้องที่เพิ่งทำสัญญาไปต้องหายไปจากรายการทันที ไม่ใช่รอรีโหลด
    (ส่วนฐานข้อมูลกันซ้อนเองได้หรือไม่ พิสูจน์ที่ LeaseOverlapIntegrationTest ฝั่ง backend)
    ห้อง 102 มีสัญญาของ Yuki Tanaka อยู่แล้วในข้อมูลตั้งต้นของ backend จำลอง
  */
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
