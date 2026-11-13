import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, updateTenant } from '../api/client'
import type { Tenant } from '../api/types'
import { EditTenantDialog } from './EditTenantDialog'

/**
 * เทสป็อปอัปแก้ข้อมูลผู้เช่า ต่อยอดจากเทสของ QA สาย SSK-107 ที่เคยมีแค่บน dev
 *
 * SSK-136 เพิ่มเรื่องสำคัญที่สุดของฟอร์มนี้ คือ PUT /api/tenants/{id} แทนทั้งก้อน ช่องที่ไม่ส่งไป
 * ถูกล้างที่ backend เดิมฟอร์มไม่ส่งอีเมล แก้เบอร์โทรทีไรอีเมลของผู้เช่าหายทุกครั้ง
 */

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    updateTenant: vi.fn(),
  }
})

const mockedUpdateTenant = vi.mocked(updateTenant)

const tenant: Tenant = {
  id: 3,
  fullName: 'Hiroshi Nakamura',
  email: 'hiroshi.n@example.com',
  phone: '083-456-7890',
  // เลขบัตรบังคับตามคำตัดสินอาจารย์ 11 ก.ย. ผู้เช่าในระบบจึงต้องมีเลขบัตร (checksum ถูกต้อง)
  nationalId: '1100400123450',
  lineId: '@hiroshi',
}

function renderEditTenantDialog(overrides: Partial<Tenant> = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<EditTenantDialog tenant={{ ...tenant, ...overrides }} onClose={onClose} onSaved={onSaved} />)

  return {
    user: userEvent.setup(),
    onClose,
    onSaved,
  }
}

beforeEach(() => {
  mockedUpdateTenant.mockReset()
})

