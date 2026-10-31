import { normalizeText, optionLabels, todayInBangkok } from '../support/helpers'

/*
  SSK-165 ค่าใช้จ่ายพิเศษต่อห้อง ตามกติกาของ SSK-180 สัญญาคัดลอกรายการของห้องตอนทำสัญญา
  จึงตั้งค่าที่จอดรถของห้อง 105 ก่อน แล้วค่อยทำสัญญา บิลแรกต้องมีบรรทัดค่าที่จอดรถ 500
*/
describe('unitCharges (mock-api)', () => {
  it('E2E-UNITS-003: A monthly parking charge added to a unit shows on the bill of a contract signed after it', () => {
    const thisMonth = todayInBangkok().slice(0, 7)
    cy.signIn()

    cy.findByRole('link', { name: 'Units' }).click()
    cy.findByRole('link', { name: 'Extra charges' }).click()
    cy.findByText('No extra charges yet.').should('be.visible')
    cy.findByRole('button', { name: 'Add charge' }).click()
    const dialog = () => cy.findByRole('dialog')
    dialog().findByLabelText('Unit').select('105')
    dialog().findByLabelText('Frequency').select('Monthly')
    dialog().findByLabelText('Charge description').type('Parking space')
    dialog().findByLabelText(/Amount/).clear().type('500')
    dialog().findByLabelText('First month').clear().type(thisMonth)
    dialog().findByRole('button', { name: 'Add charge' }).click()
    dialog().should('not.exist')
    cy.findByRole('row', { name: /Parking space/ }).should('contain.text', '105').and('contain.text', 'Active')

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
    bill().should(($d) => {
      const text = normalizeText($d.text())
      expect(text).to.match(/Parking space · Monthly\s*\D*500\.00/)
      // 3,500 ค่าเช่าห้องเดี่ยว + 300 + 250 + 500 ค่าที่จอดรถ
      expect(text).to.match(/Total\s*\D*4,550\.00/)
    })
    bill().findByRole('button', { name: 'Create Bill' }).click()
    bill().should('not.exist')
    cy.findAllByRole('row', { name: /Haruto Watanabe/ }).first().should('contain.text', '4,550')
  })
})
