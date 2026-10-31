/*
  SSK-171 ติดตามสต็อกและเตือนของใกล้หมด เกณฑ์ใกล้หมดคือ stock <= minStock
  คลังตัวอย่าง: Copper Pipe Fittings 85 ชิ้น (ขั้นต่ำ 30) · Air Filters 8 ชิ้น (ขั้นต่ำ 20 ใกล้หมดอยู่แล้ว)
  เบิก Copper 55 ชิ้นเหลือ 30 เท่ากับขั้นต่ำพอดี ต้องขึ้นเป็นใกล้หมดตาม AC ข้อแรก
*/
describe('supplyAlerts (mock-api)', () => {
  it('E2E-MAINT-006: Withdrawing supplies down to the minimum raises the alert, and restocking clears it', () => {
    cy.signIn()

    cy.findByRole('button', { name: 'Create Maintenance' }).click()
    const createDialog = () => cy.findByRole('dialog', { name: 'Create Maintenance' })
    createDialog().findByRole('button', { name: '105' }).click()
    createDialog().findByLabelText('Maintenance Type').select('Plumbing')
    createDialog().findByLabelText('Supply Item').select('Copper Pipe Fittings · 85 left')
    createDialog().findByLabelText('Quantity Used').clear().type('55')
    createDialog().findByRole('button', { name: 'Add' }).click()
    createDialog().findByRole('button', { name: /Save Maintenance/ }).click()
    createDialog().should('not.exist')

    // ตัวนับที่เมนูโหลดใหม่ทุกครั้งที่เปลี่ยนหน้า
    cy.findByRole('link', { name: 'Maintenance' }).click()
    cy.findByRole('link', { name: 'Maintenance' }).find('[data-testid=low-stock-count]').should('have.text', '2')
    cy.findByRole('button', { name: 'Supplies & Inventory' }).click()
    const banner = () => cy.findByRole('status', { name: 'Low stock alert' })
    banner().should('contain.text', '2 items need restocking')
    cy.findByRole('row', { name: /Copper Pipe Fittings/ }).should('contain.text', '30').and('contain.text', 'Low Stock')

    cy.findByRole('button', { name: 'Stock history for Copper Pipe Fittings' }).click()
    cy.findByRole('dialog').within(() => {
      cy.findByRole('row', { name: /Used in repair/ }).should('contain.text', '-55').and('contain.text', '30')
      cy.findByRole('button', { name: 'Close' }).click()
    })

    banner().findByRole('button', { name: 'Quick restock Copper Pipe Fittings' }).click()
    cy.findByRole('dialog').within(() => {
      cy.findByLabelText('Amount to add').clear().type('10')
      cy.findByRole('button', { name: 'Restock' }).click()
    })
    cy.findByRole('dialog').should('not.exist')
    banner().should('contain.text', '1 item needs restocking')
    cy.findByRole('row', { name: /Copper Pipe Fittings/ }).should('contain.text', 'In Stock')
  })
})
