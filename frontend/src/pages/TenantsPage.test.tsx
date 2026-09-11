import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import TenantsPage from './TenantsPage'

/**
 * Covers the tenant list page for US-07 and the Figma UI.
 */

async function renderTenants() {
  render(<TenantsPage />)
  await screen.findByText('Yuki Tanaka')
}

/** Reads tenant names from the first column of the currently visible rows. */
function visibleTenantNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '')
}

beforeEach(() => {
  resetMockStore()
})

describe('US-07-S1 real-time search', () => {
  it('filters tenants by name without pressing a search button', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('Search tenants by name or unit'), 'Kenji')

    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('Kenji Sato')
  })

  it('finds tenants by room number', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('Search tenants by name or unit'), '207')

    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('Hiroshi Nakamura')
  })

  it('shows an empty-search message instead of leaving the table blank', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('Search tenants by name or unit'), 'no such tenant name')

    expect(await screen.findByText('No tenants match your search')).toBeInTheDocument()
  })
})

describe('US-07-S2 lease status filters', () => {
  it('shows only active tenants after selecting Active', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Active' }))

    await waitFor(() => {
      // Arisa only has an ended lease, so she must not appear in the Active list.
      expect(screen.queryByText('Arisa Fujimoto')).not.toBeInTheDocument()
      // Kenji has a pending lease, so he must not appear in the Active list.
      expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Aiko Tanaka')).toBeInTheDocument()
  })

  it('shows only tenants with ended leases after selecting Ended', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Ended' }))

    await waitFor(() => {
      expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Arisa Fujimoto')).toBeInTheDocument()
  })

  it('excludes tenants with no lease from both Active and Ended filters', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // Haruto exists in the tenant directory but has no lease.
    expect(screen.getByText('Haruto Watanabe')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Active' }))
    await waitFor(() => {
      expect(screen.queryByText('Haruto Watanabe')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Ended' }))
    await waitFor(() => {
      expect(screen.queryByText('Haruto Watanabe')).not.toBeInTheDocument()
    })
  })

  it('shows all tenants again after returning to All Status', async () => {
    const user = userEvent.setup()
    await renderTenants()
    const total = visibleTenantNames().length

    await user.click(screen.getByRole('button', { name: 'Active' }))
    await waitFor(() => {
      expect(visibleTenantNames().length).toBeLessThan(total)
    })

    await user.click(screen.getByRole('button', { name: 'All Status' }))
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(total)
    })
  })
})

describe('Pagination and empty pages', () => {
  it('shows No data when the selected page has no rows', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: '3' }))
    expect(await screen.findByText('No data')).toBeInTheDocument()
    expect(screen.getByText('Showing 0 tenants')).toBeInTheDocument()
  })
})

describe('Columns derived from leases and rooms', () => {
  it('shows room number, room type, and rent based on Single or Double Bedroom', async () => {
    await renderTenants()

    const row = screen.getByText('Yuki Tanaka').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText(/102/)).toBeInTheDocument()
    expect(within(row!).getByText('Double Bedroom')).toBeInTheDocument()
    expect(within(row!).getByText('45,000')).toBeInTheDocument()
  })

  it('shows No lease for tenants without any lease', async () => {
    await renderTenants()

    const row = screen.getByText('Haruto Watanabe').closest('tr')
    expect(within(row!).getByText('No lease')).toBeInTheDocument()
  })
})

describe('Action column and popups', () => {
  it('opens the Edit Tenant Information popup after clicking Edit', async () => {
    const user = userEvent.setup()
    await renderTenants()

    const editBtn = screen.getByRole('button', { name: 'Edit Yuki Tanaka' })
    await user.click(editBtn)

    const dialog = await screen.findByRole('dialog', { name: /Edit Tenant Information/i })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('Yuki Tanaka')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Confirm/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Cancel/i })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('opens the Confirm Delete Tenant Information popup after clicking Delete', async () => {
    const user = userEvent.setup()
    await renderTenants()

    const deleteBtn = screen.getByRole('button', { name: 'Delete Yuki Tanaka' })
    await user.click(deleteBtn)

    const dialog = await screen.findByRole('dialog', { name: /Confirm Delete Tenant Information/i })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/Are you sure you want to delete/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Confirm Delete/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Cancel/i })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    // Cancel must not remove any tenant from the table.
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })

  it('removes only the selected tenant after confirming delete', async () => {
    const user = userEvent.setup()
    await renderTenants()

    expect(screen.getByText('Haruto Watanabe')).toBeInTheDocument()
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()

    // Use a no-lease tenant until the team defines the rule for deleting active-lease tenants.
    await user.click(screen.getByRole('button', { name: 'Delete Haruto Watanabe' }))
    const dialog = await screen.findByRole('dialog', { name: /Confirm Delete Tenant Information/i })
    await user.click(within(dialog).getByRole('button', { name: /Confirm Delete/i }))

    await waitFor(() => {
      expect(screen.queryByText('Haruto Watanabe')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })
})

describe('US-03 add a new tenant', () => {
  it('S1 saves a complete tenant form and shows the new tenant immediately', async () => {
    const user = userEvent.setup()
    await renderTenants()
    expect(screen.queryByText('Mika Sato')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/i }))
    const dialog = await screen.findByRole('dialog', { name: /Tenant Information/i })

    await user.type(within(dialog).getByLabelText(/Full name/i), 'Mika Sato')
    await user.type(within(dialog).getByLabelText(/Phone number/i), '089-111-2222')
    await user.click(within(dialog).getByRole('button', { name: /Confirm|Add Unit/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Mika Sato')).toBeInTheDocument()
  })

  it('S1 saves the tenant without a National ID because it is optional', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/i }))
    const dialog = await screen.findByRole('dialog', { name: /Tenant Information/i })
    await user.type(within(dialog).getByLabelText(/Full name/i), 'Sora Kimura')
    await user.type(within(dialog).getByLabelText(/Phone number/i), '089-333-4444')
    await user.click(within(dialog).getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await screen.findByText('Sora Kimura')).toBeInTheDocument()
  })

  it('S2 shows a validation error and does not save when the name is missing', async () => {
    const user = userEvent.setup()
    await renderTenants()
    const before = visibleTenantNames().length

    await user.click(screen.getByRole('button', { name: /Add New Tenant/i }))
    const dialog = await screen.findByRole('dialog', { name: /Tenant Information/i })
    await user.type(within(dialog).getByLabelText(/Phone number/i), '089-555-6666')
    await user.click(within(dialog).getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter the full name')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Cancel/i }))
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(before)
    })
  })

  it('shows the email below the tenant name because it is used for tenant documents', async () => {
    await renderTenants()
    const row = screen.getByText('Yuki Tanaka').closest('tr')
    expect(within(row!).getByText('yuki.t@example.com')).toBeInTheDocument()
  })
})

describe('SSK-107 edit tenant information', () => {
  it('opens the Edit Tenant Information popup and saves successfully', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Edit Hiroshi Nakamura' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('heading', { name: 'Edit Tenant Information' })).toBeInTheDocument()
    expect(within(dialog).getByText('Required for issuing the lease contract')).toBeInTheDocument()

    // Check the Start Date and End Date fields.
    expect(within(dialog).getByLabelText('Start Date')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('End Date')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Rent')).not.toBeInTheDocument()

    // Confirm to save the edited tenant.
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
