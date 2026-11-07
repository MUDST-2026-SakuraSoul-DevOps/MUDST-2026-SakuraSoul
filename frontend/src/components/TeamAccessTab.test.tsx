import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PERMISSION_MATRIX,
  INITIAL_TEAM_MEMBERS,
  clonePermissionMatrix,
  saveStoredPermissionMatrix,
  saveStoredTeamMembers,
} from '../domain/teamAccess'
import { TeamAccessTab } from './TeamAccessTab'

/*
  teamAccess.test.ts already covers the storage helpers, so this file only pins
  what the tab itself decides: who may edit, which cells stay locked, and what
  survives a save.

  PH2-B4 / SSK-176 scenario S4 asks that a direct API call from a role without
  the permission be refused by the backend. That cannot be tested here, or
  anywhere yet: this tab keeps roles in localStorage and no authorization
  endpoint exists. The tab says so on screen, and the last case below asserts
  that notice stays visible, so the simulation is never mistaken for working
  authorization.
*/

const MEMBERS_KEY = 'sakurasoul_team_members'
const PERMISSIONS_KEY = 'sakurasoul_permission_matrix'

function roleSelect(memberName: string) {
  return screen.getByLabelText('Role for ' + memberName)
}

function permissionBox(role: string, capability: string) {
  return screen.getByLabelText(role + ': ' + capability)
}

function savedMatrix() {
  return JSON.parse(localStorage.getItem(PERMISSIONS_KEY) as string)
}

beforeEach(() => {
  localStorage.clear()
})

