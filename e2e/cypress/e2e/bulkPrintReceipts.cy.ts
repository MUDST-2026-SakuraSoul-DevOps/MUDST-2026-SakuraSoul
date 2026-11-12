/*
  SSK-169 พิมพ์ใบเสร็จเป็นชุด (PH2-10)

  กติกาที่หน้าเว็บยึดคือ "ใบเสร็จออกให้เฉพาะเงินที่รับมาแล้วจริง" ไม่ใช่ทุกใบแจ้งหนี้
  ที่ติ๊กเลือก เส้นทางนี้จึงเดินครบทั้งสามสถานะ คือยังไม่เลือกอะไร เลือกใบที่ยังไม่มี
  การรับเงิน และเลือกใบที่รับเงินแล้ว เพื่อดูว่าปุ่มกับตัวนับเปลี่ยนตามถูกต้อง

  ครอบ S1 (หลายห้องรวมเป็นชุดเดียว) S4 (ใบที่ยังไม่มีการรับเงินถูกข้าม) และ
  S5 (ไม่เลือกอะไรต้องกดพิมพ์ไม่ได้ ไม่ใช่ได้ไฟล์เปล่า)

  เดินด้วยเมนูด้านข้างตลอด ไม่ cy.visit ซ้ำ เพราะ backend จำลองเก็บข้อมูลใน memory
  รีโหลดแล้วกลับเป็นค่าตั้งต้น
*/
describe('bulkPrintReceipts (mock-api)', () => {
  const selectionBar = () => cy.findByText(/invoices selected/)
  const bulkPrintButton = () => cy.findByRole('button', { name: 'Bulk print receipts' })

  it('E2E-PAYMENT-002: Bulk print covers only invoices with money actually received, and is unavailable until there is one', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()

    // S5 ยังไม่ติ๊กอะไร แถบเลือกยังไม่ขึ้น จึงไม่มีทางสั่งพิมพ์ไฟล์เปล่าได้
    selectionBar().should('not.exist')
    bulkPrintButton().should('not.exist')

    // S4 เคนจิยังไม่เคยจ่าย ติ๊กแล้วตัวนับใบเสร็จต้องเป็น 0 และปุ่มต้องกดไม่ได้
    cy.findByRole('checkbox', { name: 'Select invoice for Kenji Sato' }).check()
    selectionBar().should('have.text', '1 invoices selected · 0 payment receipts')
    bulkPrintButton().should('be.disabled')

    // รับเงินบางส่วนของเคนจิ พร้อมแนบสลิป
    cy.findByRole('row', { name: /Kenji Sato/ })
      .findByRole('button', { name: 'Record payment for unit 201' })
      .click()
    const pay = () => cy.findByRole('dialog', { name: 'Record payment' })
    pay().findByLabelText('Amount received (THB)').clear().type('4000')
    pay().findByLabelText('Payment method').select('PromptPay', { force: true })
    pay().findByRole('button', { name: 'Record payment' }).click()
    pay().should('not.exist')

    // S4 อีกครั้ง พอมีเงินเข้าแล้วใบเดิมกลายเป็นใบเสร็จที่พิมพ์ได้
    selectionBar().should('have.text', '1 invoices selected · 1 payment receipts')
    bulkPrintButton().should('be.enabled')

    // S1 เพิ่มยูกิที่จ่ายครบแล้ว รวมเป็นชุดเดียวสองใบ
    cy.findByRole('checkbox', { name: 'Select invoice for Yuki Tanaka' }).check()
    selectionBar().should('have.text', '2 invoices selected · 2 payment receipts')

    bulkPrintButton().click()
    const sheet = () => cy.findByRole('dialog', { name: 'Bulk print receipts' })

    // ทั้งสองห้องต้องอยู่ในเอกสารเดียวกัน พร้อมยอดที่รับจริงของแต่ละใบ
    sheet().should('contain.text', 'Kenji Sato').and('contain.text', 'Unit 201')
    sheet().should('contain.text', 'Yuki Tanaka').and('contain.text', 'Unit 102')
    sheet().should('contain.text', '4,000.00').and('contain.text', '15,250.00')
    // สลิปที่แนบตอนรับเงินต้องตามมาในใบเสร็จด้วย ไม่ใช่หายไประหว่างทาง
    sheet().should('not.contain.text', 'slip-201.png')
    sheet().findAllByText('Paid').should('have.length', 2)
    sheet().findByRole('button', { name: 'Print 2 receipts' }).click()
    sheet().find('iframe[title="Receipt PDF preview"]').should('have.attr', 'src').and('match', /^blob:/)
    sheet().findByRole('button', { name: 'Download receipt PDF' }).should('be.visible')

    sheet().findByRole('button', { name: 'Close' }).click()
    sheet().should('not.exist')
  })

  it('E2E-PAYMENT-003: Selecting only unpaid invoices offers nothing to print and says why', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()

    // ติ๊กเฉพาะใบที่ยังไม่มีเงินเข้า ตัวนับใบเสร็จต้องอยู่ที่ 0 ตลอด
    cy.findByRole('checkbox', { name: 'Select invoice for Kenji Sato' }).check()
    selectionBar().should('have.text', '1 invoices selected · 0 payment receipts')

    // ปุ่มกดไม่ได้คือสิ่งที่กันไฟล์เปล่าไว้ ไม่ใช่ข้อความเตือนหลังกด
    bulkPrintButton().should('be.disabled')

    // เอาออกแล้วแถบต้องหายไปทั้งแถบ
    cy.findByRole('checkbox', { name: 'Select invoice for Kenji Sato' }).uncheck()
    selectionBar().should('not.exist')
  })
})
