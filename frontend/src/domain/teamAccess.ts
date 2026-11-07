export type TeamRole = 'Manager' | 'Maintenance Staff' | 'Accountant'

export interface TeamMember {
  id: string
  name: string
  role: TeamRole
  status: 'Active' | 'Inactive'
  isCurrentUser?: boolean
}

export const CAPABILITIES = [
  'View unit & tenant details',
  'Manage invoices & payments',
  'View financial reports',
  'Manage maintenance tasks',
  'Restock supplies',
  'View linked documents',
  'Manage team & roles',
] as const

export type Capability = (typeof CAPABILITIES)[number]

export const ROLES: TeamRole[] = ['Manager', 'Maintenance Staff', 'Accountant']

export const DEFAULT_PERMISSION_MATRIX: Record<Capability, Record<TeamRole, boolean>> = {
  'View unit & tenant details': {
    'Manager': true,
    'Maintenance Staff': true,
    'Accountant': true,
  },
  'Manage invoices & payments': {
    'Manager': true,
    'Maintenance Staff': false,
    'Accountant': true,
  },
  'View financial reports': {
    'Manager': true,
    'Maintenance Staff': false,
    'Accountant': true,
  },
  'Manage maintenance tasks': {
    'Manager': true,
    'Maintenance Staff': true,
    'Accountant': false,
  },
  'Restock supplies': {
    'Manager': true,
    'Maintenance Staff': true,
    'Accountant': false,
  },
  'View linked documents': {
    'Manager': true,
    'Maintenance Staff': true,
    'Accountant': true,
  },
  'Manage team & roles': {
    'Manager': true,
    'Maintenance Staff': false,
    'Accountant': false,
  },
}

export const INITIAL_TEAM_MEMBERS: TeamMember[] = [
  { id: '1', name: 'Waity S.', role: 'Manager', status: 'Active', isCurrentUser: true },
  { id: '2', name: 'Nok T.', role: 'Accountant', status: 'Active' },
]

export function clonePermissionMatrix(
  matrix: Record<Capability, Record<TeamRole, boolean>> = DEFAULT_PERMISSION_MATRIX,
): Record<Capability, Record<TeamRole, boolean>> {
  const copy = {} as Record<Capability, Record<TeamRole, boolean>>
  for (const cap of CAPABILITIES) {
    copy[cap] = { ...matrix[cap] }
  }
  return copy
}

const STORAGE_KEY_MEMBERS = 'sakurasoul_team_members'
const STORAGE_KEY_PERMISSIONS = 'sakurasoul_permission_matrix'

export function getStoredTeamMembers(): TeamMember[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MEMBERS)
    if (raw) return JSON.parse(raw)
  } catch {
    // fallback to initial
  }
  return INITIAL_TEAM_MEMBERS
}

export function saveStoredTeamMembers(members: TeamMember[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(members))
  } catch {
    // ignore
  }
}

export function getStoredPermissionMatrix(): Record<Capability, Record<TeamRole, boolean>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PERMISSIONS)
    if (raw) return JSON.parse(raw)
  } catch {
    // fallback to initial
  }
  return clonePermissionMatrix(DEFAULT_PERMISSION_MATRIX)
}

export function saveStoredPermissionMatrix(matrix: Record<Capability, Record<TeamRole, boolean>>): void {
  try {
    localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(matrix))
  } catch {
    // ignore
  }
}

export function resetStoredPermissions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_MEMBERS)
    localStorage.removeItem(STORAGE_KEY_PERMISSIONS)
  } catch {
    // ignore
  }
}
