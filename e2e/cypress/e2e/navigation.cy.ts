const PAGES = [
  { link: 'Units', heading: 'Unit Management' },
  { link: 'Tenants', heading: 'Tenant Directory' },
  { link: 'Payments', heading: 'Payment Management' },
  { link: 'Maintenance', heading: 'Maintenance Management' },
  { link: 'Contracts', heading: 'Contract Management' },
  { link: 'Appliances', heading: 'Appliance Rental' },
  { link: 'Dashboard', heading: 'Room Availability' },
]

describe('navigation (mock-api)', () => {
  it('E2E-NAV-001: Sidebar menu navigates to every page and each page shows its own heading', () => {
    cy.signIn()

    for (const { link, heading } of PAGES) {
      cy.findByRole('link', { name: link }).click()
      cy.findByRole('heading', { name: heading, level: 1 }).should('be.visible')
    }
  })
})
