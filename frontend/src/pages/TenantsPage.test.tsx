import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockStore } from '../api/mockApi'
import TenantsPage from './TenantsPage'

/**
 * Unit tests for SSK-13 / US-07: Search and filter tenant directory.
 *
 * Covered:
 * - Search tenants by name in real time.
 * - Search tenants by room number.
 * - Show empty state when no tenants match.
 * - Filter tenants by lease status: Active / Ended.
 * - Reset filter back to All Status.
 * - Keep status filter active while searching.
 * - Show lease-related columns from the latest lease.
 */

async function renderTenants() {
  render(<TenantsPage />)
  await screen.findByText('ยูกิ ทานากะ')
}

/**
 * Reads tenant names from the first table cell of each visible row.
 * This helps the tests verify which tenants are currently shown after filtering.
 */
function visibleTenantNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '')
}

beforeEach(() => {
  resetMockStore()
})

describe('US-07-S1 real-time tenant search', () => {
  it('filters tenants by name immediately without clicking a search button', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // This verifies the main happy path: typing a tenant name updates the result list in real time.
    await user.type(screen.getByLabelText('ค้นหาชื่อผู้เช่าหรือเลขห้อง'), 'เคนจิ')

    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('เคนจิ ซาโต้')
  })

  it('filters tenants by room number', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // This protects the room-number search behavior, not only name search.
    await user.type(screen.getByLabelText('ค้นหาชื่อผู้เช่าหรือเลขห้อง'), '207')

    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(1)
    })
    expect(visibleTenantNames()[0]).toContain('ฮิโรชิ นากามุระ')
  })

  it('shows an empty state when no tenant matches the search keyword', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // This makes sure users get clear feedback instead of seeing an empty table with no explanation.
    await user.type(screen.getByLabelText('ค้นหาชื่อผู้เช่าหรือเลขห้อง'), 'ไม่มีคนชื่อนี้')

    expect(await screen.findByText('ไม่พบผู้เช่าที่ตรงกับเงื่อนไข')).toBeInTheDocument()
  })
})

describe('US-07-S2 tenant status filter', () => {
  it('shows only tenants with active leases when Active is selected', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // This verifies that ended tenants are hidden from the Active list.
    await user.click(screen.getByRole('button', { name: 'Active' }))

    await waitFor(() => {
      expect(screen.queryByText('อาริสา พงษ์ศิริ')).not.toBeInTheDocument()
    })
    expect(screen.getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    expect(screen.getByText('เคนจิ ซาโต้')).toBeInTheDocument()
  })

  it('shows only tenants with ended leases when Ended is selected', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // This verifies that active tenants are hidden from the Ended list.
    await user.click(screen.getByRole('button', { name: 'Ended' }))

    await waitFor(() => {
      expect(screen.queryByText('ยูกิ ทานากะ')).not.toBeInTheDocument()
    })
    expect(screen.getByText('อาริสา พงษ์ศิริ')).toBeInTheDocument()
  })

  it('does not show tenants without leases in Active or Ended filters', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // This tenant exists in the directory but has no lease yet.
    expect(screen.getByText('ธนกฤต วัฒนชัย')).toBeInTheDocument()

    // A tenant without a lease should not appear in the Active filter.
    await user.click(screen.getByRole('button', { name: 'Active' }))
    await waitFor(() => {
      expect(screen.queryByText('ธนกฤต วัฒนชัย')).not.toBeInTheDocument()
    })

    // A tenant without a lease should not appear in the Ended filter either.
    await user.click(screen.getByRole('button', { name: 'Ended' }))
    await waitFor(() => {
      expect(screen.queryByText('ธนกฤต วัฒนชัย')).not.toBeInTheDocument()
    })
  })

  it('shows all tenants again when All Status is selected', async () => {
    const user = userEvent.setup()
    await renderTenants()
    const total = visibleTenantNames().length

    // First apply a narrower filter.
    await user.click(screen.getByRole('button', { name: 'Active' }))
    await waitFor(() => {
      expect(visibleTenantNames().length).toBeLessThan(total)
    })

    // Then verify that All Status resets the list back to the original total.
    await user.click(screen.getByRole('button', { name: 'All Status' }))
    await waitFor(() => {
      expect(visibleTenantNames()).toHaveLength(total)
    })
  })

  it('keeps the status filter active while searching by tenant name', async () => {
    const user = userEvent.setup()
    await renderTenants()

    // This protects the combined user flow: filter Active tenants first,
    // then type a tenant name that only belongs to an Ended lease.
    await user.click(screen.getByRole('button', { name: 'Active' }))
    await user.type(screen.getByLabelText('ค้นหาชื่อผู้เช่าหรือเลขห้อง'), 'อาริสา')

    expect(await screen.findByText('ไม่พบผู้เช่าที่ตรงกับเงื่อนไข')).toBeInTheDocument()
    expect(screen.queryByText('อาริสา พงษ์ศิริ')).not.toBeInTheDocument()
  })
})

describe('lease-related columns in tenant directory', () => {
  it('shows room number and rent from the latest lease', async () => {
    await renderTenants()

    // This verifies that the tenant table displays lease data instead of empty placeholder values.
    const row = screen.getByText('ยูกิ ทานากะ').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('102')).toBeInTheDocument()
    expect(within(row!).getByText('3,500.00')).toBeInTheDocument()
  })

  it('shows a clear no-lease message for tenants without leases', async () => {
    await renderTenants()

    // This makes the no-lease state explicit for admins.
    const row = screen.getByText('ธนกฤต วัฒนชัย').closest('tr')
    expect(within(row!).getByText('ยังไม่มีสัญญา')).toBeInTheDocument()
  })
})