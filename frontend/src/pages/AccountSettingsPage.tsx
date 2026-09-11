import { useState, useRef, type ChangeEvent } from 'react'
import { Pencil } from 'lucide-react'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { EditProfileDialog } from '../dialogs/EditProfileDialog'
import { useUserProfile } from '../domain/profileStore'

export default function AccountSettingsPage() {
  const [profile, setProfile] = useUserProfile()
  const [editOpen, setEditOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setProfile({ ...profile, avatarUrl: reader.result })
        }
      }
      reader.readAsDataURL(file)
    }
  }

  function handleRemovePhoto() {
    setProfile({ ...profile, avatarUrl: undefined })
  }

  return (
    <div className="flex w-full flex-col text-left">
      {/* ═══════════════ Header (Left-aligned full width) ═══════════════ */}
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[36px] sm:text-[42px] font-normal tracking-tight text-[#1b1c1c] leading-tight">
          Account Settings
        </h1>
        <p className="text-base text-[#5a5050] font-normal leading-relaxed">
          Manage your personal profile, account credentials, and system preferences.
        </p>
      </div>

      <hr className="mt-7 mb-10 border-t border-[#f0ebe5]" />

      {/* ═══════════════ Centered Cards Content ═══════════════ */}
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-10 lg:flex-row lg:items-start">
        {/* ═══════════════ Left Column: Profile Card ═══════════════ */}
        <div className="w-full sm:w-[340px] md:w-[360px] shrink-0 rounded-2xl border border-[#efe9e3] bg-white overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex justify-center bg-[#f7f4f0] pt-11 pb-7 px-8">
            <div className="size-[116px] overflow-hidden rounded-2xl border-2 border-white/90 shadow-md">
              <ProfileAvatar
                src={profile.avatarUrl}
                alt={profile.fullName}
                size={116}
                className="rounded-2xl"
              />
            </div>
          </div>

          <div className="flex flex-col items-center px-8 pt-6 pb-8 text-center">
            <h2 className="font-heading text-xl font-semibold text-[#1b1c1c] tracking-tight">{profile.fullName}</h2>
            <span className="mt-2 inline-block rounded-full bg-[#f3ede6] px-4 py-1 text-xs font-medium text-[#6f5848]">
              {profile.role}
            </span>

            <div className="mt-8 flex w-full items-center justify-between text-sm text-[#504444] border-t border-[#f0eae5] pt-5">
              <span className="text-[#8e8580] font-medium">Staff ID</span>
              <span className="font-semibold text-[#1b1c1c]">{profile.staffId}</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              aria-label="Upload file input"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-8 w-full rounded-xl bg-[#4e504f] py-3 text-xs font-bold tracking-[1px] text-white uppercase shadow-sm transition-all hover:bg-[#3d3f3e] active:scale-[0.99] cursor-pointer"
            >
              UPLOAD NEW PHOTO
            </button>

            <button
              type="button"
              onClick={handleRemovePhoto}
              className="mt-3.5 text-xs font-bold tracking-[1px] text-[#e05658] uppercase transition-colors hover:underline cursor-pointer"
            >
              REMOVE
            </button>
          </div>
        </div>

        {/* ═══════════════ Right Column: Personal Details Card ═══════════════ */}
        <div className="w-full flex-1 rounded-2xl border border-[#efe9e3] bg-white p-8 sm:p-10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-4 border-b border-[#f2ece6]">
            <h3 className="font-heading text-xl sm:text-2xl font-medium text-[#1b1c1c]">Personal Details</h3>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="Edit personal details"
              className="flex items-center gap-2 text-xs font-bold tracking-wider text-[#736864] uppercase transition-colors hover:text-[#5c2a32] cursor-pointer"
            >
              <Pencil size={15} className="text-[#736864]" />
              EDIT
            </button>
          </div>

          <div className="flex flex-col gap-7 pt-2">
            <div className="mt-5">
              <p className="text-xs font-bold tracking-wider text-[#9c938e] uppercase">USERNAME</p>
              <p className="mt-2 w-72 max-w-full pb-2.5 text-base font-normal text-[#1b1c1c] border-b border-[#ece7e1]">
                {profile.username}
              </p>
            </div>

            <div className="mt-2">
              <p className="text-xs font-bold tracking-wider text-[#9c938e] uppercase">PASSWORD</p>
              <p className="mt-2 w-full pb-2.5 text-base font-normal text-[#1b1c1c] border-b border-[#ece7e1]">
                {profile.emailOrPassword}
              </p>
            </div>

            <div className="mt-2">
              <p className="text-xs font-bold tracking-wider text-[#9c938e] uppercase">PHONE NUMBER</p>
              <p className="mt-2 w-full pb-2.5 text-base font-normal text-[#1b1c1c] border-b border-[#ece7e1]">
                {profile.phone}
              </p>
            </div>
          </div>
        </div>
      </div>

      {editOpen && (
        <EditProfileDialog
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSave={(updated) => setProfile(updated)}
        />
      )}
    </div>
  )
}
