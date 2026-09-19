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
        <h1 className="font-heading text-[36px] sm:text-[42px] font-normal tracking-tight text-ink leading-tight">
          Account Settings
        </h1>
        <p className="text-base text-sand-650 font-normal leading-relaxed">
          Manage your personal profile, account credentials, and system preferences.
        </p>
      </div>

      <hr className="mt-7 mb-10 border-t border-sand-65" />

      {/* ═══════════════ Centered Cards Content ═══════════════ */}
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-10 lg:flex-row lg:items-start">
        {/* ═══════════════ Left Column: Profile Card ═══════════════ */}
        <div className="w-full sm:w-[340px] md:w-[360px] shrink-0 rounded-2xl border border-sand-65 bg-white overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex justify-center bg-sand-45 pt-11 pb-7 px-8">
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
            <h2 className="font-heading text-xl font-semibold text-ink tracking-tight">{profile.fullName}</h2>
            {/* ซ่อนป้ายเมื่อตำแหน่งซ้ำกับชื่อ ด้วยเหตุผลเดียวกับใน AppLayout */}
            {profile.role && profile.role !== profile.fullName && (
              <span className="mt-2 inline-block rounded-full bg-sand-65 px-4 py-1 text-xs font-medium text-honey-610">
                {profile.role}
              </span>
            )}

            <div className="mt-8 flex w-full items-center justify-between text-sm text-body-muted border-t border-sand-65 pt-5">
              <span className="text-sand-450 font-medium">Staff ID</span>
              {/* staffId ไม่มีที่มาจาก API จึงว่างได้ทั่วไป โชว์ขีดแทนและคงแถวไว้
                  ไม่ซ่อนทิ้ง เพื่อให้การ์ดไม่ขยับตำแหน่งไปมาแล้วดูเหมือนหน้าพัง */}
              <span className="font-semibold text-ink">{profile.staffId || '—'}</span>
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
              className="mt-8 w-full rounded-xl bg-sand-660 py-3 text-xs font-bold tracking-[1px] text-white uppercase shadow-sm transition-all hover:bg-sand-740 active:scale-[0.99] cursor-pointer"
            >
              UPLOAD NEW PHOTO
            </button>

            <button
              type="button"
              onClick={handleRemovePhoto}
              className="mt-3.5 text-xs font-bold tracking-[1px] text-alert-450 uppercase transition-colors hover:underline cursor-pointer"
            >
              REMOVE
            </button>
          </div>
        </div>

        {/* ═══════════════ Right Column: Personal Details Card ═══════════════ */}
        <div className="w-full flex-1 rounded-2xl border border-sand-65 bg-white p-8 sm:p-10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-4 border-b border-sand-65">
            <h3 className="font-heading text-xl sm:text-2xl font-medium text-ink">Personal Details</h3>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="Edit personal details"
              className="flex items-center gap-2 text-xs font-bold tracking-wider text-sand-550 uppercase transition-colors hover:text-wine-760 cursor-pointer"
            >
              <Pencil size={15} className="text-sand-550" />
              EDIT
            </button>
          </div>

          <div className="flex flex-col gap-7 pt-2">
            <div className="mt-5">
              <p className="text-xs font-bold tracking-wider text-sand-390 uppercase">USERNAME</p>
              <p className="mt-2 w-72 max-w-full pb-2.5 text-base font-normal text-ink border-b border-sand-65">
                {profile.username}
              </p>
            </div>

            <div className="mt-2">
              <p className="text-xs font-bold tracking-wider text-sand-390 uppercase">PASSWORD</p>
              <p className="mt-2 w-full pb-2.5 text-base font-normal text-ink border-b border-sand-65">
                {profile.emailOrPassword || '—'}
              </p>
            </div>

            <div className="mt-2">
              <p className="text-xs font-bold tracking-wider text-sand-390 uppercase">PHONE NUMBER</p>
              <p className="mt-2 w-full pb-2.5 text-base font-normal text-ink border-b border-sand-65">
                {profile.phone || '—'}
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
