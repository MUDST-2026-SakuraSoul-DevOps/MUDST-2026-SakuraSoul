import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import { createReceipt, fetchLeases, updateTenant } from '../api/client'
import TenantsPage from './TenantsPage'
import { todayInBangkok } from '../format'

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
  it('shows only tenants with a current lease after selecting Active', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Active' }))

    await waitFor(() => {
      // Arisa only has an ended lease, so she must not appear in the Active list.
      expect(screen.queryByText('Arisa Fujimoto')).not.toBeInTheDocument()
    })
    // SSK-136 Hiroshi used to be hidden as "Overdue" purely because of his id.
    expect(screen.getByText('Hiroshi Nakamura')).toBeInTheDocument()
    // SSK-16 Kenji really is overdue now (seeded receipt past its due date), so he is under Overdue.
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()
    expect(screen.getByText('Aiko Tanaka')).toBeInTheDocument()
    // A lease that ends within 30 days is still an active tenant.
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
  })

  it('labels each tenant from real receipts and leases, not from the tenant id (SSK-136, SSK-16)', async () => {
    await renderTenants()

    const pill = (name: string) => within(screen.getByText(name).closest('tr')!).getAllByRole('cell')[5]
    // Kenji's seeded receipt is past its due date.
    expect(pill('Kenji Sato')).toHaveTextContent('Overdue')
    expect(pill('Hiroshi Nakamura')).toHaveTextContent('Active')
    // Yuki paid her only receipt, so her lease decides: it ends in 12 days, the Contracts page rule.
    expect(pill('Yuki Tanaka')).toHaveTextContent('Ending Soon')
    expect(pill('Arisa Fujimoto')).toHaveTextContent('Ended')
    expect(pill('Haruto Watanabe')).toHaveTextContent('No lease')
  })

  it('SSK-16 shows Pending for a tenant with an unpaid receipt that is not due yet', async () => {
    const user = userEvent.setup()
    const hiroshiLease = (await fetchLeases()).find((lease) => lease.tenantName === 'Hiroshi Nakamura')!
    await createReceipt({
      leaseId: hiroshiLease.id,
      billingMonth: todayInBangkok().slice(0, 7),
      electricUnits: 100,
      waterUnits: 10,
    })
    await renderTenants()

    const row = screen.getByText('Hiroshi Nakamura').closest('tr')!
    expect(within(row).getAllByRole('cell')[5]).toHaveTextContent('Pending')

    await user.click(screen.getByRole('button', { name: 'Pending' }))
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('Hiroshi Nakamura')
  })

  it('SSK-16 lists overdue tenants under the Overdue filter', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Overdue' }))
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('Kenji Sato')
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

describe('pagination', () => {
  // SSK-136 the page buttons used to be a fixed [1, 2, 3], so page 3 of six tenants was an empty table.
  it('offers only the pages that exist', async () => {
    await renderTenants()

    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: 'Page 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByText('Showing 1–6 of 6 tenants')).toBeInTheDocument()
  })
})

describe('tenants without an email (optional since 11 Sep)', () => {
  it('can still be searched and shows No email instead of crashing the page', async () => {
    const user = userEvent.setup()
    await updateTenant(2, {
      fullName: 'Kenji Sato',
      phone: '082-345-6789',
      nationalId: '1100400234561',
      email: null,
    })
    await renderTenants()

    const row = screen.getByText('Kenji Sato').closest('tr')!
    expect(within(row).getByText('No email')).toBeInTheDocument()

    // A query that matches nobody's name or unit makes the search read every email, including the null one.
    await user.type(screen.getByLabelText('Search tenants by name or unit'), 'yuki.t@')
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('Yuki Tanaka')
  })
})

describe('columns derived from leases and rooms', () => {
  it('shows room number, room type from the unit, and rent from the lease (SSK-127)', async () => {
    await renderTenants()

    const row = screen.getByText('Yuki Tanaka').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText(/102/)).toBeInTheDocument()
    expect(within(row!).getByText('Double Bedroom')).toBeInTheDocument()
    expect(within(row!).getByText('฿4,500.00')).toBeInTheDocument()
  })

  it('shows No lease for tenants without any lease', async () => {
    await renderTenants()

    const row = screen.getByText('Haruto Watanabe').closest('tr')
    expect(within(row!).getByText('No lease')).toBeInTheDocument()
  })
})

