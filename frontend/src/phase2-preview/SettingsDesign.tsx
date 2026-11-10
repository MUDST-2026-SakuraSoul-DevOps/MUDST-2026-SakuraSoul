import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { PeopleDesign } from './OperationsDesign'
import { Actions, Badge, Card, Dialog, Field, SecondaryButton, Tabs } from './shared'

type PreviewProfile = { fullName: string; email: string; phone: string }

export function SettingsDesign({ profile, onProfileChange, notify }: {
  profile: PreviewProfile
  onProfileChange: (profile: PreviewProfile) => void
  notify: (message: string) => void
}) {
  const [search, setSearch] = useSearchParams()
  const tab = search.get('tab') === 'team' ? 'Team & Access' : 'My Profile'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile)

  return <>
    <Tabs options={['My Profile', 'Team & Access']} active={tab} onChange={value => setSearch(value === 'Team & Access' ? { tab: 'team' } : {})} />
    <div hidden={tab !== 'My Profile'}>
      <Card title="Personal Details" description="Your profile information. Team permissions are managed in Team & Access." actions={<SecondaryButton onClick={() => { setDraft(profile); setEditing(true) }}><Pencil size={17} aria-hidden="true" />Edit profile</SecondaryButton>}>
        <div className="p2-profile-details">
          <div className="p2-profile-identity"><div className="p2-avatar">{profile.fullName.split(/\s+/).map(part => part[0]).slice(0,2).join('')}</div><div><h3>{profile.fullName}</h3><Badge>Manager</Badge></div></div>
          <dl><div><dt>Full name</dt><dd>{profile.fullName}</dd></div><div><dt>Email address</dt><dd>{profile.email}</dd></div><div><dt>Phone number</dt><dd>{profile.phone || 'Not provided'}</dd></div><div><dt>Staff ID</dt><dd>SS-001 · Sample profile</dd></div></dl>
        </div>
      </Card>
    </div>
    <div hidden={tab !== 'Team & Access'} className="p2-settings-team"><PeopleDesign permissions notify={notify} /></div>
    {editing && <Dialog title="Edit profile" subtitle="Sample profile · Changes apply only to this preview." onClose={() => setEditing(false)}><form onSubmit={e => { e.preventDefault(); onProfileChange({ ...draft, fullName: draft.fullName.trim() }); setEditing(false); notify('Profile updated in this preview only.') }}>
      <div className="p2-form-grid"><Field label="Full name"><input required pattern=".*\S.*" maxLength={80} value={draft.fullName} onChange={e => setDraft({ ...draft, fullName: e.target.value })} /></Field><Field label="Email address"><input type="email" required value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></Field><Field label="Phone number (optional)"><input type="tel" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} /></Field></div>
      <Actions onCancel={() => setEditing(false)} label="Save profile" />
    </form></Dialog>}
  </>
}
