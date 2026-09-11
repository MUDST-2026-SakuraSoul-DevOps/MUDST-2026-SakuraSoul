import { useState, useEffect } from 'react'
import type { UserProfile } from '../dialogs/EditProfileDialog'

const DEFAULT_PROFILE: UserProfile = {
  fullName: 'Haruka S.',
  role: 'Property Manager',
  staffId: 'SS-882',
  username: 'Haruka',
  emailOrPassword: 'haruka.s@sakurasoul.co.jp',
  phone: '+81 90-1234-5678',
  avatarUrl: '/haruka-avatar.png',
}

const STORAGE_KEY = 'sakura_soul_user_profile'
const EVENT_KEY = 'sakura_soul_profile_updated'

export function getStoredProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }
    }
  } catch {
    // Ignore JSON parse errors and return default
  }
  return DEFAULT_PROFILE
}

export function saveStoredProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    window.dispatchEvent(new Event(EVENT_KEY))
  } catch {
    // Ignore storage write errors
  }
}

export function useUserProfile(): [UserProfile, (profile: UserProfile) => void] {
  const [profile, setProfile] = useState<UserProfile>(getStoredProfile)

  useEffect(() => {
    function handleUpdate() {
      setProfile(getStoredProfile())
    }
    window.addEventListener(EVENT_KEY, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(EVENT_KEY, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const updateProfile = (newProfile: UserProfile) => {
    saveStoredProfile(newProfile)
    setProfile(newProfile)
  }

  return [profile, updateProfile]
}
