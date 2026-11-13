// Payments are loaded from receipt.payments; a slip is an attachment of the payment (SSK-163, ownerType=PAYMENT).
describe('paymentHistory (mock-api)', () => {
  /**
   * รูป PNG ขนาด 1x1 ที่ถอดรหัสได้จริง ทั้งหน้าเว็บและ backend ตรวจชนิดจากเนื้อไฟล์
   * ต้องเป็นรูปจริง เพราะเทสเช็คว่ารูปแสดงได้ (naturalWidth) ไม่ใช่แค่มีแท็ก img
   */
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  function openPayments() {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()
  }

  function recordPayment(amount: string, slipName?: string) {
    cy.findByRole('row', { name: /Kenji Sato/ })
      .findByRole('button', { name: 'Record payment for unit 201' })
      .click()
    const pay = () => cy.findByRole('dialog', { name: 'Record payment' })
    pay().findByLabelText('Amount received (THB)').clear().type(amount)
    if (slipName) {
      pay()
        .findByLabelText('Payment slip (optional)')
        .selectFile({ contents: Cypress.Buffer.from(PNG, 'base64'), fileName: slipName, mimeType: 'image/png' }, { force: true })
      pay().findByRole('button', { name: `Remove ${slipName}` }).should('exist')
    }
    pay().findByRole('button', { name: 'Record payment' }).click()
    pay().should('not.exist')
  }

  it('E2E-PAYMENT-007: Every backend payment reaches history without a local archive', () => {
    openPayments()

    recordPayment('4000', 'slip-201-first.png')
    recordPayment('1500')

    cy.findByRole('button', { name: 'Payment history tab' }).click()

    // S3 จ่ายสองครั้งต้องเห็นสองรายการ ไม่ใช่ยุบเป็นรายการเดียว
    const history = () => cy.findByRole('table')
    history().should('contain.text', '฿4,000.00').and('contain.text', '฿1,500.00')
    history().findAllByText('Unit 201').should('have.length', 2)

    // PH2-04 S5 สลิปเป็นไฟล์แนบของการชำระก้อนนั้น ตารางยังไม่รู้ว่าก้อนไหนมีสลิป (backend ไม่มีธงบอก)
    // จึงเปิดป็อปอัปของแต่ละแถวดู ก้อนที่แนบต้องเห็นรูปที่แสดงได้จริง ก้อนที่ไม่แนบต้องบอกว่ายังไม่มี
    const slip = () => cy.findByRole('dialog', { name: 'Payment slip' })
    const row = (amount: RegExp) => history().findByRole('row', { name: new RegExp(`Unit 201.*${amount.source}`) })
    row(/4,000\.00/).findByRole('button', { name: /Payment slip for PAY-/ }).click()
    slip()
      .findByRole('img', { name: 'Payment slip slip-201-first.png' })
      .should(($img) => expect(($img[0] as HTMLImageElement).naturalWidth, 'รูปสลิปถอดรหัสได้').to.be.greaterThan(0))
    slip().findByRole('button', { name: 'Close' }).click()
    row(/1,500\.00/).findByRole('button', { name: /Payment slip for PAY-/ }).click()
    slip().findByText('No slip attached to this payment yet.').should('be.visible')
    slip().findByRole('button', { name: 'Close' }).click()

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
