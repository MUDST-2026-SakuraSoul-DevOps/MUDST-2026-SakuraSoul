import { useState } from 'react'
import { ShieldCheck, Info } from 'lucide-react'
import {
  type TeamRole,
  type Capability,
  CAPABILITIES,
  ROLES,
  getStoredTeamMembers,
  saveStoredTeamMembers,
  getStoredPermissionMatrix,
  saveStoredPermissionMatrix,
  resetStoredPermissions,
  clonePermissionMatrix,
} from '../domain/teamAccess'
import { CustomSelect } from './CustomSelect'

interface TeamAccessTabProps {
  onNotify?: (message: string) => void
}

export function TeamAccessTab({ onNotify }: TeamAccessTabProps) {
  const [previewRole, setPreviewRole] = useState<TeamRole>('Manager')
  const [members, setMembers] = useState(getStoredTeamMembers)
  const [permissions, setPermissions] = useState(getStoredPermissionMatrix)

  const isManager = previewRole === 'Manager'

  function handleRoleChange(memberId: string, newRole: TeamRole) {
    const updated = members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    setMembers(updated)
  }

  function handlePermissionToggle(cap: Capability, role: TeamRole) {
    if (!isManager || role === 'Manager') return
    setPermissions((prev) => ({
      ...prev,
      [cap]: {
        ...prev[cap],
        [role]: !prev[cap][role],
      },
    }))
  }

  function handleSave() {
    if (!isManager) return
    saveStoredTeamMembers(members)
    saveStoredPermissionMatrix(permissions)
    onNotify?.('Role assignments and permissions saved in this preview only. No account access was changed.')
  }

  function handleReset() {
    if (!isManager) return
    resetStoredPermissions()
    setMembers(getStoredTeamMembers())
    setPermissions(clonePermissionMatrix())
    onNotify?.('Permissions reset to default.')
  }

  const roleOptions = ROLES.map((r) => ({ value: r, label: r }))

  return (
    <div className="flex w-full flex-col gap-6">
      {/* ═══════════════ Role preview toolbar ═══════════════ */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sand-65 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <span className="text-xs text-sand-550 hidden sm:inline">
            Role-based access control &amp; permission simulation
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="preview-role-select" className="text-xs font-bold text-sand-550 tracking-wider uppercase">
            Preview as role:
          </label>
          <div className="w-52">
            <CustomSelect<TeamRole>
              id="preview-role-select"
              aria-label="Preview as role"
              value={previewRole}
              onChange={(role) => setPreviewRole(role)}
              options={roleOptions}
            />
          </div>
        </div>
      </div>

      {/* ═══════════════ Note Banner ═══════════════ */}
      <div className="flex items-start gap-3 rounded-xl border border-sand-110 bg-sand-45/80 p-4 text-xs text-sand-830 leading-relaxed">
        <Info className="ui-icon size-icon-control text-brand shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          {isManager
            ? 'Managers can manage role assignments. Review the permission matrix before saving.'
            : `Viewing as ${previewRole}. Role configuration is read-only. Switch back to Manager to edit.`}{' '}
          <span className="text-sand-550">This is a UI simulation; backend authorization is not implemented.</span>
        </div>
      </div>

      {/* ═══════════════ Team Members Card ═══════════════ */}
      <div className="rounded-2xl border border-sand-65 bg-white p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="border-b border-sand-65 pb-4">
          <h2 className="font-heading text-xl font-medium text-ink">Team members</h2>
          <p className="mt-1 text-xs text-sand-550">Role assignments apply to the selected team member.</p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-sand-65 bg-sand-45 text-sand-550 font-bold uppercase tracking-wider">
                <th scope="col" className="px-4 py-3">TEAM MEMBER</th>
                <th scope="col" className="px-4 py-3">ROLE</th>
                <th scope="col" className="px-4 py-3">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-65">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-sand-45/50 transition-colors">
                  <td className="px-4 py-3.5 font-medium text-ink">
                    <div className="flex items-center gap-2">
                      {member.role === 'Manager' && (
                        <ShieldCheck className="ui-icon size-icon-control text-honey-610" aria-hidden="true" />
                      )}
                      <span>{member.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {member.role === 'Manager' ? (
                      <span className="inline-block rounded-full bg-sand-65 px-3 py-0.5 text-xs font-semibold text-honey-610">
                        Manager
                      </span>
                    ) : (
                      <select
                        aria-label={`Role for ${member.name}`}
                        disabled={!isManager}
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as TeamRole)}
                        className="rounded-lg border border-sand-110 bg-white px-3 py-1.5 text-xs text-ink disabled:bg-sand-45 disabled:text-sand-450 disabled:cursor-not-allowed focus:border-brand outline-none"
                      >
                        <option value="Accountant">Accountant</option>
                        <option value="Maintenance Staff">Maintenance Staff</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                      {member.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════ Permission Matrix Card ═══════════════ */}
      <div className="rounded-2xl border border-sand-65 bg-white p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="border-b border-sand-65 pb-4">
          <h2 className="font-heading text-xl font-medium text-ink">Permission matrix</h2>
          <p className="mt-1 text-xs text-sand-550">
            Check permissions by responsibility. Documents are limited to those linked to permitted work.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-sand-65 bg-sand-45 text-sand-550 font-bold uppercase tracking-wider">
                <th scope="col" className="px-4 py-3">PERMISSION</th>
                <th scope="col" className="px-4 py-3 text-center">MANAGER</th>
                <th scope="col" className="px-4 py-3 text-center">MAINTENANCE STAFF</th>
                <th scope="col" className="px-4 py-3 text-center">ACCOUNTANT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-65">
              {CAPABILITIES.map((cap) => (
                <tr key={cap} className="hover:bg-sand-45/50 transition-colors">
                  <td className="px-4 py-3.5 font-medium text-ink">{cap}</td>
                  {ROLES.map((r, roleIdx) => (
                    <td key={r} className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${r}: ${cap}`}
                        checked={permissions[cap]?.[r] ?? false}
                        disabled={!isManager || roleIdx === 0}
                        onChange={() => handlePermissionToggle(cap, r)}
                        className="size-4 rounded border-sand-300 text-brand accent-sand-740 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-sand-65">
          <button
            type="button"
            disabled={!isManager}
            onClick={handleReset}
            className="rounded-xl border border-sand-110 bg-white px-5 py-2.5 text-xs font-bold tracking-[1px] text-sand-650 uppercase transition hover:bg-sand-45 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Reset permissions
          </button>
          <button
            type="button"
            disabled={!isManager}
            onClick={handleSave}
            className="rounded-xl bg-sand-660 px-5 py-2.5 text-xs font-bold tracking-[1px] text-white uppercase shadow-sm transition hover:bg-sand-740 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Save permissions
          </button>
        </div>
      </div>
    </div>
  )
}
