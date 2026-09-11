import { useState, useEffect } from 'react'
import type { AuthUser } from '../api/types'
import type { UserProfile } from '../dialogs/EditProfileDialog'

/**
 * โปรไฟล์เปล่าสำหรับตอนที่ยังไม่มีใครล็อกอิน
 *
 * ห้ามใส่ชื่อ อีเมล หรือรูปของคนจริง ๆ ไว้ตรงนี้ เพราะค่าตั้งต้นจะโผล่บน sidebar
 * และหน้า Account Settings ทันทีที่เปิดแอป กลายเป็นโชว์ข้อมูลของคนที่ไม่ได้ล็อกอิน
 *
 * จงใจไม่มีคีย์ avatarUrl เลย ไม่ใช่ตั้งเป็น undefined เฉย ๆ เพราะ getStoredProfile
 * กาง object นี้เป็นฐานแล้วทับด้วยของที่เก็บไว้ ซึ่ง JSON.stringify ตัดคีย์ที่เป็น
 * undefined ทิ้ง ถ้าฐานมีรูปตั้งต้นอยู่ รูปที่ผู้ใช้เพิ่งกดลบจะกลับมาเองรอบหน้า
 */
const EMPTY_PROFILE: UserProfile = {
  fullName: '',
  role: '',
  staffId: '',
  username: '',
  emailOrPassword: '',
  phone: '',
}

const STORAGE_KEY = 'sakura_soul_user_profile'
const EVENT_KEY = 'sakura_soul_profile_updated'

/**
 * กุญแจแยกต่างหากสำหรับจำว่าโปรไฟล์ที่เก็บไว้เป็นของ account ไหน
 *
 * ต้องเก็บแยกจากตัวโปรไฟล์ เพราะ UserProfile.username ผู้ใช้แก้เองได้ใน
 * EditProfileDialog ถ้าเอาฟิลด์นั้นมาเทียบ พอผู้ใช้เปลี่ยนชื่อตัวเองปุ๊บ รอบหน้า
 * จะดูเหมือนเป็นคนละคนแล้วล้างของที่เขาเพิ่งแก้ทิ้ง ค่าที่เก็บตรงนี้คือ username
 * จาก server เท่านั้น ซึ่งหน้าเว็บไม่มีทางแก้ได้
 */
const OWNER_KEY = 'sakura_soul_profile_owner'

/**
 * อ่านโปรไฟล์ที่เก็บไว้ ถ้าไม่มีหรือพังคืนโปรไฟล์เปล่า
 *
 * คืนสำเนาใหม่เสมอ ไม่ยื่น EMPTY_PROFILE ตัวจริงออกไป ไม่งั้นใครเผลอแก้ค่าใน
 * object ที่ได้ไป ก็เท่ากับแก้ค่าตั้งต้นของทั้งโมดูลไปด้วย
 */
export function getStoredProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return { ...EMPTY_PROFILE, ...JSON.parse(raw) }
    }
  } catch {
    // Ignore JSON parse errors and return the empty profile
  }
  return { ...EMPTY_PROFILE }
}

/** บันทึกโปรไฟล์ แล้วบอกทุก component ที่ mount อยู่ให้วาดใหม่ */
export function saveStoredProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    window.dispatchEvent(new Event(EVENT_KEY))
  } catch {
    // Ignore storage write errors
  }
}

/**
 * แปลงผู้ใช้ที่ล็อกอินอยู่ (GET /auth/me) ให้เป็นโปรไฟล์ตั้งต้น
 *
 * email กับ phone เป็น null ได้ (แอดมินที่ตั้งจาก environment variable ยังไม่มี
 * ข้อมูลติดต่อ) ต้องกลายเป็นสตริงว่าง ไม่ใช่ปล่อยให้คำว่า "null" ไปโผล่บนหน้าจอ
 *
 * role / staffId / avatarUrl ไม่มีที่มาจาก API เลย จึงตั้ง role เป็น
 * 'Administrator' ซึ่งเป็นความจริงเรื่องสิทธิ์ที่เขามี ไม่ใช่ตำแหน่งงานที่แต่งขึ้น
 * ส่วน staffId ปล่อยว่างไว้ ดีกว่าแจกรหัสพนักงานปลอมให้ทุกคน และไม่ใส่ avatarUrl
 * เลย เพื่อให้ตกไปที่ตัวย่อของชื่อแทนรูป
 */
export function profileFromAuthUser(user: AuthUser): UserProfile {
  return {
    fullName: user.displayName,
    role: 'Administrator',
    staffId: '',
    username: user.username,
    emailOrPassword: user.email ?? '',
    phone: user.phone ?? '',
  }
}

/**
 * เติมโปรไฟล์ให้ตรงกับคนที่เพิ่งล็อกอิน โดยไม่ทับของที่เขาแก้เอง
 *
 * เรียกทุกครั้งที่เปิดแอป (รวมถึงกด refresh) จึงต้องแยกสองกรณีให้ขาด
 * - ยังไม่มีของเก็บไว้ หรือของที่เก็บไว้เป็นของ account อื่น → สร้างใหม่จาก server
 * - เป็นของ account เดิม → ไม่แตะเลย ไม่งั้นสิ่งที่เขาแก้ไว้จะหายทุกครั้งที่ refresh
 *
 * กรณี account อื่นสำคัญที่สุด เครื่องที่ใช้ร่วมกันจะได้ไม่เอาชื่อ อีเมล เบอร์โทร
 * และรูปของคนก่อนหน้ามาโชว์ให้คนใหม่เห็น
 *
 * ไม่ต้องเขียนโค้ดย้ายข้อมูลเก่าเพิ่ม เครื่องที่ยังถือของจากเวอร์ชันก่อนจะมีแต่คีย์
 * โปรไฟล์ ไม่มีคีย์เจ้าของ getItem(OWNER_KEY) จึงคืน null ซึ่งไม่มีวันเท่ากับ
 * username ของใคร การล็อกอินครั้งแรกหลังอัปเดตจึงตกเข้าทางเขียนทับเองอัตโนมัติ
 */
export function syncProfileWithUser(user: AuthUser): void {
  let owner: string | null = null
  let hasProfile = false
  try {
    owner = localStorage.getItem(OWNER_KEY)
    hasProfile = localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    // อ่านไม่ได้ก็ถือว่ายังไม่มีอะไรเก็บไว้ แล้วเขียนทับไปเลย
  }

  if (hasProfile && owner === user.username) {
    return
  }

  try {
    localStorage.setItem(OWNER_KEY, user.username)
  } catch {
    // Ignore storage write errors
  }
  saveStoredProfile(profileFromAuthUser(user))
}

/**
 * ล้างโปรไฟล์ทิ้งตอนออกจากระบบ
 *
 * ไม่ล้างคือข้อมูลส่วนตัวรั่ว บนเครื่องที่ใช้ร่วมกัน คนถัดไปที่เปิดแอปจะเห็นชื่อ
 * อีเมล เบอร์โทร และรูปที่คนก่อนหน้าอัปโหลดไว้ ก่อนจะทันได้ล็อกอินด้วยซ้ำ
 *
 * ยิง event นอก try/catch เพื่อให้จอที่ mount อยู่วาดใหม่เสมอ แม้ localStorage
 * จะเขียนไม่ได้ก็ตาม
 */
export function clearStoredProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // Ignore storage removal errors
  }
  window.dispatchEvent(new Event(EVENT_KEY))
}

/** hook อ่าน/เขียนโปรไฟล์ ตามการเปลี่ยนแปลงทั้งในแท็บนี้และแท็บอื่น */
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
