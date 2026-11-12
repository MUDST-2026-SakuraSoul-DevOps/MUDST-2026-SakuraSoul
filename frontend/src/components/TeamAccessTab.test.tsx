import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamAccessTab } from './TeamAccessTab'
import { resetStoredPermissions } from '../domain/teamAccess'

describe('TeamAccessTab', () => {
  beforeEach(() => {
    resetStoredPermissions()
  })

  it('renders team members and permission matrix in Manager mode', () => {
    render(<TeamAccessTab />)

    expect(screen.getByText('Team members')).toBeInTheDocument()
    expect(screen.getByText('Waity S.')).toBeInTheDocument()
    expect(screen.getByText('Nok T.')).toBeInTheDocument()
    expect(screen.getByText(/Managers can manage role assignments/i)).toBeInTheDocument()

    // Manager permissions are always checked and disabled
    const managerManage = screen.getByLabelText('Manager: Manage team & roles')
    expect(managerManage).toBeChecked()
    expect(managerManage).toBeDisabled()

    // Non-manager permissions are editable
    const staffInvoices = screen.getByLabelText('Maintenance Staff: Manage invoices & payments')
    expect(staffInvoices).not.toBeChecked()
    expect(staffInvoices).toBeEnabled()
  })

  it('allows changing member roles, toggling permissions, saving, and resetting', () => {
    const onNotify = vi.fn()
    render(<TeamAccessTab onNotify={onNotify} />)

    // Change Nok T.'s role to Maintenance Staff
    const roleSelect = screen.getByLabelText('Role for Nok T.')
    fireEvent.change(roleSelect, { target: { value: 'Maintenance Staff' } })
    expect(roleSelect).toHaveValue('Maintenance Staff')

    // Toggle permission checkbox
    const staffInvoices = screen.getByLabelText('Maintenance Staff: Manage invoices & payments')
    fireEvent.click(staffInvoices)
    expect(staffInvoices).toBeChecked()

    // Save permissions
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    expect(onNotify).toHaveBeenCalledWith(
      'Role assignments and permissions saved in this preview only. No account access was changed.',
    )

    // Reset permissions
    fireEvent.click(screen.getByRole('button', { name: 'Reset permissions' }))
    expect(onNotify).toHaveBeenCalledWith('Permissions reset to default.')
    expect(screen.getByLabelText('Maintenance Staff: Manage invoices & payments')).not.toBeChecked()
    expect(screen.getByLabelText('Role for Nok T.')).toHaveValue('Accountant')
  })

  it('switches to read-only mode when previewing as a non-Manager role', () => {
    render(<TeamAccessTab />)

    const previewSelect = screen.getByLabelText('Preview as role')
    fireEvent.change(previewSelect, { target: { value: 'Accountant' } })

    expect(screen.getByText(/Viewing as Accountant\. Role configuration is read-only\./i)).toBeInTheDocument()
    expect(screen.getByLabelText('Role for Nok T.')).toBeDisabled()
    expect(screen.getByLabelText('Accountant: View financial reports')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset permissions' })).toBeDisabled()
  })
})
