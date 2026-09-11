import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createTenant } from '../api/client'
import { AddTenantDialog } from './AddTenantDialog'

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    createTenant: vi.fn(),
  }
})

const mockedCreateTenant = vi.mocked(createTenant)

function renderAddTenantDialog() {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(<AddTenantDialog onClose={onClose} onCreated={onCreated} />)

  return {
    user: userEvent.setup(),
    onClose,
    onCreated,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AddTenantDialog', () => {
  it('renders the add tenant form fields and actions', () => {
    renderAddTenantDialog()

    // Test 1: Verify that the form exposes all fields required by the SSK-9 user story.
    expect(screen.getByRole('dialog', { name: 'Add New Tenant' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Phone Number/)).toBeInTheDocument()
    expect(screen.getByLabelText(/National ID/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Tenant' })).toBeInTheDocument()
  })

  it('submits a complete tenant form and notifies the parent page', async () => {
    mockedCreateTenant.mockResolvedValue({
      id: 99,
      fullName: 'Mika Sato',
      email: 'manee@example.com',
      phone: '089-111-2222',
      nationalId: null,
    })
    const { user, onClose, onCreated } = renderAddTenantDialog()

    // Test 2: Verify the happy path payload and callbacks after a valid tenant is saved.
    await user.type(screen.getByLabelText(/Full Name/), '  Mika Sato  ')
    await user.type(screen.getByLabelText(/Email/), 'manee@example.com')
    await user.type(screen.getByLabelText(/Phone Number/), '089-111-2222')
    await user.click(screen.getByRole('button', { name: 'Save Tenant' }))

    await waitFor(() => {
      expect(mockedCreateTenant).toHaveBeenCalledWith({
        fullName: 'Mika Sato',
        email: 'manee@example.com',
        phone: '089-111-2222',
        nationalId: undefined,
      })
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a validation error when a required field is missing', async () => {
    const { user, onClose, onCreated } = renderAddTenantDialog()

    // Test 3: Verify that missing required data is blocked before calling the API.
    await user.type(screen.getByLabelText(/Email/), 'noname@example.com')
    await user.type(screen.getByLabelText(/Phone Number/), '089-555-6666')
    await user.click(screen.getByRole('button', { name: 'Save Tenant' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the full name')
    expect(mockedCreateTenant).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an API error and keeps the dialog open when saving fails', async () => {
    mockedCreateTenant.mockRejectedValue(new ApiError(500, 'Could not add the tenant (from API)'))
    const { user, onClose, onCreated } = renderAddTenantDialog()

    // Test 4: Verify that backend/API failures are shown without closing the form.
    await user.type(screen.getByLabelText(/Full Name/), 'Nanami Aoki')
    await user.type(screen.getByLabelText(/Email/), 'somying@example.com')
    await user.type(screen.getByLabelText(/Phone Number/), '089-777-8888')
    await user.click(screen.getByRole('button', { name: 'Save Tenant' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the tenant (from API)')
    expect(screen.getByRole('dialog', { name: 'Add New Tenant' })).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