describe('action column and popups', () => {
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

  it('cancels deletion and keeps the tenant in the table', async () => {
    const user = userEvent.setup()
    await renderTenants()

    const deleteBtn = screen.getByRole('button', { name: 'Delete Yuki Tanaka' })
    await user.click(deleteBtn)

    const dialog = await screen.findByRole('dialog', { name: /Confirm Delete Tenant Information/i })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/Are you sure you want to delete/i)).toBeInTheDocument()
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
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
    // A number nobody in the seed has: the mock now answers 409 for a duplicate, like the backend.
    await user.type(within(dialog).getByLabelText(/National ID/i), '3500100123457')
    await user.click(within(dialog).getByRole('button', { name: /Confirm|Add Unit/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Mika Sato')).toBeInTheDocument()
  })

  it('S1 saves the tenant with a Passport number instead of a National ID', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/i }))
    const dialog = await screen.findByRole('dialog', { name: /Tenant Information/i })
    await user.type(within(dialog).getByLabelText(/Full name/i), 'Sora Kimura')
    await user.type(within(dialog).getByLabelText(/Phone number/i), '089-333-4444')
    await user.click(within(dialog).getByRole('radio', { name: /Passport/i }))
    await user.type(within(dialog).getByLabelText(/Passport number/i), 'P12345678')
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
  it('updates the table after editing a tenant name and phone number', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Edit Hiroshi Nakamura' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('heading', { name: 'Edit Tenant Information' })).toBeInTheDocument()
    expect(within(dialog).getByText('Required for issuing the lease contract')).toBeInTheDocument()

    // SSK-136 the lease fields are gone from the tenant form; the email is there and prefilled.
    expect(within(dialog).queryByLabelText('Start Date')).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email')).toHaveValue('hiroshi.n@example.com')
    expect(within(dialog).queryByLabelText('Rent')).not.toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Full name'))
    await user.type(within(dialog).getByLabelText('Full name'), 'Hiroshi Takahashi')
    await user.clear(within(dialog).getByLabelText('Phone number'))
    await user.type(within(dialog).getByLabelText('Phone number'), '0891234567')

    // Confirm, then wait for the dialog to close and the table to reload from the mock API.
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const updatedRow = await screen.findByText('Hiroshi Takahashi').then((name) => name.closest('tr'))
    expect(updatedRow).not.toBeNull()
    expect(within(updatedRow!).getByText('089-123-4567')).toBeInTheDocument()
    expect(screen.queryByText('Hiroshi Nakamura')).not.toBeInTheDocument()
    // The mock replaces the whole tenant like TenantService.update, so the email survives only if the form sent it.
    expect(within(updatedRow!).getByText('hiroshi.n@example.com')).toBeInTheDocument()
  })

  it('does not update the table after canceling an edit', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: 'Edit Hiroshi Nakamura' }))
    const dialog = await screen.findByRole('dialog', { name: /Edit Tenant Information/i })
    await user.clear(within(dialog).getByLabelText('Full name'))
    await user.type(within(dialog).getByLabelText('Full name'), 'Hiroshi Takahashi')

    // Cancel closes the dialog without sending the edited value to the mock API.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Hiroshi Nakamura')).toBeInTheDocument()
    expect(screen.queryByText('Hiroshi Takahashi')).not.toBeInTheDocument()
  })

  /*
    SSK-136 ช่วงสัญญากับประเภทห้องมาจากสัญญาจริงเท่านั้น ผู้เช่าที่ยังไม่มีสัญญาขึ้นขีด
    เดิม Haruto กับผู้เช่าใหม่ขึ้นวันที่ 2026-07-21 – 2026-08-31 ที่ฟอร์มเติมไว้เอง และ backend ไม่เคยเก็บ
  */
  it('แสดง Lease Period และ Room Type จากสัญญาจริงเท่านั้น ผู้เช่าที่ยังไม่มีสัญญาขึ้นขีด', async () => {
    const user = userEvent.setup()
    await renderTenants()

    const harutoCells = within(screen.getByText('Haruto Watanabe').closest('tr')!).getAllByRole('cell')
    expect(harutoCells[2]).toHaveTextContent('-')
    expect(harutoCells[3]).toHaveTextContent('-')
    expect(screen.queryByText('2026-07-21 – 2026-08-31')).not.toBeInTheDocument()

    // สัญญาที่ไม่มีวันจบแสดงว่า Indefinite ไม่ใช่วันที่ปลอม 2027-12-31
    const hiroshiRow = screen.getByText('Hiroshi Nakamura').closest('tr')!
    expect(within(hiroshiRow).getByText(/– Indefinite$/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/i }))
    const dialog = await screen.findByRole('dialog', { name: /Tenant Information/i })
    await user.type(within(dialog).getByLabelText(/Full name/i), 'Pimwipa Jirananthawong')
    await user.type(within(dialog).getByLabelText(/Phone number/i), '093-340-4870')
    await user.type(within(dialog).getByLabelText(/National ID/i), '3500100123457')
    await user.click(within(dialog).getByRole('button', { name: /Confirm|Add Unit/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const pimwipaCells = within((await screen.findByText('Pimwipa Jirananthawong')).closest('tr')!).getAllByRole('cell')
    expect(pimwipaCells[2]).toHaveTextContent('-')
    expect(pimwipaCells[5]).toHaveTextContent('No lease')
  })

  it('shows the national ID duplicate reason from the API instead of adding a second tenant', async () => {
    const user = userEvent.setup()
    await renderTenants()

    await user.click(screen.getByRole('button', { name: /Add New Tenant/i }))
    const dialog = await screen.findByRole('dialog', { name: /Tenant Information/i })
    await user.type(within(dialog).getByLabelText(/Full name/i), 'Yuki Copy')
    await user.type(within(dialog).getByLabelText(/Phone number/i), '093-340-4870')
    // Yuki Tanaka already has this number.
    await user.type(within(dialog).getByLabelText(/National ID/i), '1100400123450')
    await user.click(within(dialog).getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A tenant with this national ID already exists')
    expect(screen.queryByText('Yuki Copy')).not.toBeInTheDocument()
  })
})
