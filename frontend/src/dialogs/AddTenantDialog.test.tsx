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
  it('renders the add tenant form fields and actions matching Figma', () => {
    renderAddTenantDialog()

    expect(screen.getByRole('dialog', { name: /Tenant Information/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Phone number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/National ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Line ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Lease Period/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Rent/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Room Type/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Email/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add Unit/i })).toBeInTheDocument()
  })

  it('submits a complete tenant form and notifies the parent page', async () => {
    mockedCreateTenant.mockResolvedValue({
      id: 99,
      fullName: 'มานี รักเรียน',
      email: 'มานี.รักเรียน@example.com',
      phone: '089-111-2222',
      nationalId: null,
    })
    const { user, onClose, onCreated } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), '  มานี รักเรียน  ')
    await user.type(screen.getByLabelText(/Phone number/i), '089-111-2222')
    await user.click(screen.getByRole('button', { name: /Add Unit/i }))

    await waitFor(() => {
      expect(mockedCreateTenant).toHaveBeenCalledWith({
        fullName: 'มานี รักเรียน',
        email: 'มานี.รักเรียน@example.com',
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
    await user.click(screen.getByRole('button', { name: /Add Unit/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('กรุณากรอกชื่อ-นามสกุล')
    expect(mockedCreateTenant).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an API error and keeps the dialog open when saving fails', async () => {
    mockedCreateTenant.mockRejectedValue(new ApiError(500, 'เพิ่มผู้เช่าไม่สำเร็จจาก API'))
    const { user, onClose, onCreated } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), 'สมหญิง ตั้งใจ')
    await user.type(screen.getByLabelText(/Phone number/i), '089-777-8888')
    await user.click(screen.getByRole('button', { name: /Add Unit/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('เพิ่มผู้เช่าไม่สำเร็จจาก API')
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
})
