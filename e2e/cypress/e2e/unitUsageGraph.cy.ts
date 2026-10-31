/*
  SSK-167 กราฟการใช้น้ำไฟ backend จำลองมีหน่วยตัวอย่าง 24 เดือนย้อนหลังของทุกห้อง
  ค่าตั้งต้นคือไฟ ชั้น 1 รายเดือน 12 เดือนที่ผ่านมา สลับเป็นน้ำ ทั้งอาคาร รายปีแล้ว
  จุดบนกราฟต้องเท่ากับจำนวนแถวในตารางข้อมูลชุดเดียวกันเสมอ
*/
describe('unitUsageGraph (mock-api)', () => {
  it('E2E-UNITS-005: The usage graph and its data table follow the utility, scope and period filters', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Units' }).click()
    cy.findByRole('link', { name: 'Water & Electricity' }).click()

    cy.findByRole('img', { name: /Electricity usage for Floor 1/ }).find('circle').should('have.length', 12)
    cy.findByText('Electricity usage').parent().should('contain.text', 'kWh')

    cy.findByRole('button', { name: 'Water' }).click()
    cy.findByLabelText('View').select('Whole building')
    cy.findByLabelText('Period').select('Yearly')
    // 12 เดือนที่ผ่านมาคร่อมปีได้ไม่เกินสองปี รอให้กราฟเปลี่ยนเป็นรายปีก่อนค่อยนับจุด
    cy.findByRole('img', { name: /Water usage for Whole building/ })
      .find('circle')
      .should('have.length.within', 1, 2)
      .its('length')
      .then((points) => {
        cy.findByText('View usage data table').click()
        cy.findByText('View usage data table')
          .closest('details')
          .within(() => {
            cy.findByRole('columnheader', { name: 'WATER (m³)' }).should('be.visible')
            // แถวข้อมูล = แถวทั้งหมดลบแถวหัวตาราง
            cy.findAllByRole('row').should('have.length', points + 1)
          })
      })
  })
})
