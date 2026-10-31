import { normalizeText, optionLabels, todayInBangkok } from '../support/helpers'

/*
  SSK-162 อัตราต่อห้องตามช่วงเวลา ตามกติกาของ SSK-180: อัตราใหม่มีผลกับสัญญาที่ทำตั้งแต่เดือนนั้น
  ส่วนบิลที่ออกไปแล้วไม่เปลี่ยน ห้อง 105 ในข้อมูลตัวอย่างว่างและไม่เคยมีบิล จึงตั้งอัตราของเดือนนี้ได้
  เดินด้วยเมนูด้านข้างตลอด ไม่ cy.visit เพราะ backend จำลองเก็บข้อมูลใน memory
*/
describe('unitRates (mock-api)', () => {
  it('E2E-UNITS-002: A new room rate is used by the next contract and its bill, while an issued bill keeps its amount', () => {
    const thisMonth = todayInBangkok().slice(0, 7)
    cy.signIn()

    // บิลเดิมของ Yuki ห้อง 102 ยอด 15,250 (ข้อมูลตัวอย่าง) ต้องไม่เปลี่ยน
    cy.findByRole('link', { name: 'Payments' }).click()
    cy.findByRole('row', { name: /Yuki Tanaka/ }).should('contain.text', '15,250')

    cy.findByRole('link', { name: 'Units' }).click()
    cy.findByRole('link', { name: 'View rates for unit 105' }).click()
    cy.findByText('Rate history · Unit 105').should('be.visible')
    cy.findByRole('button', { name: 'Schedule rate' }).click()
    const dialog = () => cy.findByRole('dialog')
    dialog().findByLabelText(/Effective from/).clear().type(thisMonth)
    dialog().findByLabelText(/Monthly rent/).clear().type('5200')
    dialog().findByLabelText('Reason / note').type('Renovated unit')
    dialog().findByRole('button', { name: 'Schedule rate' }).click()
    dialog().should('not.exist')
    cy.findByRole('row', { name: /Renovated unit/ }).should('contain.text', '5,200')

    // สัญญาใหม่ของห้อง 105 เริ่มวันนี้ จึงได้อัตราใหม่
    cy.findByRole('link', { name: 'Contracts' }).click()
    cy.findByRole('button', { name: 'Create Contract' }).click()
    const contract = () => cy.findByRole('dialog', { name: 'Create Contract' })
    contract().find('#unit-select').then(($s) => {
      cy.wrap($s).select(optionLabels($s).find((l) => /^105 /.test(l))!, { force: true })
    })
    contract().find('#tenant-select').then(($s) => {
      cy.wrap($s).select(optionLabels($s).find((l) => /Haruto Watanabe/.test(l))!, { force: true })
    })
    contract().findByRole('button', { name: 'Create Contract' }).click()
    contract().should('not.exist')

    cy.findByRole('link', { name: 'Payments' }).click()
    cy.findByRole('button', { name: 'New Invoice' }).click()
    const bill = () => cy.findByRole('dialog')
    bill().find('#payment-room').clear().type('105')
    bill().findByRole('heading', { name: 'Create Payment' }).click()
    bill().find('#electric-usage').clear().type('0')
    bill().find('#water-usage').clear().type('0')
    bill().should(($d) => expect(normalizeText($d.text())).to.match(/Room rent\s*\D*5,200\.00/))
    bill().findByRole('button', { name: 'Create Bill' }).click()
    bill().should('not.exist')
    cy.findByRole('row', { name: /Yuki Tanaka/ }).should('contain.text', '15,250')
  })
})
