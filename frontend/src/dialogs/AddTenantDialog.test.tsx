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

describe('AddTenantDialog (SSK-107)', () => {
  it('renders all form fields with spacious date and contact inputs', () => {
    renderAddTenantDialog()

    expect(screen.getByRole('dialog', { name: /Tenant Information/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Phone number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/National ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Line ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Room Type/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm|Add Unit/i })).toBeInTheDocument()
  })

  it('submits a complete tenant form and notifies the parent page', async () => {
    mockedCreateTenant.mockResolvedValue({
      id: 99,
      fullName: 'Mika Sato',
      email: 'mika.sato@example.com',
      phone: '089-111-2222',
      nationalId: null,
    })
    const { user, onClose, onCreated } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), '  Mika Sato  ')
    await user.type(screen.getByLabelText(/Phone number/i), '089-111-2222')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    await waitFor(() => {
      expect(mockedCreateTenant).toHaveBeenCalledWith({
        fullName: 'Mika Sato',
        email: 'mika.sato@example.com',
        phone: '089-111-2222',
        nationalId: undefined,
      })
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a validation error when a required field is missing', async () => {
    const { user, onClose, onCreated } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Phone number/i), '089-555-6666')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the full name')
    expect(mockedCreateTenant).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an API error and keeps the dialog open when saving fails', async () => {
    mockedCreateTenant.mockRejectedValue(new ApiError(500, 'Could not add the tenant'))
    const { user, onClose, onCreated } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), 'Nanami Aoki')
    await user.type(screen.getByLabelText(/Phone number/i), '089-777-8888')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the tenant')
    expect(screen.getByRole('dialog', { name: /Tenant Information/i })).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('formats phone number automatically with hyphens and restricts to 10 digits', async () => {
    const { user } = renderAddTenantDialog()
    const phoneInput = screen.getByLabelText(/Phone number/i)

    // Type letters and numbers beyond 10 digits
    await user.type(phoneInput, '081abc234def56789999')

    // Expect formatted 10 digits only
    expect(phoneInput).toHaveValue('081-234-5678')
  })

  it('formats National ID automatically and validates the Thai 13-digit checksum', async () => {
    const { user } = renderAddTenantDialog()
    const idInput = screen.getByLabelText(/National ID/i)

    // Type National ID
    await user.type(idInput, '1100400123459')
    expect(idInput).toHaveValue('1 1004 00123 45 9')

    await user.type(screen.getByLabelText(/Full name/i), 'Nanami Aoki')
    await user.type(screen.getByLabelText(/Phone number/i), '089-777-8888')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('13')
  })

  it('renders calendar date inputs for Lease Period', () => {
    renderAddTenantDialog()
    expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument()
  })
})
