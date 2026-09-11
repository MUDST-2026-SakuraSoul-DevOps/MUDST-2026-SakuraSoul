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
  it('renders all form fields with spacious date and rent inputs', () => {
    renderAddTenantDialog()

    expect(screen.getByRole('dialog', { name: 'Tenant Information' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Phone number/)).toBeInTheDocument()
    expect(screen.getByLabelText(/National ID/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Line ID/)).toBeInTheDocument()
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
    expect(screen.getByLabelText(/Rent/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('ช่อง Rent รับเฉพาะตัวเลขและบล็อกตัวอักษร', async () => {
    const { user } = renderAddTenantDialog()

    const rentInput = screen.getByLabelText(/Rent/) as HTMLInputElement
    await user.clear(rentInput)
    await user.type(rentInput, 'abcxyz')
    expect(rentInput.value).toBe('')

    await user.type(rentInput, '45000')
    expect(rentInput.value).toBe('45000')
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

    await user.type(screen.getByLabelText(/Full name/), '  Mika Sato  ')
    await user.type(screen.getByLabelText(/Phone number/), '089-111-2222')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

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

  it('shows an API error and keeps the dialog open when saving fails', async () => {
    mockedCreateTenant.mockRejectedValue(new ApiError(500, 'Could not add the tenant'))
    const { user, onClose, onCreated } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/), 'Nanami Aoki')
    await user.type(screen.getByLabelText(/Phone number/), '089-777-8888')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the tenant')
    expect(screen.getByRole('dialog', { name: 'Tenant Information' })).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
