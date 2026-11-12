// Summary calculations and CSV contents come from the report API.
describe('paymentReports (mock-api)', () => {
  function openReports() {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()
    cy.findByRole('button', { name: 'Summary reports tab' }).click()
    cy.findByRole('heading', { name: 'Summary by unit' }).should('be.visible')
  }

  it('E2E-PAYMENT-004: Groups live report data by unit, tenant and month', () => {
    openReports()
    cy.findByRole('table').should('contain.text', 'Unit 102')
    cy.findByRole('button', { name: 'Group by Tenant' }).click()
    cy.findByRole('heading', { name: 'Summary by tenant' }).should('be.visible')
    cy.findByRole('table').should('contain.text', 'Yuki Tanaka')
    cy.findByRole('button', { name: 'Group by Month' }).click()
    cy.findByRole('heading', { name: 'Summary by month' }).should('be.visible')
    cy.findByRole('button', { name: 'Export report' }).should('be.enabled')
  })

  it('E2E-PAYMENT-005: An invalid range hides stale data and a valid range clears the error', () => {
    openReports()
    cy.get('#report-from').type('2099-01', { force: true })
    cy.findByRole('alert').should('contain.text', 'from not after to')
    cy.findByRole('table').should('not.exist')
    cy.get('#report-from').type('2026-01', { force: true })
    cy.findByRole('heading', { name: 'Summary by unit' }).should('be.visible')
    cy.findByRole('alert').should('not.exist')
  })

  it('E2E-PAYMENT-006: Exports one server CSV for the selected grouping', () => {
    openReports()
    cy.findByRole('button', { name: 'Group by Tenant' }).click()
    cy.findByRole('heading', { name: 'Summary by tenant' }).should('be.visible')
    cy.findByRole('button', { name: 'Export report' }).click()
    cy.contains('Report exported by tenant with current filters').should('be.visible')
  })
})
