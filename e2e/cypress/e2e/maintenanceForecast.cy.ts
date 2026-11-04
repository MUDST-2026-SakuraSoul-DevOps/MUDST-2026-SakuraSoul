/*
  SSK-173 (โบนัส) แนะนำรอบซ่อมครั้งถัดไป ต้องมีงานประเภทเดียวกันของห้องเดียวกันปิดแล้วอย่างน้อย 3 ครั้ง
  API ตั้งวันปิดงานเป็นเวลาที่กดปิดเสมอ จึงใช้ cy.clock เลื่อนนาฬิกาของเบราว์เซอร์ไปปิดงานห่างกันครั้งละ 30 วัน
  (คุมเฉพาะ Date ตัวจับเวลาของหน้ายังเดินตามจริง) ไม่ต้องเพิ่มทางลัดสำหรับเทสในโค้ดของแอป
*/
const DAY = 86_400_000

function daysAgo(n: number): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n, 3))
}

function closeElectricalJob(note: string) {
  cy.findByRole('link', { name: 'Dashboard' }).click()
  cy.findByRole('button', { name: 'Create Maintenance' }).click()
  const createDialog = () => cy.findByRole('dialog', { name: 'Create Maintenance' })
  createDialog().findByRole('button', { name: '105' }).click()
  createDialog().findByLabelText('Maintenance Type').select('Electrical')
  createDialog().findByLabelText('Additional Notes').clear().type(note)
  createDialog().findByRole('button', { name: /Save Maintenance/ }).click()
  createDialog().should('not.exist')

  cy.findByRole('link', { name: 'Maintenance' }).click()
  cy.findByRole('row', { name: new RegExp(note) }).within(() => {
    cy.findByRole('button', { name: 'Edit task Electrical' }).click()
  })
  const editDialog = () => cy.findByRole('dialog', { name: 'Edit Maintenance Task' })
  editDialog().findByLabelText('Status').select('DONE')
  editDialog().findByRole('button', { name: 'Confirm' }).click()
  editDialog().should('not.exist')
  cy.findByRole('row', { name: new RegExp(note) }).should('contain.text', 'Done')
}

describe('maintenanceForecast (mock-api)', () => {
  it('E2E-MAINT-007: Three closed jobs 30 days apart give a high-confidence suggestion that becomes a reminder on confirm', () => {
    cy.clock(daysAgo(90), ['Date'])
    cy.signIn()
    closeElectricalJob('Fan check one')
    cy.clock().then((clock) => clock.setSystemTime(daysAgo(60)))
    closeElectricalJob('Fan check two')
    cy.clock().then((clock) => clock.setSystemTime(daysAgo(30)))
    closeElectricalJob('Fan check three')
    cy.clock().then((clock) => clock.setSystemTime(new Date(daysAgo(0).getTime() + DAY / 4)))

    cy.findByRole('link', { name: 'Dashboard' }).click()
    cy.findByRole('link', { name: 'Maintenance' }).click()
    cy.findByRole('button', { name: 'Schedule & Reminder' }).click()
    cy.findByRole('region', { name: 'Suggested maintenance' }).within(() => {
      cy.findByRole('row', { name: /Electrical · Unit 105/ })
        .should('contain.text', '30 days')
        .and('contain.text', 'High confidence · 3 jobs')
        .and('contain.text', 'Due soon')
        .within(() => {
          cy.findByRole('button', { name: 'Create reminder from suggestion for Electrical in unit 105' }).click()
        })
    })
    const reminder = () => cy.findByRole('dialog', { name: 'Add Reminder' })
    reminder().findByLabelText(/Reminder Name/).should('have.value', 'Electrical service · Unit 105')
    reminder().findByRole('button', { name: 'Save Reminder' }).click()
    reminder().should('not.exist')
    cy.findByText('Electrical service · Unit 105').should('be.visible')
  })
})
