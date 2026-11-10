import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamAccessTab } from './TeamAccessTab'
import { getStoredPermissionMatrix, getStoredTeamMembers, resetStoredPermissions } from '../domain/teamAccess'

beforeEach(() => {
  resetStoredPermissions()
})

describe('TeamAccessTab production page behavior', () => {
  it('locks Manager permissions and persists role changes only after an explicit save', async () => {
    const user = userEvent.setup()
    const onNotify = vi.fn()
    render(<TeamAccessTab onNotify={onNotify} />)

    expect(screen.getByRole('checkbox', { name: 'Manager: Manage team & roles' })).toBeDisabled()
    const accountantPermission = screen.getByRole('checkbox', { name: 'Accountant: Manage maintenance tasks' })
    await user.click(accountantPermission)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Role for Nok T.' }), 'Maintenance Staff')

    expect(accountantPermission).toBeChecked()
    expect(getStoredPermissionMatrix()['Manage maintenance tasks']['Accountant']).toBe(false)
    expect(getStoredTeamMembers().find((member) => member.name === 'Nok T.')?.role).toBe('Accountant')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Preview as role' }), 'Accountant')
    expect(screen.getByRole('checkbox', { name: 'Accountant: Manage maintenance tasks' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled()
    expect(getStoredPermissionMatrix()['Manage maintenance tasks']['Accountant']).toBe(false)
    expect(getStoredTeamMembers().find((member) => member.name === 'Nok T.')?.role).toBe('Accountant')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Preview as role' }), 'Manager')
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    expect(getStoredTeamMembers().find((member) => member.name === 'Nok T.')?.role).toBe('Maintenance Staff')
    expect(getStoredPermissionMatrix()['Manage maintenance tasks']['Accountant']).toBe(true)
    expect(onNotify).toHaveBeenCalledWith('Role assignments and permissions saved in this preview only. No account access was changed.')
  })
})