describe('EditTenantDialog', () => {
  it('renders the tenant fields prefilled, without lease fields or a rent input', () => {
    renderEditTenantDialog()

    expect(screen.getByRole('dialog', { name: /Edit Tenant Information/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/i)).toHaveValue('Hiroshi Nakamura')
    expect(screen.getByLabelText(/Phone number/i)).toHaveValue('083-456-7890')
    expect(screen.getByLabelText(/National ID/i)).toHaveValue('1 1004 00123 45 0')
    expect(screen.getByLabelText(/Line ID/i)).toHaveValue('@hiroshi')
    expect(screen.getByLabelText(/^Email$/i)).toHaveValue('hiroshi.n@example.com')

    // SSK-136 Lease Period and Room Type belong to the lease, not the tenant.
    expect(screen.queryByLabelText(/Start Date/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Room Type/i)).not.toBeInTheDocument()
    // SSK-107 removed manual rent entry from the edit form as well.
    expect(screen.queryByLabelText(/rent/i)).not.toBeInTheDocument()
  })

  it('closes without saving when the admin cancels', async () => {
    const { user, onClose, onSaved } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/Full name/i))
    await user.type(screen.getByLabelText(/Full name/i), 'Edited Tenant')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockedUpdateTenant).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submits every tenant field, including the untouched email, and closes the dialog', async () => {
    mockedUpdateTenant.mockResolvedValue({ ...tenant, fullName: 'Edited Tenant', phone: '089-999-8888' })
    const { user, onClose, onSaved } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/Full name/i))
    await user.type(screen.getByLabelText(/Full name/i), '  Edited Tenant  ')
    await user.clear(screen.getByLabelText(/Phone number/i))
    await user.type(screen.getByLabelText(/Phone number/i), '0899998888')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      // PUT replaces the whole tenant: a missing email would be wiped on the real backend (SSK-136).
      expect(mockedUpdateTenant).toHaveBeenCalledWith(tenant.id, {
        fullName: 'Edited Tenant',
        phone: '089-999-8888',
        nationalId: '1100400123450',
        lineId: '@hiroshi',
        email: 'hiroshi.n@example.com',
      })
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sends null when the admin clears the email on purpose', async () => {
    mockedUpdateTenant.mockResolvedValue({ ...tenant, email: null })
    const { user } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/^Email$/i))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockedUpdateTenant).toHaveBeenCalledWith(tenant.id, expect.objectContaining({ email: null }))
    })
  })

  it('opens a tenant who has no email yet with an empty field instead of crashing', async () => {
    mockedUpdateTenant.mockResolvedValue({ ...tenant, email: null })
    const { user } = renderEditTenantDialog({ email: null })

    expect(screen.getByLabelText(/^Email$/i)).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockedUpdateTenant).toHaveBeenCalledWith(tenant.id, expect.objectContaining({ email: null }))
    })
  })

  it('rejects a malformed email with the same sentence as the backend', async () => {
    const { user, onSaved } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/^Email$/i))
    await user.type(screen.getByLabelText(/^Email$/i), 'hiroshi.example.com')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That email address is not valid')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('keeps the dialog open and shows the API error when saving fails', async () => {
    mockedUpdateTenant.mockRejectedValue(new ApiError(500, 'Could not update tenant information'))
    const { user, onClose, onSaved } = renderEditTenantDialog()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update tenant information')
    expect(screen.getByRole('dialog', { name: /Edit Tenant Information/i })).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('validates phone numbers before saving', async () => {
    const { user, onClose, onSaved } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/Phone number/i))
    await user.type(screen.getByLabelText(/Phone number/i), '123')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('10')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('validates National ID before saving', async () => {
    const { user, onClose, onSaved } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/National ID/i))
    await user.type(screen.getByLabelText(/National ID/i), '12345')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('13')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lists every problem at once instead of one per try', async () => {
    const { user } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/Full name/i))
    await user.clear(screen.getByLabelText(/Phone number/i))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Please enter the full name')
    expect(alert).toHaveTextContent('Please enter the phone number')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
  })

  it('rejects a 13-digit national ID whose check digit is wrong', async () => {
    const { user } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/National ID/i))
    await user.type(screen.getByLabelText(/National ID/i), '1100400123451')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Thai National ID checksum')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
  })

  it('groups a national ID as it is typed, the way it is printed on the card', async () => {
    const { user } = renderEditTenantDialog()
    const id = screen.getByLabelText(/National ID/i)

    await user.clear(id)
    await user.type(id, '1100400123')
    expect(id).toHaveValue('1 1004 00123')
    await user.type(id, '45')
    expect(id).toHaveValue('1 1004 00123 45')
  })

  // มีตัวอักษรเมื่อไหร่ก็เป็นพาสปอร์ต แม้จะบังเอิญมีตัวเลขครบ 13 ตัวเหมือนบัตรประชาชน
  it.each([
    ['aa1234567', 'AA1234567'],
    ['ab1234567890123', 'AB1234567890123'],
  ])('opens the passport holder %s on the Passport option with the number in capitals', (stored, shown) => {
    renderEditTenantDialog({ nationalId: stored })

    expect(screen.getByRole('radio', { name: /Passport/i })).toBeChecked()
    expect(screen.getByLabelText(/Passport number/i)).toHaveValue(shown)
    expect(screen.queryByLabelText(/National ID/i)).not.toBeInTheDocument()
  })

  it('clears the number when the ID type changes, and asks for the one now chosen', async () => {
    const { user } = renderEditTenantDialog()

    await user.click(screen.getByRole('radio', { name: /Passport/i }))
    expect(screen.getByLabelText(/Passport number/i)).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the passport number')

    await user.click(screen.getByRole('radio', { name: /Thai ID/i }))
    expect(screen.getByLabelText(/National ID/i)).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Please enter the national ID'))
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
  })

  it('rejects a passport number shorter than six characters', async () => {
    const { user } = renderEditTenantDialog()

    await user.click(screen.getByRole('radio', { name: /Passport/i }))
    await user.type(screen.getByLabelText(/Passport number/i), 'AB123')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Passport number must be 6–20 alphanumeric characters')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
  })

  it('keeps only letters and digits of a passport number, in capitals, and saves it that way', async () => {
    mockedUpdateTenant.mockResolvedValue({ ...tenant, nationalId: 'AB123456' })
    const { user } = renderEditTenantDialog()

    await user.click(screen.getByRole('radio', { name: /Passport/i }))
    await user.type(screen.getByLabelText(/Passport number/i), 'ab-12 3456')
    expect(screen.getByLabelText(/Passport number/i)).toHaveValue('AB123456')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    // ส่งครบทุกช่องเสมอ เพราะ PUT แทนทั้งก้อน (SSK-136)
    await waitFor(() =>
      expect(mockedUpdateTenant).toHaveBeenCalledWith(tenant.id, {
        fullName: 'Hiroshi Nakamura',
        phone: '083-456-7890',
        nationalId: 'AB123456',
        lineId: '@hiroshi',
        email: 'hiroshi.n@example.com',
      }),
    )
  })

  it('sends the edited Line ID trimmed', async () => {
    mockedUpdateTenant.mockResolvedValue(tenant)
    const { user } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/Line ID/i))
    await user.type(screen.getByLabelText(/Line ID/i), ' @hiroshi.new ')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mockedUpdateTenant).toHaveBeenCalledWith(tenant.id, {
        fullName: 'Hiroshi Nakamura',
        phone: '083-456-7890',
        nationalId: '1100400123450',
        lineId: '@hiroshi.new',
        email: 'hiroshi.n@example.com',
      }),
    )
  })

  it('sends null when the Line ID is cleared, so the backend removes it', async () => {
    mockedUpdateTenant.mockResolvedValue({ ...tenant, lineId: null })
    const { user } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/Line ID/i))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mockedUpdateTenant).toHaveBeenCalledWith(tenant.id, {
        fullName: 'Hiroshi Nakamura',
        phone: '083-456-7890',
        nationalId: '1100400123450',
        lineId: null,
        email: 'hiroshi.n@example.com',
      }),
    )
  })

  it('says the update failed in plain words when the error did not come from the API', async () => {
    mockedUpdateTenant.mockRejectedValue(new TypeError('Failed to fetch'))
    const { user, onClose, onSaved } = renderEditTenantDialog()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update tenant information')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('EditTenantDialog ID types and empty fields', () => {
  beforeEach(() => {
    mockedUpdateTenant.mockReset()
  })

  it('opens a tenant whose ID is not a Thai ID on the passport field and saves it upper-case', async () => {
    mockedUpdateTenant.mockResolvedValue({ ...tenant, nationalId: 'AB123456' })
    const { user, onSaved } = renderEditTenantDialog({ nationalId: 'ab123456', lineId: null })

    expect(screen.getByLabelText('Passport number')).toHaveValue('AB123456')
    await user.type(screen.getByLabelText('Passport number'), '-x')
    expect(screen.getByLabelText('Passport number')).toHaveValue('AB123456X')
    await user.type(screen.getByLabelText('Line ID'), '@new')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockedUpdateTenant).toHaveBeenCalledWith(3, expect.objectContaining({ nationalId: 'AB123456X', lineId: '@new' }))
  })

  it('clears the number when switching between Thai ID and passport', async () => {
    const { user } = renderEditTenantDialog()

    await user.click(screen.getByRole('radio', { name: 'Passport' }))
    expect(screen.getByLabelText('Passport number')).toHaveValue('')
    await user.click(screen.getByRole('radio', { name: 'Thai ID' }))
    expect(screen.getByLabelText('National ID')).toHaveValue('')
  })

  it('lists every missing field at once', async () => {
    const { user } = renderEditTenantDialog({ fullName: '', phone: '', nationalId: null })

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Please enter the full name')
    expect(alert).toHaveTextContent('Please enter the phone number')
    expect(alert).toHaveTextContent('Please enter the national ID')
  })

  it('asks for the passport number, and checks its format', async () => {
    const { user } = renderEditTenantDialog()
    await user.click(screen.getByRole('radio', { name: 'Passport' }))

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the passport number')

    await user.type(screen.getByLabelText('Passport number'), 'AB1')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Passport number must be 6–20 alphanumeric characters')
  })

  it('rejects a 13-digit Thai ID with a wrong check digit', async () => {
    const { user } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText('National ID'))
    await user.type(screen.getByLabelText('National ID'), '1100400123451')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Thai National ID checksum')
  })

  it('formats the Thai ID in groups while typing', async () => {
    const { user } = renderEditTenantDialog()
    const field = screen.getByLabelText('National ID')

    await user.clear(field)
    await user.type(field, '1')
    expect(field).toHaveValue('1')
    await user.type(field, '1004')
    expect(field).toHaveValue('1 1004')
    await user.type(field, '00123')
    expect(field).toHaveValue('1 1004 00123')
    await user.type(field, '45')
    expect(field).toHaveValue('1 1004 00123 45')
  })
})
