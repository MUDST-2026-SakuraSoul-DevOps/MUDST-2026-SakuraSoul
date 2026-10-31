/*
  SSK-174 (โบนัส) ค้นหาชื่อผู้เช่าแบบยอมให้พิมพ์ผิด ตัวอย่างของอาจารย์ "krant" ต้องเจอ "Kant"
  เพิ่มผู้เช่าชื่อ Kant ผ่านหน้าจอก่อน เพราะข้อมูลตัวอย่างไม่มีชื่อนี้
*/
describe('tenantSearch (mock-api)', () => {
  it('E2E-TENANT-002: Typing "krant" still finds Kant and labels the result as a similar name', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Tenants' }).click()

    cy.findByRole('button', { name: 'Add New Tenant' }).click()
    const dialog = () => cy.findByRole('dialog')
    dialog().findByLabelText('Full name').clear().type('Kant Srisuk')
    dialog().findByLabelText('Phone number').clear().type('0891234567')
    dialog().findByLabelText('National ID').clear().type('3500100123457')
    dialog().findByRole('button', { name: 'Confirm' }).click()
    dialog().should('not.exist')

    const search = () => cy.findByLabelText('Search tenants by name or unit')
    search().type('krant')
    cy.findByRole('row', { name: /Kant Srisuk/ }).should('contain.text', 'Similar name')
    cy.findByRole('status').should('contain.text', '1 result for “krant”')

    search().clear().type('xyz')
    cy.findByText('No tenants match your search').should('be.visible')
  })
})
