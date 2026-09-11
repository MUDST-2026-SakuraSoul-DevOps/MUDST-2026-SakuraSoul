import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'

export interface UserProfile {
  fullName: string
  role: string
  staffId: string
  username: string
  emailOrPassword: string
  phone: string
  avatarUrl?: string
}

export function EditProfileDialog({
  profile,
  onClose,
  onSave,
}: {
  profile: UserProfile
  onClose: () => void
  onSave: (updated: UserProfile) => void
}) {
  const [fullName, setFullName] = useState(profile.fullName)
  const [role, setRole] = useState(profile.role)
  const [username, setUsername] = useState(profile.username)
  const [emailOrPassword, setEmailOrPassword] = useState(profile.emailOrPassword)
  const [phone, setPhone] = useState(profile.phone)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSave({
      ...profile,
      fullName: fullName.trim() || profile.fullName,
      role: role.trim() || profile.role,
      username: username.trim() || profile.username,
      emailOrPassword: emailOrPassword.trim() || profile.emailOrPassword,
      phone: phone.trim() || profile.phone,
    })
    onClose()
  }

  return (
    <Modal
      title="Edit Personal Details"
      subtitle="Update your personal profile, credentials, and contact details"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-start gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel ยกเลิก"
            className="rounded-lg border border-[rgba(212,194,195,0.6)] bg-white px-5 py-2 text-sm font-medium text-ink-muted hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-profile-form"
            aria-label="Save Changes บันทึกการเปลี่ยนแปลง"
            className="rounded-lg bg-[#5c2a32] px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#4a2027]"
          >
            Save Changes
          </button>
        </div>
      }
    >
      <form id="edit-profile-form" onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              aria-label="Full Name"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">
              Role / Position
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Your role or position"
              aria-label="Role"
              className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">
            Username <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
            aria-label="Username"
            className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">
            Email / Password Credential <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={emailOrPassword}
            onChange={(e) => setEmailOrPassword(e.target.value)}
            placeholder="name@example.com"
            aria-label="Email or Password"
            className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+81 90-0000-0000"
            aria-label="Phone Number"
            className="w-full rounded-lg border border-[rgba(212,194,195,0.6)] px-3.5 py-2 text-sm text-ink outline-none placeholder:text-gray-300 focus:border-[#5c2a32]"
          />
        </div>
      </form>
    </Modal>
  )
}
