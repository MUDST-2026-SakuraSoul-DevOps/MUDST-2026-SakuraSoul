/*
  SSK-170 รายงานสรุป (PH2-11)

  แท็บนี้มีตัวจัดกลุ่มสามแบบกับตัวกรองสามช่อง เส้นทางนี้กดครบทั้งสามกลุ่ม กรองจนไม่เหลือ
  ข้อมูล และเลือกทุกเดือนเพื่อดูว่ารายงานปฏิเสธการบวกยอดคงเหลือข้ามเดือนจริงไหม

  ครอบ S3 (มุมมองตามเดือน) และ S4 (ช่วงที่ไม่มีข้อมูลต้องบอกว่าไม่มี ไม่ใช่โชว์ศูนย์)

  ตั้งแต่ cf81c1c รายงานอ่านใบแจ้งหนี้จริงในหน้า Payments (buildReportRows) แทนชุดตัวอย่าง
  INITIAL_REPORT_ROWS ข้อมูลตั้งต้นของ backend จำลองคือใบแจ้งหนี้สองใบของ "เดือนที่แล้ว"
    - ห้อง 102 Yuki Tanaka  ฿15,250.00 จ่ายครบ
    - ห้อง 201 Kenji Sato   ฿9,700.00  ยังไม่จ่าย
  เดือนคำนวณจากวันนี้ (monthFromToday(-1)) เทสจึงอ่านชื่อเดือนจากตัวเลือกบนหน้าจอ ไม่ฝังไว้

  เดินด้วยเมนูด้านข้างตลอด ไม่ cy.visit เพราะ backend จำลองเก็บข้อมูลใน memory
*/
describe('paymentReports (mock-api)', () => {
  function openPayments() {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()
    cy.findByRole('row', { name: /Yuki Tanaka/ }).should('be.visible')
  }

  function openReportsTab() {
    cy.findByRole('button', { name: 'Summary reports tab' }).click()
  }

  const summary = () => cy.findByRole('table')

  /** การ์ดสรุปด้านบน เช่น CLOSING BALANCE ซึ่งเป็นชื่อหัวตารางด้วย จึงหาจากป้ายบนการ์ด (แท็ก p) */
  const card = (label: string) => cy.contains('p', label).parent()

  /** ชื่อเดือนของข้อมูลตั้งต้น อ่านจากตัวเลือก Billing period (ตัวเลือกแรกหลัง All months) */
  function seededMonth(): Cypress.Chainable<string> {
    return cy
      .get('#report-period option')
      .then(($opts) => $opts.toArray().map((o) => o.textContent ?? ''))
      .then((labels) => labels.filter((l) => /^[A-Z][a-z]{2} \d{4}$/.test(l)))
      .then((months) => {
        expect(months, 'มีข้อมูลเดือนเดียวก่อนสร้างบิลใหม่').to.have.length(1)
        return months[0]
      })
  }

  it('E2E-PAYMENT-004: Switching the grouping recomputes the same money under a different key', () => {
    openPayments()
    openReportsTab()

    // ตั้งต้นคือ All months ทุกห้อง ทุกคน จัดกลุ่มตามห้อง ข้อมูลมีเดือนเดียวจึงแสดงยอดคงเหลือได้
    cy.findByText('Summary by unit').should('be.visible')
    summary().should('contain.text', 'Unit 102').and('contain.text', 'Unit 201')
    summary().findAllByRole('row').should('have.length', 3) // หัวตาราง + 2 ห้อง

    card('CURRENT CHARGES').should('contain.text', '฿24,950.00')
    card('PAYMENTS RECEIVED').should('contain.text', '฿15,250.00')
    card('CLOSING BALANCE').should('contain.text', '฿9,700.00')

    // S3 จัดกลุ่มตามผู้เช่า เงินก้อนเดิมแต่เปลี่ยนคีย์ ไม่ใช่คิดใหม่คนละสูตร
    cy.findByRole('button', { name: 'Group by Tenant' }).click()
    cy.findByText('Summary by tenant').should('be.visible')
    summary().should('contain.text', 'Kenji Sato').and('contain.text', 'Yuki Tanaka')
    summary().should('not.contain.text', 'Unit 102')
    card('CURRENT CHARGES').should('contain.text', '฿24,950.00')

    // S3 จัดกลุ่มตามเดือน ข้อมูลเดือนเดียวจึงเหลือแถวเดียว
    cy.findByRole('button', { name: 'Group by Month' }).click()
    cy.findByText('Summary by month').should('be.visible')
    summary().findAllByRole('row').should('have.length', 2)
    seededMonth().then((month) => summary().should('contain.text', month))
  })

  it('E2E-PAYMENT-005: Filters that match nothing say so instead of showing a table of zeros', () => {
    openPayments()
    openReportsTab()

    // ห้อง 102 เป็นของ Yuki Tanaka การเลือกคู่กับ Kenji Sato จึงไม่มีทางมีข้อมูล
    cy.get('#report-unit').select('102', { force: true })
    cy.get('#report-tenant').select('Kenji Sato', { force: true })

    cy.findByText('No summary data matches the selected filters.').should('be.visible')
    // ศูนย์บาทแปลว่าเก็บได้ศูนย์ ซึ่งคนละเรื่องกับไม่มีข้อมูลเลย
    summary().should('not.contain.text', '฿0.00')

    // คลายตัวกรองแล้วข้อมูลต้องกลับมา
    cy.get('#report-tenant').select('Yuki Tanaka', { force: true })
    cy.findByText('No summary data matches the selected filters.').should('not.exist')
    summary().should('contain.text', 'Unit 102')
  })

  it('E2E-PAYMENT-006: Choosing every month refuses to add closing balances together', () => {
    openPayments()
    openReportsTab()
    seededMonth().then((lastMonth) => {
      // ออกบิลเดือนนี้ให้ห้อง 207 ข้อมูลจะมีสองเดือน (เดือนที่แล้วจากข้อมูลตั้งต้น + เดือนนี้)
      cy.findByRole('button', { name: 'Invoices tab' }).click()
      cy.findByRole('button', { name: 'New Invoice' }).click()
      const dialog = () => cy.findByRole('dialog')
      dialog().find('#payment-room').clear().type('207')
      dialog().find('#payment-tenant').should('have.value', 'Hiroshi Nakamura')
      // ปิดรายการห้องที่เด้งค้างก่อน (ดู E2E-PAYMENT-001)
      dialog().findByRole('heading', { name: 'Create Payment' }).click()
      dialog().find('#electric-usage').clear().type('100')
      dialog().find('#water-usage').clear().type('10')
      dialog().findByRole('button', { name: 'Create Bill' }).click()
      dialog().should('not.exist')

      openReportsTab()
      cy.get('#report-period').select('All months', { force: true })

      // ยอดคงเหลือเป็น snapshot ของแต่ละเดือน บวกกันไม่ได้ การ์ดจึงไม่ยอมโชว์ตัวเลข
      card('CLOSING BALANCE').should('contain.text', 'By period below')
      summary().findAllByText('Select one month').should('have.length.at.least', 1)
      // ยอดที่บวกข้ามเดือนได้ยังบวกให้ ห้อง 207 ทำให้ค่าใช้จ่ายรวมเกินข้อมูลตั้งต้น
      card('CURRENT CHARGES').should('not.contain.text', '฿24,950.00')
      card('PAYMENTS RECEIVED').should('contain.text', '฿15,250.00')

      // จัดกลุ่มตามเดือนแล้วยอดคงเหลือของแต่ละเดือนกลับมาแสดงได้ เพราะไม่ได้บวกข้ามกัน
      cy.findByRole('button', { name: 'Group by Month' }).click()
      summary().should('not.contain.text', 'Select one month')
      summary().findAllByRole('row').should('have.length', 3) // หัวตาราง + 2 เดือน
      summary().contains('tr', lastMonth).should('contain.text', '฿9,700.00')

      // เลือกเดือนเดียวแล้วการ์ดกลับมาแสดงตัวเลข
      cy.get('#report-period').select(lastMonth, { force: true })
      card('CLOSING BALANCE').should('contain.text', '฿9,700.00')
    })
  })
})
