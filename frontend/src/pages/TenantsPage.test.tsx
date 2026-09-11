import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import TenantsPage from './TenantsPage'

/**
 * Tests the tenant directory for US-07 and the Figma UI.
 */

async function renderTenants() {
  render(<TenantsPage />)
  await screen.findByText('Yuki Tanaka')
}

/** Reads tenant names from the first column of all currently visible rows. */
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
  it('filters by name while typing without requiring a search button', async () => {
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

  it('shows an empty state when no tenant matches the search', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.type(screen.getByLabelText('Search tenants by name or unit'), 'no such tenant name')

    expect(await screen.findByText('No tenants match your search')).toBeInTheDocument()
  })
})

describe('US-07-S2 filter by lease status', () => {
  it('shows only tenants with active leases after clicking Active', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Active' }))

    await waitFor(() => {
      // Arisa only has ended leases, so she must disappear from the list.
      expect(screen.queryByText('Arisa Fujimoto')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
  })

  it('shows only tenants with ended leases after clicking Ended', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Ended' }))

    await waitFor(() => {
      expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Arisa Fujimoto')).toBeInTheDocument()
  })

  it('excludes tenants without leases from both Active and Ended filters', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // Haruto is in the system but has no lease.
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

  it('restores all tenants after returning to All Status', async () => {
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

describe('columns derived from leases and rooms', () => {
  it('shows room number, room type, and rent for Single/Double Bedroom rooms', async () => {
    await renderTenants()

    const row = screen.getByText('Yuki Tanaka').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText(/102/)).toBeInTheDocument()
    expect(within(row!).getByText('Double Bedroom')).toBeInTheDocument()
    expect(within(row!).getByText('45,000')).toBeInTheDocument()
  })

  it('shows No lease for tenants without a lease', async () => {
    await renderTenants()

    const row = screen.getByText('Haruto Watanabe').closest('tr')
    expect(within(row!).getByText('No lease')).toBeInTheDocument()
  })
})

describe('action column and dialogs', () => {
  it('opens Edit Tenant Information from the Edit action', async () => {
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

  it('opens Confirm Delete Tenant Information from the Delete action', async () => {
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
    await user.click(within(dialog).getByRole('button', { name: /Add Unit/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Mika Sato')).toBeInTheDocument()
  })

  it('S1 saves without a national ID because it is optional', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/i }))
    const dialog = await screen.findByRole('dialog', { name: /Tenant Information/i })
    await user.type(within(dialog).getByLabelText(/Full name/i), 'Sora Kimura')
    await user.type(within(dialog).getByLabelText(/Phone number/i), '089-333-4444')
    await user.click(within(dialog).getByRole('button', { name: /Add Unit/i }))

    expect(await screen.findByText('Sora Kimura')).toBeInTheDocument()
  })

  it('S2 warns and does not save when the full name is missing', async () => {
    const user = userEvent.setup()
    await renderTenants()
    const before = visibleTenantNames().length

    await user.click(screen.getByRole('button', { name: /Add New Tenant/i }))
    const dialog = await screen.findByRole('dialog', { name: /Tenant Information/i })
    await user.type(within(dialog).getByLabelText(/Phone number/i), '089-555-6666')
    await user.click(within(dialog).getByRole('button', { name: /Add Unit/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter the full name')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Cancel/i }))
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(before)
    })
  })

  it('shows email under the tenant name because documents are sent there', async () => {
    await renderTenants()
    const row = screen.getByText('Yuki Tanaka').closest('tr')
    expect(within(row!).getByText('yuki.t@example.com')).toBeInTheDocument()
  })
})
