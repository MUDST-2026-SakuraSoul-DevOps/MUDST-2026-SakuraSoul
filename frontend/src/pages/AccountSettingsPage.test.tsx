import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, beforeEach } from 'vitest'
import type { AuthUser } from '../api/types'
import { syncProfileWithUser } from '../domain/profileStore'
import AccountSettingsPage from './AccountSettingsPage'

// หน้านี้อยู่หลัง RequireAuth เสมอ จึงไม่มีทางถูกเปิดตอนยังไม่ได้ล็อกอิน
// เทสจึงเติมโปรไฟล์จากคนที่ล็อกอินอยู่ก่อน เหมือนที่ของจริงทำ
const SIGNED_IN: AuthUser = {
  username: 'admin',
  displayName: 'Somchai P.',
  email: 'somchai@sakurasoul.co.jp',
  phone: '+81 90-0000-0000',
}

function renderAccountSettings() {
  return render(
    <MemoryRouter>
      <AccountSettingsPage />
    </MemoryRouter>,
  )
}

describe('AccountSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    syncProfileWithUser(SIGNED_IN)
  })

  it('renders account settings page with profile and personal details cards', () => {
    renderAccountSettings()

    expect(screen.getByRole('heading', { name: 'Account Settings' })).toBeInTheDocument()
    expect(
      screen.getByText('Manage your personal profile, account credentials, and system preferences.'),
    ).toBeInTheDocument()

    // Profile card
    expect(screen.getByRole('heading', { name: 'Somchai P.' })).toBeInTheDocument()
    expect(screen.getByText('Administrator')).toBeInTheDocument()
    expect(screen.getByText('Staff ID')).toBeInTheDocument()
    // ไม่มีรหัสพนักงานมาจาก API จึงโชว์ขีด ไม่ใช่รหัสที่แต่งขึ้นให้ทุกคนเหมือนกัน
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload new photo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()

    // Personal details card
    expect(screen.getByRole('heading', { name: 'Personal Details' })).toBeInTheDocument()
    expect(screen.getByText('USERNAME')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('PASSWORD')).toBeInTheDocument()
    expect(screen.getByText('somchai@sakurasoul.co.jp')).toBeInTheDocument()
    expect(screen.getByText('PHONE NUMBER')).toBeInTheDocument()
    expect(screen.getByText('+81 90-0000-0000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit personal details/i })).toBeInTheDocument()
  })

  it('opens edit modal and updates personal details', async () => {
    const user = userEvent.setup()
    renderAccountSettings()

    await user.click(screen.getByRole('button', { name: /edit personal details/i }))

    expect(screen.getByRole('heading', { name: 'Edit Personal Details' })).toBeInTheDocument()

    const usernameInput = screen.getByLabelText('Username')
    await user.clear(usernameInput)
    await user.type(usernameInput, 'HarukaAdmin')

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(screen.queryByRole('heading', { name: 'Edit Personal Details' })).not.toBeInTheDocument()
    expect(screen.getByText('HarukaAdmin')).toBeInTheDocument()
  })

  it('allows removing profile photo to reset to default', async () => {
    const user = userEvent.setup()
    renderAccountSettings()

    await user.click(screen.getByRole('button', { name: /remove/i }))
    expect(screen.getByRole('heading', { name: 'Somchai P.' })).toBeInTheDocument()
  })

  /**
   * แอดมินที่ตั้งจาก environment variable ตอบ email กับ phone เป็น null ทั้งคู่
   * ทั้งฝั่ง dev และ mock จึงเป็นหน้าตาปกติที่คนส่วนใหญ่เจอ ไม่ใช่เคสหายาก
   */
  it('shows a dash instead of the word null when the admin has no contact details', () => {
    localStorage.clear()
    syncProfileWithUser({ ...SIGNED_IN, email: null, phone: null })
    renderAccountSettings()

    expect(screen.queryByText('null')).not.toBeInTheDocument()
    // รหัสพนักงาน อีเมล และเบอร์โทร ว่างพร้อมกันทั้งสามช่อง
    expect(screen.getAllByText('—')).toHaveLength(3)
  })
})
