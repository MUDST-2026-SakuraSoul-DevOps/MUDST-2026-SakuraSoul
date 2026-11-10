/*
  SSK-170 รายงานสรุป (PH2-11)

  แท็บนี้มีตัวจัดกลุ่มสามแบบกับตัวกรองสามช่อง แต่เทสเดิมมีเคสเดียวที่แค่เรนเดอร์แท็บ
  ยังไม่มีใครกดสลับกลุ่มหรือกรองจริง เส้นทางนี้จึงกดครบทั้งสามกลุ่ม กรองจนไม่เหลือ
  ข้อมูล และเลือกทุกเดือนเพื่อดูว่ารายงานปฏิเสธการบวกยอดคงเหลือข้ามเดือนจริงไหม

  ครอบ S3 (มุมมองตามเดือน) และ S4 (ช่วงที่ไม่มีข้อมูลต้องบอกว่าไม่มี ไม่ใช่โชว์ศูนย์)

  ข้อมูลที่ใช้เป็นชุดตัวอย่างคงที่ใน INITIAL_REPORT_ROWS ไม่ได้อ่านจากใบแจ้งหนี้จริง
  ซึ่งหน้าเว็บเขียนบอกไว้เองท้ายแท็บ เพราะงั้น S1 และ S5 ที่ขอให้ยอดตรงกับใบเสร็จจริง
  ยังพิสูจน์ไม่ได้จากที่นี่ ต้องรอให้รายงานต่อกับข้อมูลจริงก่อน

  เดินด้วยเมนูด้านข้างตลอด ไม่ cy.visit เพราะ backend จำลองเก็บข้อมูลใน memory
*/
describe('paymentReports (mock-api)', () => {
  function openReports() {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()
    cy.findByRole('button', { name: 'Summary reports tab' }).click()
  }

  const summary = () => cy.findByRole('table')

  it('E2E-PAYMENT-004: Switching the grouping recomputes the same money under a different key', () => {
    openReports()

    // ตั้งต้นคือ Nov 2026 ทุกห้อง ทุกคน จัดกลุ่มตามห้อง
    cy.findByText('Summary by unit').should('be.visible')
    summary().should('contain.text', 'Unit 101').and('contain.text', 'Unit 202')
    summary().findAllByRole('row').should('have.length', 5) // หัวตาราง + 4 ห้อง

    // ยอดรวมของเดือนนั้นคิดจากสี่ห้องรวมกัน
    cy.findByText('฿22,560.00').should('be.visible')
    cy.findByText('฿8,450.00').should('be.visible')
    cy.findByText('฿17,645.00').should('be.visible')

    // S3 จัดกลุ่มตามผู้เช่า เงินก้อนเดิมแต่เปลี่ยนคีย์ ไม่ใช่คิดใหม่คนละสูตร
    cy.findByRole('button', { name: 'Group by Tenant' }).click()
    cy.findByText('Summary by tenant').should('be.visible')
    summary().should('contain.text', 'Kant S.').and('contain.text', 'Pim W.')
    summary().should('not.contain.text', 'Unit 101')
    cy.findByText('฿22,560.00').should('be.visible')

    // S3 จัดกลุ่มตามเดือน เดือนเดียวจึงเหลือแถวเดียว
    cy.findByRole('button', { name: 'Group by Month' }).click()
    cy.findByText('Summary by month').should('be.visible')
    summary().findAllByRole('row').should('have.length', 2)
    summary().should('contain.text', 'Nov 2026')
  })

  it('E2E-PAYMENT-005: Filters that match nothing say so instead of showing a table of zeros', () => {
    openReports()

    // ห้อง 101 เป็นของ Kant S. การเลือกคู่กับ Mali P. จึงไม่มีทางมีข้อมูล
    cy.get('#report-unit').select('101', { force: true })
    cy.get('#report-tenant').select('Mali P.', { force: true })

    cy.findByText('No summary data matches the selected filters.').should('be.visible')
    // ศูนย์บาทแปลว่าเก็บได้ศูนย์ ซึ่งคนละเรื่องกับไม่มีข้อมูลเลย
    summary().should('not.contain.text', '฿0.00')

    // คลายตัวกรองแล้วข้อมูลต้องกลับมา
    cy.get('#report-tenant').select('Kant S.', { force: true })
    cy.findByText('No summary data matches the selected filters.').should('not.exist')
    summary().should('contain.text', 'Unit 101')
  })

  it('E2E-PAYMENT-006: Choosing every month refuses to add closing balances together', () => {
    openReports()

    cy.get('#report-period').select('All months', { force: true })

    // ยอดที่บวกข้ามเดือนได้ยังบวกให้ 22,560 + 4,900 และ 8,450 + 2,900
    cy.findByText('฿27,460.00').should('be.visible')
    cy.findByText('฿11,350.00').should('be.visible')

    // ส่วนยอดคงเหลือเป็น snapshot ของแต่ละเดือน บวกกันไม่ได้ การ์ดจึงไม่ยอมโชว์ตัวเลข
    cy.findByText('By period below').should('be.visible')
    summary().findAllByText('Select one month').should('have.length.at.least', 1)

    // พอจัดกลุ่มตามเดือนแล้วยอดคงเหลือของแต่ละเดือนกลับมาแสดงได้ เพราะไม่ได้บวกข้ามกัน
    cy.findByRole('button', { name: 'Group by Month' }).click()
    summary().should('not.contain.text', 'Select one month')
    summary().should('contain.text', 'Nov 2026').and('contain.text', 'Oct 2026')
    summary().should('contain.text', '฿17,645.00').and('contain.text', '฿2,000.00')
  })
})
