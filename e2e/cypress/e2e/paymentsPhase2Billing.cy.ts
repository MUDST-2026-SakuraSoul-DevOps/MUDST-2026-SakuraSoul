describe('paymentsPhase2Billing (mock-api)', () => {
  function openSettings() {
    cy.findByRole('button', { name: 'Billing Settings' }).click()
    cy.findByRole('dialog', { name: 'Billing Settings' }).findByLabelText('Bank name').should('exist')
  }
  beforeEach(() => {
    cy.signIn()
    cy.findByRole('link', { name: 'Payments' }).click()
  })

  it('E2E-PAYMENT-009: An invoice with no bank snapshot has no invented account or QR', () => {
    cy.findByRole('button', { name: 'View receipt for Kenji Sato' }).click()
    const dialog = () => cy.findByRole('dialog')
    dialog().should('not.contain.text', 'Bank transfer / PromptPay')
    dialog().should('not.contain.text', 'Kasikornbank')
    dialog().findByAltText('PromptPay QR').should('not.exist')
  })

  it('E2E-PAYMENT-010: Only a new invoice uses the configured bank and server QR', () => {
    openSettings()
    cy.findByRole('dialog', { name: 'Billing Settings' }).within(() => {
      cy.findByLabelText('Bank name').type('QA Bank')
      cy.findByLabelText('Account name').type('QA Apartment')
      cy.findByLabelText('Account number').type('1234567890')
      cy.findByLabelText('PromptPay ID').type('0812345678')
      cy.findByRole('button', { name: 'Save Settings' }).click()
    })
    cy.findByRole('dialog', { name: 'Billing Settings' }).should('not.exist')
    cy.findByRole('button', { name: 'New Invoice' }).click()
    const draft = () => cy.findByRole('dialog')
    draft().find('#payment-room').clear().type('207')
    draft().findByRole('heading', { name: 'Create Payment' }).click()
    draft().find('#electric-usage').clear().type('100')
    draft().find('#water-usage').clear().type('10')
    draft().findByRole('button', { name: 'Create Bill' }).click()
    draft().should('not.exist')
    cy.findByRole('button', { name: 'View receipt for Hiroshi Nakamura' }).click()
    cy.findByRole('dialog').findByAltText('PromptPay QR').should('be.visible')
    cy.findByRole('dialog').should('contain.text', 'QA Bank')
  })

  it('E2E-PAYMENT-011: Interest outside 0 to 100 cannot be saved', () => {
    openSettings()
    cy.findByRole('dialog', { name: 'Billing Settings' }).within(() => {
      cy.findByLabelText('Apply interest to overdue principal').check()
      cy.findByLabelText('Interest per month (%)').clear().type('-1')
      cy.findByRole('button', { name: 'Save Settings' }).click()
      cy.findByRole('alert').should('contain.text', 'Interest rate cannot be negative')
      cy.findByLabelText('Interest per month (%)').clear().type('101')
      cy.findByRole('button', { name: 'Save Settings' }).click()
      cy.findByRole('alert').should('contain.text', 'Interest rate cannot exceed 100%')
    })
  })

  it('E2E-PAYMENT-012: Saved interest settings are loaded from the server on reopening', () => {
    openSettings()
    cy.findByRole('dialog', { name: 'Billing Settings' }).within(() => {
      cy.findByLabelText('Apply interest to overdue principal').check()
      cy.findByLabelText('Interest per month (%)').clear().type('2')
      cy.findByLabelText('Grace days').clear().type('3')
      cy.findByRole('button', { name: 'Save Settings' }).click()
    })
    cy.findByRole('dialog', { name: 'Billing Settings' }).should('not.exist')
    openSettings()
    cy.findByRole('dialog', { name: 'Billing Settings' }).within(() => {
      cy.findByLabelText('Interest per month (%)').should('have.value', '2')
      cy.findByLabelText('Grace days').should('have.value', '3')
    })
  })
})
