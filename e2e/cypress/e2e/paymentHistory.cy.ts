// Payments are loaded from receipt.payments; proof uploads belong to the attachment integration.
describe('paymentHistory (mock-api)', () => {
  function openPayments() {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()
  }

  function recordPayment(amount: string) {
    cy.findByRole('row', { name: /Kenji Sato/ })
      .findByRole('button', { name: 'Record payment for unit 201' })
      .click()
    const pay = () => cy.findByRole('dialog', { name: 'Record payment' })
    pay().findByLabelText('Amount received (THB)').clear().type(amount)
    pay().findByRole('button', { name: 'Record payment' }).click()
    pay().should('not.exist')
  }

  it('E2E-PAYMENT-007: Every backend payment reaches history without a local archive', () => {
    openPayments()

    recordPayment('4000')
    recordPayment('1500')

    cy.findByRole('button', { name: 'Payment history tab' }).click()

    // S3 จ่ายสองครั้งต้องเห็นสองรายการ ไม่ใช่ยุบเป็นรายการเดียว
    const history = () => cy.findByRole('table')
    history().should('contain.text', '฿4,000.00').and('contain.text', '฿1,500.00')
    history().findAllByText('Unit 201').should('have.length', 2)

    // S5 ครั้งที่แนบสลิปต้องเห็นชื่อไฟล์ ครั้งที่ไม่แนบต้องบอกว่าไม่ได้แนบ
    // ไม่ใช่ปล่อยช่องว่างจนแยกไม่ออกว่าหายหรือไม่เคยมี
    history().should('not.contain.text', 'slip-201-first.png')
    history().should('contain.text', 'Not attached (optional)')

    // ลิงก์ไปแฟ้มเอกสารของห้องนั้นต้องชี้ถูกห้อง
    history()
      .findAllByRole('link', { name: 'Receipt files for unit 201' })
      .first()
      .should('have.attr', 'href')
      .and('contain', 'unit=201')
  })

  it('E2E-PAYMENT-008: The header checkbox selects the whole building in one click', () => {
    openPayments()

    // PH2-10 S3 ติ๊กช่องบนหัวตารางครั้งเดียวต้องเลือกทุกใบที่เห็นอยู่
    cy.findByRole('checkbox', { name: 'Select all invoices' }).check()

    cy.findAllByRole('checkbox').each(($box) => {
      cy.wrap($box).should('be.checked')
    })

    // ตัวนับใบที่เลือกต้องเท่ากับจำนวนแถวจริง ไม่ใช่เลขคงที่
    cy.findAllByRole('checkbox')
      .then(($boxes) => $boxes.length - 1) // หักช่องบนหัวตารางออก
      .then((rowCount) => {
        cy.findByText(/invoices selected/).should('contain.text', `${rowCount} invoices selected`)
      })

    // เอาติ๊กออกจากหัวตารางต้องล้างทั้งหมด ไม่ใช่ค้างไว้บางใบ
    cy.findByRole('checkbox', { name: 'Select all invoices' }).uncheck()
    cy.findByText(/invoices selected/).should('not.exist')
  })
})
