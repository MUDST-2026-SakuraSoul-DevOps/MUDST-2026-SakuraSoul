import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, deleteTenant } from '../api/client'
import type { Tenant } from '../api/types'
import { DeleteTenantDialog } from './DeleteTenantDialog'

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    deleteTenant: vi.fn(),
  }
})

const mockedDeleteTenant = vi.mocked(deleteTenant)

const tenant: Tenant = {
  id: 6,
  fullName: 'Haruto Watanabe',
  email: 'thanakrit.w@example.com',
  phone: '086-789-0123',
  nationalId: null,
}

function renderDeleteTenantDialog() {
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(<DeleteTenantDialog tenant={tenant} onClose={onClose} onDeleted={onDeleted} />)

  return {
    user: userEvent.setup(),
    onClose,
    onDeleted,
  }
}

beforeEach(() => {
  mockedDeleteTenant.mockReset()
})

describe('DeleteTenantDialog', () => {
  it('closes without deleting when the admin cancels', async () => {
    const { user, onClose, onDeleted } = renderDeleteTenantDialog()

    // Cancel must be safe because deleting tenant data is a destructive action.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockedDeleteTenant).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('deletes the tenant and notifies the page after confirming', async () => {
    mockedDeleteTenant.mockResolvedValue({ success: true })
    const { user, onClose, onDeleted } = renderDeleteTenantDialog()

    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }))

    await waitFor(() => {
      expect(mockedDeleteTenant).toHaveBeenCalledWith(tenant.id)
    })
    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the dialog open and shows the API error when delete fails', async () => {
    mockedDeleteTenant.mockRejectedValue(new ApiError(409, 'Cannot delete tenant with an active lease'))
    const { user, onClose, onDeleted } = renderDeleteTenantDialog()

    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot delete tenant with an active lease')
    expect(screen.getByRole('dialog', { name: /Confirm Delete Tenant Information/i })).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
