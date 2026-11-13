import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditProfileDialog, type UserProfile } from './EditProfileDialog'

/*
  ป็อปอัปแก้ข้อมูลส่วนตัวในหน้า Account Settings ส่งข้อมูลที่แก้แล้วให้หน้าแม่บันทึกเอง
  ช่องที่ลบจนว่างเก็บค่าเดิมไว้ ไม่บันทึกเป็นค่าว่าง
*/

const profile: UserProfile = {
  fullName: 'Administrator',
  role: 'Property Manager',
  staffId: 'SS-001',
  username: 'admin',
  emailOrPassword: 'admin@sakura-soul.local',
  phone: '+66 81 234 5678',
}

function renderDialog() {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(<EditProfileDialog profile={profile} onClose={onClose} onSave={onSave} />)
  return { onSave, onClose, user: userEvent.setup() }
}

async function replace(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.clear(screen.getByLabelText(label))
  if (value !== '') {
    await user.type(screen.getByLabelText(label), value)
  }
}

describe('EditProfileDialog', () => {
  it('saves every field that was changed, trimmed, and closes', async () => {
    const { onSave, onClose, user } = renderDialog()

    await replace(user, 'Full Name', '  Somchai Jaidee  ')
    await replace(user, 'Role', ' Owner ')
    await replace(user, 'Username', ' somchai ')
    await replace(user, 'Email or Password', ' somchai@example.com ')
    await replace(user, 'Phone Number', ' 081-999-0000 ')
    await user.click(screen.getByRole('button', { name: /^Save Changes/ }))

    expect(onSave).toHaveBeenCalledWith({
      fullName: 'Somchai Jaidee',
      role: 'Owner',
      staffId: 'SS-001',
      username: 'somchai',
      emailOrPassword: 'somchai@example.com',
      phone: '081-999-0000',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the old value of a field that was cleared instead of saving it empty', async () => {
    const { onSave, user } = renderDialog()

    for (const label of ['Full Name', 'Role', 'Username', 'Email or Password', 'Phone Number']) {
      await replace(user, label, '')
    }
    await user.click(screen.getByRole('button', { name: /^Save Changes/ }))

    expect(onSave).toHaveBeenCalledWith(profile)
  })

  it('closes without saving from Cancel', async () => {
    const { onSave, onClose, user } = renderDialog()

    await replace(user, 'Full Name', 'Someone Else')
    await user.click(screen.getByRole('button', { name: /^Cancel/ }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})
