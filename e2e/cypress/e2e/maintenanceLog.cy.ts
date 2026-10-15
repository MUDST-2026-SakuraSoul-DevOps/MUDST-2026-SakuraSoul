/*
  feedback อาจารย์ 13 ก.ย. ข้อ 8: Maintenance Log ต้องกดเข้าไปดูรายละเอียดแต่ละรายการได้ (E2E)

  ใบแจ้งซ่อมห้อง 206 มาจากข้อมูลตั้งต้นของ backend จำลอง (mockApi.ts) มีช่างรับงานแล้ว
  จึงเช็คได้ครบทั้งผู้รับงาน ผู้แจ้ง และรายละเอียด
*/
const TICKET = {
  title: 'Bathroom drain pipe leaking',
  detail: 'Water seeping into the ceiling below. Waiting on the plumber to lift the tiles.',
  unit: '206',
  assignedTo: 'Mei Lin',
  reportedBy: 'David W.',
}

function openMaintenanceLog() {
  cy.signIn()
  cy.findByRole('link', { name: 'Maintenance' }).click()
  cy.findByRole('button', { name: 'Maintenance Log' }).click()
  cy.findByRole('heading', { name: 'Maintenance Log History' }).should('be.visible')
}

describe('maintenanceLog (mock-api)', () => {
  it('E2E-MAINT-001: Clicking a row in Maintenance Log opens that ticket\'s details', () => {
    openMaintenanceLog()

    // กดที่ช่องเลขห้องของแถว ไม่ใช่ที่ชื่องาน เพื่อพิสูจน์ว่ากดตรงไหนของแถวก็เปิดได้
    const row = () => cy.findByRole('row', { name: new RegExp(TICKET.title) })
    row().findByRole('cell', { name: TICKET.unit }).click()

    const dialog = () => cy.findByRole('dialog', { name: TICKET.title })
    dialog().should('be.visible')
    dialog().should('contain.text', 'Maintenance log details')
    dialog().should('contain.text', TICKET.detail)
    dialog().should('contain.text', TICKET.unit)
    dialog().should('contain.text', TICKET.assignedTo)
    dialog().should('contain.text', TICKET.reportedBy)

    dialog().findByRole('button', { name: 'Close' }).click()
    dialog().should('not.exist')
  })

  it('E2E-MAINT-002: Keyboard users open the details from the ticket title and close with Escape', () => {
    openMaintenanceLog()

    /*
      ปุ่มนี้มีแค่ onClick ผู้ใช้คีย์บอร์ดเปิดได้เพราะเบราว์เซอร์แปลง Enter บนปุ่มที่โฟกัสอยู่เป็นการคลิกเอง
      จึงต้องส่งแป้นพิมพ์จริงผ่าน Chrome (realPress) ถ้าจำลองแค่ event ใน JavaScript ปุ่มจะไม่ทำงาน
    */
    cy.findByRole('button', { name: `View log ${TICKET.title}` }).focus()
    cy.realPress('Enter')

    const dialog = () => cy.findByRole('dialog', { name: TICKET.title })
    dialog().should('be.visible')
    dialog().should('contain.text', TICKET.detail)

    cy.realPress('Escape')
    dialog().should('not.exist')
  })
})
