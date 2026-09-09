import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MaintenancePage from './MaintenancePage'

/**
 * Unit tests for SSK-23 / Supplies Inventory.
 *
 * The current frontend implementation provides a Supplies & Inventory tab with
 * sample inventory data. The create/edit inventory dialogs and backend API are
 * not wired yet, so these tests cover the visible inventory behavior that exists
 * in the frontend right now.
 *
 * Covered for now:
 * - Open the Supplies & Inventory tab.
 * - Render inventory summary cards.
 * - Show inventory item rows with SKU, category, stock, minimum stock, and status.
 * - Search inventory by item name.
 * - Search inventory by SKU.
 * - Show one edit action per visible inventory row.
 *
 * Not covered yet:
 * - Creating a new supply item.
 * - Editing an existing supply item.
 * - Saving inventory data to the backend.
 * - Updating stock from real maintenance usage.
 */

async function openSuppliesTab() {
  const user = userEvent.setup()
  render(<MaintenancePage />)

  await user.click(screen.getByRole('button', { name: 'Supplies & Inventory' }))
  await screen.findByRole('heading', { name: 'Current Inventory' })
  return user
}

function inventoryRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

describe('SSK-23 supplies inventory', () => {
  it('opens the Supplies & Inventory tab and shows inventory summary cards', async () => {
    await openSuppliesTab()

    // This verifies that admins can enter the inventory section and see stock summary information.
    expect(screen.getByRole('heading', { name: 'Maintenance Management' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current Inventory' })).toBeInTheDocument()
    expect(screen.getByText('TOTAL ITEMS')).toBeInTheDocument()
    expect(screen.getByText('LOW STOCK ALERTS')).toBeInTheDocument()
    expect(screen.getByText('RECENT RESTOCKS')).toBeInTheDocument()
  })

  it('shows supply rows with SKU, category, stock, minimum stock, and status', async () => {
    await openSuppliesTab()

    // This checks the core inventory table data that admins need before restocking supplies.
    const ledRow = screen.getByText('LED Bulbs 60W').closest('tr')
    expect(ledRow).not.toBeNull()
    expect(within(ledRow!).getByText('SKU: EL-001')).toBeInTheDocument()
    expect(within(ledRow!).getByText('Electrical')).toBeInTheDocument()
    expect(within(ledRow!).getByText('145')).toBeInTheDocument()
    expect(within(ledRow!).getByText('50')).toBeInTheDocument()
    expect(within(ledRow!).getByText('In Stock')).toBeInTheDocument()

    const filterRow = screen.getByText('Air Filters 16x20x1').closest('tr')
    expect(filterRow).not.toBeNull()
    expect(within(filterRow!).getByText('SKU: HV-042')).toBeInTheDocument()
    expect(within(filterRow!).getByText('Low Stock')).toBeInTheDocument()
  })

  it('filters inventory by item name', async () => {
    const user = await openSuppliesTab()

    // This helps admins quickly find a supply item by its item name.
    await user.type(screen.getByPlaceholderText('Search Item'), 'Copper')

    await waitFor(() => {
      expect(screen.queryByText('LED Bulbs 60W')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Air Filters 16x20x1')).not.toBeInTheDocument()
    expect(screen.getByText('Copper Pipe Fittings')).toBeInTheDocument()
  })

  it('filters inventory by SKU', async () => {
    const user = await openSuppliesTab()

    // This verifies that inventory search works with SKU codes, not only item names.
    await user.type(screen.getByPlaceholderText('Search Item'), 'HV-042')

    await waitFor(() => {
      expect(screen.queryByText('LED Bulbs 60W')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Air Filters 16x20x1')).toBeInTheDocument()
    expect(screen.queryByText('Copper Pipe Fittings')).not.toBeInTheDocument()
  })

  it('shows one edit action for each visible inventory row', async () => {
    await openSuppliesTab()

    // The edit buttons are available as UI affordances, but the edit flow is not wired yet.
    const rows = inventoryRows()
    expect(rows).toHaveLength(3)

    for (const row of rows) {
      expect(within(row).getByRole('button', { name: 'แก้ไขอะไหล่' })).toBeInTheDocument()
    }
  })

  it('shows the New Supply Item button for the future create flow', async () => {
    await openSuppliesTab()

    // The button is visible, but the create supply dialog is not implemented in this branch yet.
    expect(screen.getByRole('button', { name: /new supply item/i })).toBeInTheDocument()
  })
})