describe('TeamAccessTab', () => {
  it('shows the Manager as a fixed badge and other members as an editable role select', () => {
    render(<TeamAccessTab />)

    // Waity S. is the Manager in INITIAL_TEAM_MEMBERS and gets no select at
    // all, so the last Manager cannot be demoted by accident.
    expect(screen.getByText('Waity S.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Role for Waity S.')).not.toBeInTheDocument()

    const nok = roleSelect('Nok T.')
    expect(nok).toHaveValue('Accountant')
    expect(nok).toBeEnabled()
    // Manager is deliberately absent from the options for the same reason.
    expect(Array.from(nok.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Accountant',
      'Maintenance Staff',
    ])
  })

  it('renders stored members instead of the defaults', () => {
    saveStoredTeamMembers([
      { id: '9', name: 'Tanaka K.', role: 'Maintenance Staff', status: 'Inactive' },
    ])

    render(<TeamAccessTab />)

    expect(screen.getByText('Tanaka K.')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.queryByText('Waity S.')).not.toBeInTheDocument()
  })

  it('renders the stored permission matrix, not the defaults', () => {
    const stored = clonePermissionMatrix()
    stored['Manage maintenance tasks']['Accountant'] = true
    saveStoredPermissionMatrix(stored)

    render(<TeamAccessTab />)

    expect(permissionBox('Accountant', 'Manage maintenance tasks')).toBeChecked()
    expect(DEFAULT_PERMISSION_MATRIX['Manage maintenance tasks']['Accountant']).toBe(false)
  })

  it('locks the Manager column even while previewing as Manager', async () => {
    render(<TeamAccessTab />)

    // The Manager keeps every capability by design, so that column is read-only
    // whoever is looking at it.
    const box = permissionBox('Manager', 'Manage team & roles')
    expect(box).toBeChecked()
    expect(box).toBeDisabled()

    await userEvent.click(box)
    expect(box).toBeChecked()
  })

  it('toggles a capability for a non-Manager role', async () => {
    render(<TeamAccessTab />)

    const box = permissionBox('Maintenance Staff', 'Manage invoices & payments')
    expect(box).not.toBeChecked()

    await userEvent.click(box)
    expect(box).toBeChecked()

    await userEvent.click(box)
    expect(box).not.toBeChecked()
  })

  it('turns the whole tab read-only when previewing as a non-Manager role', async () => {
    render(<TeamAccessTab />)

    await userEvent.selectOptions(screen.getByLabelText('Preview as role'), 'Accountant')

    expect(screen.getByText(/Viewing as Accountant/)).toBeInTheDocument()
    expect(roleSelect('Nok T.')).toBeDisabled()
    expect(permissionBox('Accountant', 'Restock supplies')).toBeDisabled()
    expect(screen.getByRole('button', { name: /save permissions/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reset permissions/i })).toBeDisabled()
  })

  it('ignores a capability toggle while previewing as a non-Manager role', async () => {
    const onNotify = vi.fn()
    render(<TeamAccessTab onNotify={onNotify} />)

    await userEvent.selectOptions(screen.getByLabelText('Preview as role'), 'Maintenance Staff')

    const box = permissionBox('Accountant', 'Manage maintenance tasks')
    expect(box).not.toBeChecked()

    await userEvent.click(box)

    expect(box).not.toBeChecked()
    expect(onNotify).not.toHaveBeenCalled()
    expect(localStorage.getItem(PERMISSIONS_KEY)).toBeNull()
  })

  it('saves the role change and the matrix together, and says the change is preview only', async () => {
    const onNotify = vi.fn()
    render(<TeamAccessTab onNotify={onNotify} />)

    await userEvent.selectOptions(roleSelect('Nok T.'), 'Maintenance Staff')
    await userEvent.click(permissionBox('Maintenance Staff', 'View financial reports'))
    await userEvent.click(screen.getByRole('button', { name: /save permissions/i }))

    const members = JSON.parse(localStorage.getItem(MEMBERS_KEY) as string)
    expect(members).toEqual([
      { id: '1', name: 'Waity S.', role: 'Manager', status: 'Active', isCurrentUser: true },
      { id: '2', name: 'Nok T.', role: 'Maintenance Staff', status: 'Active' },
    ])
    expect(savedMatrix()['View financial reports']['Maintenance Staff']).toBe(true)

    // The wording matters: nothing about a real account changed, and this
    // notice is what keeps a reviewer from reading the tab as enforcement.
    expect(onNotify).toHaveBeenCalledWith(
      'Role assignments and permissions saved in this preview only. No account access was changed.',
    )
  })

  it('keeps a role change out of storage until it is saved', async () => {
    render(<TeamAccessTab />)

    await userEvent.selectOptions(roleSelect('Nok T.'), 'Maintenance Staff')

    expect(roleSelect('Nok T.')).toHaveValue('Maintenance Staff')
    expect(localStorage.getItem(MEMBERS_KEY)).toBeNull()
  })

  it('discards unsaved edits on reset and returns to the defaults', async () => {
    const onNotify = vi.fn()
    const stored = clonePermissionMatrix()
    stored['Manage team & roles']['Accountant'] = true
    saveStoredPermissionMatrix(stored)

    render(<TeamAccessTab onNotify={onNotify} />)

    await userEvent.selectOptions(roleSelect('Nok T.'), 'Maintenance Staff')
    expect(permissionBox('Accountant', 'Manage team & roles')).toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: /reset permissions/i }))

    // Reset drops the saved matrix and the edit that was never saved, with no
    // warning, so both are pinned here.
    expect(permissionBox('Accountant', 'Manage team & roles')).not.toBeChecked()
    expect(roleSelect('Nok T.')).toHaveValue(INITIAL_TEAM_MEMBERS[1].role)
    expect(localStorage.getItem(PERMISSIONS_KEY)).toBeNull()
    expect(localStorage.getItem(MEMBERS_KEY)).toBeNull()
    expect(onNotify).toHaveBeenCalledWith('Permissions reset to default.')
  })

  it('always states that backend authorization is not implemented', async () => {
    render(<TeamAccessTab />)

    const notice = /This is a UI simulation; backend authorization is not implemented\./
    expect(screen.getByText(notice)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Preview as role'), 'Accountant')
    expect(screen.getByText(notice)).toBeInTheDocument()
  })
})
