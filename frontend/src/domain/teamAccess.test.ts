import { describe, it, expect, beforeEach } from 'vitest'
import {
  CAPABILITIES,
  ROLES,
  DEFAULT_PERMISSION_MATRIX,
  INITIAL_TEAM_MEMBERS,
  clonePermissionMatrix,
  getStoredTeamMembers,
  saveStoredTeamMembers,
  getStoredPermissionMatrix,
  saveStoredPermissionMatrix,
  resetStoredPermissions,
} from './teamAccess'

describe('teamAccess domain', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defines 7 standard capabilities and 3 roles', () => {
    expect(CAPABILITIES).toHaveLength(7)
    expect(ROLES).toEqual(['Manager', 'Maintenance Staff', 'Accountant'])
  })

  it('provides default permission matrix with correct roles access', () => {
    // Manager has access to everything
    for (const cap of CAPABILITIES) {
      expect(DEFAULT_PERMISSION_MATRIX[cap]['Manager']).toBe(true)
    }

    // Accountant has financial access but not maintenance or team roles
    expect(DEFAULT_PERMISSION_MATRIX['Manage invoices & payments']['Accountant']).toBe(true)
    expect(DEFAULT_PERMISSION_MATRIX['Manage maintenance tasks']['Accountant']).toBe(false)
    expect(DEFAULT_PERMISSION_MATRIX['Manage team & roles']['Accountant']).toBe(false)

    // Maintenance Staff has maintenance access but not finances
    expect(DEFAULT_PERMISSION_MATRIX['Manage maintenance tasks']['Maintenance Staff']).toBe(true)
    expect(DEFAULT_PERMISSION_MATRIX['Restock supplies']['Maintenance Staff']).toBe(true)
    expect(DEFAULT_PERMISSION_MATRIX['Manage invoices & payments']['Maintenance Staff']).toBe(false)
  })

  it('deep clones permission matrix', () => {
    const clone = clonePermissionMatrix()
    clone['Manage team & roles']['Accountant'] = true
    expect(DEFAULT_PERMISSION_MATRIX['Manage team & roles']['Accountant']).toBe(false)
  })

  it('saves and retrieves stored team members from localStorage', () => {
    expect(getStoredTeamMembers()).toEqual(INITIAL_TEAM_MEMBERS)

    const updated = [
      ...INITIAL_TEAM_MEMBERS,
      { id: '3', name: 'Tanaka K.', role: 'Maintenance Staff' as const, status: 'Active' as const },
    ]
    saveStoredTeamMembers(updated)
    expect(getStoredTeamMembers()).toEqual(updated)
  })

  it('saves and retrieves stored permission matrix', () => {
    const modified = clonePermissionMatrix()
    modified['Manage maintenance tasks']['Accountant'] = true
    saveStoredPermissionMatrix(modified)

    const retrieved = getStoredPermissionMatrix()
    expect(retrieved['Manage maintenance tasks']['Accountant']).toBe(true)
  })

  it('resets stored permissions and team members', () => {
    saveStoredTeamMembers([])
    const modified = clonePermissionMatrix()
    modified['Manage maintenance tasks']['Accountant'] = true
    saveStoredPermissionMatrix(modified)

    resetStoredPermissions()
    expect(getStoredTeamMembers()).toEqual(INITIAL_TEAM_MEMBERS)
    expect(getStoredPermissionMatrix()['Manage maintenance tasks']['Accountant']).toBe(false)
  })
})
