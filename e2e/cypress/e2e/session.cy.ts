describe('session (mock-api)', () => {
  it('E2E-LOGOUT-001: Logging out returns to the Login page', () => {
    cy.signIn()

    cy.findByRole('button', { name: 'Log out' }).click()
    cy.findByText('Are you sure you want to logout?').should('be.visible')
    cy.findByRole('button', { name: 'CONFIRM' }).click()

    cy.location('pathname').should('eq', '/login')
    cy.findByRole('button', { name: 'Sign In' }).should('be.visible')
  })

  it('E2E-LOGOUT-002: Clicking CANCEL on the logout popup stays on the current page', () => {
    cy.signIn()

    cy.findByRole('button', { name: 'Log out' }).click()
    cy.findByRole('button', { name: 'CANCEL' }).click()

    cy.findByText('Are you sure you want to logout?').should('not.exist')
    cy.location('pathname').should('eq', '/')
  })
})
