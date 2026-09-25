import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, updateTenant } from '../api/client'
import type { Tenant } from '../api/types'
import { EditTenantDialog } from './EditTenantDialog'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, updateTenant: vi.fn() }
})

const mockedUpdateTenant = vi.mocked(updateTenant)
const tenant: Tenant & { lineId: string; startDate: string; endDate: string; roomType: string } = {
  id: 3,
  fullName: 'Hiroshi Nakamura',
  email: 'hiroshi.n@example.com',
  phone: '083-456-7890',
  nationalId: '1100400123450',
  lineId: '@hiroshi',
  startDate: '2026-07-21',
  endDate: '2026-08-31',
  roomType: 'Single Bedroom',
}

function renderDialog() {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<EditTenantDialog tenant={tenant} onClose={onClose} onSaved={onSaved} />)
  return { user: userEvent.setup(), onClose, onSaved }
}

beforeEach(() => {
  mockedUpdateTenant.mockReset()
})

describe('EditTenantDialog', () => {
  it('loads the tenant fields without a manual rent input', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Edit Tenant Information' })).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveValue('Hiroshi Nakamura')
    expect(screen.getByLabelText('Phone number')).toHaveValue('083-456-7890')
    expect(screen.getByLabelText('Line ID')).toHaveValue('@hiroshi')
    expect(screen.getByLabelText('Start Date')).toHaveValue('2026-07-21')
    expect(screen.getByLabelText('End Date')).toHaveValue('2026-08-31')
    expect(screen.getByLabelText('Room Type')).toHaveValue('Single Bedroom')
    expect(screen.queryByLabelText(/rent/i)).not.toBeInTheDocument()
  })

  it('closes without saving when canceled', async () => {
    const { user, onClose, onSaved } = renderDialog()
    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), 'Edited Tenant')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockedUpdateTenant).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('sends the edited tenant details and closes after a successful save', async () => {
    mockedUpdateTenant.mockResolvedValue({ ...tenant, fullName: 'Edited Tenant', phone: '089-999-8888' })
    const { user, onClose, onSaved } = renderDialog()

    await user.clear(screen.getByLabelText('Full name'))
    await user.type(screen.getByLabelText('Full name'), '  Edited Tenant  ')
    await user.clear(screen.getByLabelText('Phone number'))
    await user.type(screen.getByLabelText('Phone number'), '0899998888')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockedUpdateTenant).toHaveBeenCalledExactlyOnceWith(tenant.id, {
      fullName: 'Edited Tenant',
      phone: '089-999-8888',
      nationalId: '1100400123450',
      lineId: '@hiroshi',
      startDate: '2026-07-21',
      endDate: '2026-08-31',
      roomType: 'Single Bedroom',
    }))
    expect(onSaved).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps the dialog open and shows the API error when saving fails', async () => {
    mockedUpdateTenant.mockRejectedValue(new ApiError(500, 'Could not update tenant information'))
    const { user, onClose, onSaved } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update tenant information')
    expect(screen.getByRole('dialog', { name: 'Edit Tenant Information' })).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('rejects an incomplete phone number before calling the API', async () => {
    const { user, onClose } = renderDialog()
    await user.clear(screen.getByLabelText('Phone number'))
    await user.type(screen.getByLabelText('Phone number'), '123')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Phone number must be 10 digits')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('rejects an incomplete national ID before calling the API', async () => {
    const { user, onClose } = renderDialog()
    await user.clear(screen.getByLabelText('National ID'))
    await user.type(screen.getByLabelText('National ID'), '12345')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Thai National ID must be 13 digits')
    expect(mockedUpdateTenant).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
