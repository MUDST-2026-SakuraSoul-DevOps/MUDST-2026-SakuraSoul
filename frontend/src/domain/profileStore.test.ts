import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthUser } from '../api/types'
import {
  clearStoredProfile,
  getStoredProfile,
  profileFromAuthUser,
  saveStoredProfile,
  syncProfileWithUser,
  useUserProfile,
} from './profileStore'

/**
 * โมดูลนี้เก็บข้อมูลส่วนตัวของคนที่ล็อกอินไว้ใน localStorage แต่ไม่เคยมีเทสเลย
 *
 * เคสที่สำคัญที่สุดคือเครื่องที่ใช้ร่วมกัน ถ้าจำโปรไฟล์ข้ามคนได้ คนถัดไปจะเห็นชื่อ
 * อีเมล เบอร์โทร และรูปของคนก่อนหน้า ซึ่งไม่ใช่แค่หน้าตาเพี้ยน แต่เป็นข้อมูลรั่ว
 */

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    username: 'admin',
    displayName: 'Somchai P.',
    email: 'somchai@sakurasoul.co.jp',
    phone: '+81 90-0000-0000',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('profileFromAuthUser', () => {
  it('เอาชื่อกับ username มาจาก server ตรง ๆ', () => {
    const profile = profileFromAuthUser(user())

    expect(profile.fullName).toBe('Somchai P.')
    expect(profile.username).toBe('admin')
    expect(profile.emailOrPassword).toBe('somchai@sakurasoul.co.jp')
    expect(profile.phone).toBe('+81 90-0000-0000')
  })

  it('อีเมลกับเบอร์ที่เป็น null กลายเป็นช่องว่าง ไม่ใช่คำว่า null', () => {
    // แอดมินที่ตั้งจาก environment variable ตอบ null ทั้งสองช่อง ซึ่งเป็นค่าปกติ
    // ไม่ใช่เคสหลุดโลก ถ้าไม่แปลง หน้าเว็บจะโชว์คำว่า "null" ให้ผู้ใช้อ่าน
    const profile = profileFromAuthUser(user({ email: null, phone: null }))

    expect(profile.emailOrPassword).toBe('')
    expect(profile.phone).toBe('')
  })

  it('ช่องที่ API ไม่มีให้ ไม่แต่งข้อมูลปลอมขึ้นมา', () => {
    const profile = profileFromAuthUser(user())

    // role บอกระดับสิทธิ์ซึ่งเป็นความจริง ส่วนรหัสพนักงานกับรูปไม่มีที่มา
    expect(profile.role).toBe('Administrator')
    expect(profile.staffId).toBe('')
    expect(profile.avatarUrl).toBeUndefined()
  })
})

