/*
  SSK-131 งานซ่อมเดินครบวงจากหน้าจอจริง เดิมปุ่ม Save Maintenance บน Dashboard ปิดป็อปอัป
  โดยไม่บันทึกอะไร และแท็บ Maintenance Tasks เป็นข้อมูลตัวอย่างในโค้ด สองที่นี้จึงไม่เคยเห็นกัน

  เดินด้วยเมนูด้านข้างตลอด ไม่ใช้ cy.visit เพราะ backend จำลองเก็บข้อมูลใน memory
  โหลดหน้าใหม่เมื่อไหร่ใบที่เพิ่งสร้างจะหายไปด้วย
*/
describe('maintenanceTasks (mock-api)', () => {
  it('E2E-MAINT-003: A ticket created on the Dashboard closes the room and can be finished from Maintenance Tasks', () => {
    cy.signIn()

    cy.findByRole('button', { name: 'Create Maintenance' }).click()
    const createDialog = () => cy.findByRole('dialog', { name: 'Create Maintenance' })
    createDialog().findByRole('button', { name: '105' }).click()
    createDialog().findByLabelText('Maintenance Type').select('Electrical')
    createDialog().findByRole('radio', { name: /Out of Service/ }).click()
    createDialog().findByLabelText('Additional Notes').clear().type('Socket sparks when a plug goes in')
    createDialog().findByRole('button', { name: /Save Maintenance/ }).click()
    createDialog().should('not.exist')

    // การ์ดห้องขึ้นทั้งสถานะปิดซ่อมและชื่องาน (ประเภทงานเป็นชื่องานของใบที่สร้างจาก Dashboard)
    const room = () => cy.findByLabelText('Unit 105')
    room().should('contain.text', 'Maintenance')
    room().should('contain.text', 'Electrical')

    cy.findByRole('link', { name: 'Maintenance' }).click()
    const taskRow = () => cy.findByRole('row', { name: /Socket sparks/ })
    taskRow().should('contain.text', '105')
    taskRow().should('contain.text', 'Wait for Assign')

    cy.findByRole('button', { name: 'Edit task Electrical' }).click()
    const editDialog = () => cy.findByRole('dialog', { name: 'Edit Maintenance Task' })
    editDialog().findByLabelText('Status').select('DONE')
    editDialog().findByRole('button', { name: 'Confirm' }).click()
    editDialog().should('not.exist')
    taskRow().should('contain.text', 'Done')

    cy.findByRole('button', { name: 'Maintenance Log' }).click()
    cy.findByRole('row', { name: /Socket sparks/ }).should('contain.text', 'Completed')
  })

  /*
    ลบได้เฉพาะใบ Open ที่แอดมินเปิดเอง ใบที่เริ่มทำแล้วเป็นประวัติงานซ่อม ต้องเห็นเหตุผลจาก
    backend ในป็อปอัป ไม่ใช่ปิดเงียบ ๆ จนเข้าใจว่าลบไปแล้ว
  */
  it('E2E-MAINT-004: Only an open task can be deleted and an in-progress task explains why it stays', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Maintenance' }).click()

    cy.findByRole('button', { name: 'Delete task AC compressor replacement' }).click()
    const blocked = () => cy.findByRole('dialog', { name: 'Delete Maintenance Task' })
    blocked().findByRole('button', { name: 'Delete task' }).click()
    blocked().findByRole('alert').should('contain.text', 'in progress and cannot be deleted')
    blocked().findByRole('button', { name: 'Cancel' }).click()
    blocked().should('not.exist')
    cy.findByRole('row', { name: /AC compressor replacement/ }).should('be.visible')

    cy.findByRole('button', { name: 'Delete task Bathroom tap dripping' }).click()
    const allowed = () => cy.findByRole('dialog', { name: 'Delete Maintenance Task' })
    allowed().findByRole('button', { name: 'Delete task' }).click()
    allowed().should('not.exist')
    cy.findByRole('row', { name: /Bathroom tap dripping/ }).should('not.exist')
  })

  /*
    SSK-154 โจทย์ขอ "Track maintenance tasks and supply usage" เบิกของได้ทั้งตอนสร้างใบบน Dashboard
    และเบิกเพิ่มจากรายละเอียดใบ แล้วยอดในแท็บ Supplies ต้องลดลงจริง ไม่ใช่แค่ขึ้นรายการในป็อปอัป
    คลังตัวอย่าง LED Bulbs 60W 145 ชิ้น Copper Pipe Fittings 85 ชิ้น
  */
  it('E2E-MAINT-005: Supplies withdrawn for a ticket show on the ticket and come off the inventory', () => {
    cy.signIn()

    cy.findByRole('button', { name: 'Create Maintenance' }).click()
    const createDialog = () => cy.findByRole('dialog', { name: 'Create Maintenance' })
    createDialog().findByRole('button', { name: '105' }).click()
    createDialog().findByLabelText('Maintenance Type').select('Electrical')
    createDialog().findByLabelText('Supply Item').select('LED Bulbs 60W · 145 left')
    createDialog().findByLabelText('Quantity Used').clear().type('2')
    createDialog().findByRole('button', { name: 'Add' }).click()
    createDialog().findByRole('list', { name: 'Supplies to withdraw' }).should('contain.text', 'LED Bulbs 60W × 2')
    createDialog().findByRole('button', { name: /Save Maintenance/ }).click()
    createDialog().should('not.exist')

    cy.findByRole('link', { name: 'Maintenance' }).click()
    cy.findByRole('button', { name: 'View task Electrical' }).click()
    const detail = () => cy.findByRole('dialog')
    detail().should('contain.text', 'LED Bulbs 60W × 2')

    detail().findByRole('button', { name: 'Add Supply' }).click()
    detail().findByLabelText('Supply Item').select('Copper Pipe Fittings · 85 left')
    detail().findByLabelText('Quantity Used').clear().type('1')
    detail().findByRole('button', { name: 'Withdraw' }).click()
    detail().should('contain.text', 'Copper Pipe Fittings × 1')
    detail().findByRole('button', { name: 'Close' }).click()

    cy.findByRole('button', { name: 'Supplies & Inventory' }).click()
    cy.findByRole('row', { name: /LED Bulbs 60W/ }).should('contain.text', '143')
    cy.findByRole('row', { name: /Copper Pipe Fittings/ }).should('contain.text', '84')
  })
})
