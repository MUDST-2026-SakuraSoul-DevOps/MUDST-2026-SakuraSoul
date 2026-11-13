import { useState, useRef, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil, X } from 'lucide-react'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { EditProfileDialog } from '../dialogs/EditProfileDialog'
import { useUserProfile } from '../domain/profileStore'
import { TeamAccessTab } from '../components/TeamAccessTab'

export default function AccountSettingsPage() {
  const [profile, setProfile] = useUserProfile()
  const [editOpen, setEditOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'team' ? 'team' : 'profile'

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

  function showToast(message: string) {
    setToastMessage(message)
  }

  return (
    <div className="flex w-full flex-col gap-6 text-left">
      <div>
        <h1 className="font-heading text-3xl font-normal tracking-tight text-ink sm:text-4xl">Profile Settings</h1>
        <p className="mt-2 text-sm text-ink-muted">Manage your personal profile and your team's access in one place.</p>
      </div>
      <div className="section-tabs" role="group" aria-label="Settings sections">
        <button type="button" onClick={() => setSearchParams({})} aria-pressed={activeTab === 'profile'} className="section-tab">My Profile</button>
        <button type="button" onClick={() => setSearchParams({ tab: 'team' })} aria-pressed={activeTab === 'team'} className="section-tab">Team &amp; Access</button>
      </div>
      {activeTab === 'profile' ? (
        <section className="w-full max-w-6xl overflow-hidden rounded-xl border border-card-border bg-white">
          <header className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
            <div>
              <h2 className="font-heading text-xl text-ink">Personal Details</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">Your profile information. Team permissions are managed in Team &amp; Access.</p>
            </div>
            <button type="button" onClick={() => setEditOpen(true)} aria-label="Edit personal details" className="flex min-h-11 items-center gap-2 rounded-lg border border-card-border px-4 py-2 text-sm text-ink hover:bg-page-bg">
              <Pencil size={16} aria-hidden="true" />Edit profile
            </button>
          </header>
          <div className="flex flex-col gap-6 px-5 pb-6 sm:flex-row sm:items-center sm:px-6">
            <div className="w-full max-w-44 shrink-0">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-card-border bg-chip-bg">
                <ProfileAvatar src={profile.avatarUrl} alt={profile.fullName} size={176} className="size-full object-cover" />
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} aria-label="Upload file input" />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="profile-photo-action min-h-11 rounded-md border border-card-border px-2 py-2 text-xs font-medium text-brand hover:bg-page-bg">Upload new photo</button>
                <button type="button" onClick={handleRemovePhoto} className="profile-photo-action min-h-11 text-xs text-alert-450 hover:underline">Remove</button>
              </div>
            </div>
            <div className="min-w-0 sm:self-start sm:pt-14">
              <h3 className="break-words font-heading text-xl text-ink">{profile.fullName}</h3>
              {profile.role && profile.role !== profile.fullName && <span className="mt-2 inline-flex rounded bg-chip-bg px-2 py-1 text-xs text-ink-muted">{profile.role}</span>}
            </div>
          </div>
          <dl className="grid gap-x-12 gap-y-6 border-t border-card-border p-5 text-sm sm:grid-cols-2 sm:p-6">
            <div><dt className="text-xs text-ink-muted">Full name</dt><dd className="mt-2 break-words text-ink">{profile.fullName}</dd></div>
            <div><dt className="text-xs text-ink-muted">Email address</dt><dd className="mt-2 break-all text-ink">{profile.emailOrPassword || '—'}</dd></div>
            <div><dt className="text-xs text-ink-muted">Phone number</dt><dd className="mt-2 break-words text-ink">{profile.phone || '—'}</dd></div>
            <div><dt className="text-xs text-ink-muted">Staff ID</dt><dd className="mt-2 break-words text-ink">{profile.staffId || '—'}</dd></div>
            <div><dt className="text-xs text-ink-muted">Username</dt><dd className="mt-2 break-words text-ink">{profile.username}</dd></div>
          </dl>
        </section>
      ) : <TeamAccessTab onNotify={showToast} />}
      {editOpen && <EditProfileDialog profile={profile} onClose={() => setEditOpen(false)} onSave={(updated) => setProfile(updated)} />}
      {toastMessage && (
        <div role="status" className="fixed bottom-4 left-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-avatar-ring bg-white px-5 py-3.5 text-sm shadow-lg sm:left-auto sm:right-6">
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="icon-button text-ink-muted hover:text-ink" aria-label="Dismiss toast"><X size={16} /></button>
        </div>
      )}
    </div>
  )
}
