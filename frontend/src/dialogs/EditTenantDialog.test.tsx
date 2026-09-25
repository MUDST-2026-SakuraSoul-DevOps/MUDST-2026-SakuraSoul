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
})
