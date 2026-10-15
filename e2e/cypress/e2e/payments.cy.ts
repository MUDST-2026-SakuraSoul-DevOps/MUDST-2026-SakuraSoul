import { normalizeText } from '../support/helpers'

/*
  ออกบิลเป็นงานหลักของหอพัก บิลออกผ่าน POST /api/receipts ผู้เช่า ค่าเช่า และอัตรามาจากสัญญาของห้อง
  ห้อง 207 ในข้อมูลตัวอย่างมีสัญญา active ล็อกค่าไฟไว้ 50 ต่อหน่วย
  เทสเช็คว่ายอดค่าไฟคำนวณจากจำนวนหน่วยที่กรอก แล้วบิลที่ออกต้องขึ้นในตารางทันที
  ตัวเลขเงินเช็คแค่ส่วนตัวเลข ไม่ผูกกับสัญลักษณ์สกุลเงิน
*/
describe('payments (mock-api)', () => {
  it('E2E-PAYMENT-001: Creating a bill for room 207 calculates electricity from the entered usage and the bill appears in the table', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()
    cy.findByRole('heading', { name: 'Payment Management' }).should('be.visible')
    cy.findByRole('row', { name: /Yuki Tanaka/ }).should('be.visible')
    cy.findAllByRole('row').its('length').then((rowsBefore) => {
      cy.findByRole('button', { name: 'New Invoice' }).click()
      const dialog = () => cy.findByRole('dialog')
      dialog().should('contain.text', 'Create Payment')

      dialog().find('#payment-room').clear().type('207')
      dialog().find('#payment-tenant').should('have.value', 'Hiroshi Nakamura')
      // รายการห้องที่เด้งขึ้นตอนพิมพ์ยังเปิดค้าง และบังช่อง Electric usage ที่อยู่ใต้มัน
      // Cypress ไม่ยอมพิมพ์ใส่ช่องที่ถูกบัง จึงคลิกหัวป็อปอัปให้รายการปิดก่อน แบบที่คนกดออกนอกช่อง
      dialog().findByRole('heading', { name: 'Create Payment' }).click()
      dialog().find('#electric-usage').clear().type('100')
      dialog().find('#water-usage').clear().type('10')
      dialog().should(($dialog) => expect(normalizeText($dialog.text())).to.match(/× 50\.00 \/ unit = \D*5,000/))

      dialog().findByRole('button', { name: 'Create Bill' }).click()
      dialog().should('not.exist')
      cy.findAllByRole('row').should('have.length', rowsBefore + 1)
      cy.findAllByRole('row', { name: /Hiroshi Nakamura/ }).first().should('be.visible')
    })
  })
})
