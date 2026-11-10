import { normalizeText, todayInBangkok } from '../support/helpers'

/*
  SSK-166 นำเข้าค่าน้ำค่าไฟจาก CSV ไฟล์มีแถวห้องที่ไม่มีอยู่หนึ่งแถว ต้องเห็นเลขบรรทัดกับเหตุผล
  แล้วนำเข้าเฉพาะแถวที่ถูก ห้อง 207 มีสัญญา active ล็อกค่าไฟไว้ 50 ต่อหน่วย ฟอร์มออกบิลต้องเติมหน่วยให้เอง
*/
describe('unitUsageImport (mock-api)', () => {
  it('E2E-UNITS-004: Importing a usage CSV reports the bad row, saves the good one, and fills the bill units', () => {
    const thisMonth = todayInBangkok().slice(0, 7)
    const csv = `room_number,month,electric_units,water_units\n207,${thisMonth},120.5,7\n999,${thisMonth},1,1\n`
    cy.signIn()

    cy.findByRole('link', { name: 'Units' }).click()
    cy.findByRole('link', { name: 'Water & Electricity' }).click()
    cy.findByRole('button', { name: 'Import usage CSV' }).click()
    const dialog = () => cy.findByRole('dialog')
    dialog().find('input[type=file]').selectFile(
      { contents: Cypress.Buffer.from(csv), fileName: 'usage.csv', mimeType: 'text/csv' },
      { force: true },
    )
    dialog().findByRole('button', { name: 'Review rows' }).click()
    dialog().findByRole('list', { name: 'Rows with problems' }).should('contain.text', 'Line 3: Unit 999 does not exist')
    dialog().findByRole('button', { name: 'Import 1 rows' }).click()
    dialog().should('contain.text', 'Import complete').and('contain.text', '1 rows saved')
    dialog().findByRole('button', { name: 'View usage' }).click()
    dialog().should('not.exist')
    cy.findByRole('row', { name: /207/ }).should('contain.text', '120.5').and('contain.text', 'CSV import')

    cy.findByRole('link', { name: 'Payments' }).click()
    cy.findByRole('button', { name: 'New Invoice' }).click()
    const bill = () => cy.findByRole('dialog')
    bill().find('#payment-room').clear().type('207')
    bill().findByRole('heading', { name: 'Create Payment' }).click()
    bill().find('#electric-usage').should('have.value', '120.5')
    bill().find('#water-usage').should('have.value', '7')
    // 120.5 หน่วย × 50.00 = 6,025.00
    bill().should(($d) => expect(normalizeText($d.text())).to.match(/× 50\.00 \/ unit = \D*6,025\.00/))
  })
})