describe('syncProfileWithUser', () => {
  it('ยังไม่มีอะไรเก็บไว้ เติมให้จากคนที่ล็อกอินอยู่', () => {
    syncProfileWithUser(user())

    expect(getStoredProfile().fullName).toBe('Somchai P.')
    expect(getStoredProfile().username).toBe('admin')
  })

  it('คนเดิมกลับมา ไม่ทับของที่เขาแก้ไว้', () => {
    syncProfileWithUser(user())
    saveStoredProfile({ ...getStoredProfile(), staffId: 'SS-001', phone: '+81 90-1111-2222' })

    // เท่ากับกด refresh หนึ่งที ซึ่งเกิดบ่อยกว่าการล็อกอินใหม่มาก
    syncProfileWithUser(user())

    expect(getStoredProfile().staffId).toBe('SS-001')
    expect(getStoredProfile().phone).toBe('+81 90-1111-2222')
  })

  it('คนละ account เริ่มใหม่หมด ไม่เหลือร่องรอยของคนก่อนหน้า', () => {
    syncProfileWithUser(user())
    saveStoredProfile({
      ...getStoredProfile(),
      phone: '+81 90-1111-2222',
      avatarUrl: 'data:image/png;base64,AAAA',
    })

    syncProfileWithUser(user({ username: 'manager', displayName: 'Kanya T.', email: null, phone: null }))

    const profile = getStoredProfile()
    expect(profile.fullName).toBe('Kanya T.')
    expect(profile.username).toBe('manager')
    expect(profile.phone).toBe('')
    expect(profile.avatarUrl).toBeUndefined()
  })

  it('ผู้ใช้เปลี่ยน username ของตัวเอง แล้ว refresh ของที่แก้ไว้ต้องยังอยู่', () => {
    // กับดัก: UserProfile.username แก้เองได้ใน EditProfileDialog ถ้าเอาฟิลด์นั้น
    // มาเทียบว่าเป็นคนเดิมไหม พอเขาเปลี่ยนชื่อ ระบบจะนึกว่าเป็นคนละคนแล้วล้างทิ้ง
    syncProfileWithUser(user())
    saveStoredProfile({ ...getStoredProfile(), username: 'somchai.p', staffId: 'SS-001' })

    syncProfileWithUser(user())

    expect(getStoredProfile().username).toBe('somchai.p')
    expect(getStoredProfile().staffId).toBe('SS-001')
  })

  it('ของเก่าจากเวอร์ชันก่อนที่ยังไม่มีคีย์เจ้าของ ถูกเขียนทับให้เอง', () => {
    // ไม่ได้เขียนโค้ดย้ายข้อมูลไว้ เพราะคีย์เจ้าของที่หายไปอ่านได้เป็น null
    // ซึ่งไม่มีวันตรงกับ username ของใคร จึงตกเข้าทางเขียนทับอยู่แล้ว
    localStorage.setItem(
      'sakura_soul_user_profile',
      JSON.stringify({ fullName: 'Someone Else', username: 'someone', phone: '+81 90-9999-9999' }),
    )

    syncProfileWithUser(user())

    expect(getStoredProfile().fullName).toBe('Somchai P.')
    expect(getStoredProfile().phone).toBe('+81 90-0000-0000')
  })

  it('มีแต่คีย์เจ้าของ แต่โปรไฟล์หาย ต้องเติมใหม่ ไม่ใช่ปล่อยว่างตลอดไป', () => {
    syncProfileWithUser(user())
    localStorage.removeItem('sakura_soul_user_profile')

    syncProfileWithUser(user())

    expect(getStoredProfile().fullName).toBe('Somchai P.')
  })
})

describe('clearStoredProfile', () => {
  it('ลบของที่เก็บไว้จริง ไม่ใช่แค่ทับด้วยค่าว่าง', () => {
    syncProfileWithUser(user())
    expect(localStorage.getItem('sakura_soul_user_profile')).not.toBeNull()

    clearStoredProfile()

    expect(localStorage.getItem('sakura_soul_user_profile')).toBeNull()
    expect(getStoredProfile().fullName).toBe('')
    expect(getStoredProfile().avatarUrl).toBeUndefined()
  })

  it('ล้างคีย์เจ้าของด้วย คนเดิมล็อกอินกลับมาจึงได้ของสดจาก server', () => {
    syncProfileWithUser(user())
    saveStoredProfile({ ...getStoredProfile(), staffId: 'SS-001' })

    clearStoredProfile()
    syncProfileWithUser(user())

    expect(getStoredProfile().staffId).toBe('')
  })
})

describe('useUserProfile', () => {
  it('จอที่เปิดค้างอยู่วาดใหม่ตามทั้งตอนเติมและตอนล้าง', () => {
    // ไม่ได้เทสชื่อ event ตรง ๆ เพราะมันเป็นรายละเอียดภายในของโมดูล สิ่งที่ต้องจริง
    // คือ component ที่ mount อยู่แล้วต้องเห็นค่าใหม่โดยไม่ต้อง reload หน้า
    const { result } = renderHook(() => useUserProfile())

    expect(result.current[0].fullName).toBe('')

    act(() => {
      syncProfileWithUser(user())
    })
    expect(result.current[0].fullName).toBe('Somchai P.')

    act(() => {
      clearStoredProfile()
    })
    expect(result.current[0].fullName).toBe('')
  })

  it('บันทึกผ่าน hook แล้วอ่านกลับมาได้ค่าเดิม', () => {
    syncProfileWithUser(user())
    const { result } = renderHook(() => useUserProfile())

    act(() => {
      result.current[1]({ ...result.current[0], staffId: 'SS-042' })
    })

    expect(result.current[0].staffId).toBe('SS-042')
    expect(getStoredProfile().staffId).toBe('SS-042')
  })
})
