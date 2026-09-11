import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, updateTenant } from '../api/client'
import type { Tenant } from '../api/types'
import { EditTenantDialog } from './EditTenantDialog'

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    updateTenant: vi.fn(),
  }
})

const mockedUpdateTenant = vi.mocked(updateTenant)

const tenant: Tenant & {
  lineId?: string
  startDate?: string
  endDate?: string
  leasePeriod?: string
  rent?: number | string
  roomType?: string
} = {
  id: 3,
  fullName: 'Hiroshi Nakamura',
  email: 'hiroshi.n@example.com',
  phone: '083-456-7890',
  nationalId: null,
  lineId: '@hiroshi',
  startDate: '2026-07-21',
  endDate: '2026-08-31',
  leasePeriod: '2026-07-21 – 2026-08-31',
  rent: 3800,
  roomType: 'Single Bedroom',
}

function renderEditTenantDialog(overrides: Partial<typeof tenant> = {}) {
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
  it('renders editable tenant fields with lease dates and no rent input', () => {
    renderEditTenantDialog()

    expect(screen.getByRole('dialog', { name: /Edit Tenant Information/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/i)).toHaveValue('Hiroshi Nakamura')
    expect(screen.getByLabelText(/Phone number/i)).toHaveValue('083-456-7890')
    expect(screen.getByLabelText(/National ID/i)).toHaveValue('')
    expect(screen.getByLabelText(/Line ID/i)).toHaveValue('@hiroshi')
    expect(screen.getByLabelText(/Start Date/i)).toHaveValue('2026-07-21')
    expect(screen.getByLabelText(/End Date/i)).toHaveValue('2026-08-31')
    expect(screen.getByLabelText(/Room Type/i)).toHaveValue('Single Bedroom')

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

  it('submits updated tenant information and closes the dialog', async () => {
    mockedUpdateTenant.mockResolvedValue({ ...tenant, fullName: 'Edited Tenant', phone: '089-999-8888' })
    const { user, onClose, onSaved } = renderEditTenantDialog()

    await user.clear(screen.getByLabelText(/Full name/i))
    await user.type(screen.getByLabelText(/Full name/i), '  Edited Tenant  ')
    await user.clear(screen.getByLabelText(/Phone number/i))
    await user.type(screen.getByLabelText(/Phone number/i), '0899998888')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockedUpdateTenant).toHaveBeenCalledWith(tenant.id, {
        fullName: 'Edited Tenant',
        phone: '089-999-8888',
        nationalId: null,
      })
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
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

    await user.type(screen.getByLabelText(/National ID/i), '12345')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('13')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
