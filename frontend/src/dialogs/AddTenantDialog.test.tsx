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
  it('renders the five tenant fields and no lease fields (SSK-136)', () => {
    renderAddTenantDialog()

    expect(screen.getByRole('dialog', { name: /Tenant Information/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Phone number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/National ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Line ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Email$/i)).toBeInTheDocument()
    // Lease Period and Room Type belong to the lease, which the backend never stored on the tenant.
    expect(screen.queryByLabelText(/Start Date/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/End Date/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Room Type/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/rent/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm|Add Unit/i })).toBeInTheDocument()
  })

  it('submits a complete tenant form with Thai ID and notifies the parent page', async () => {
    mockedCreateTenant.mockResolvedValue({
      id: 99,
      fullName: 'Mika Sato',
      email: 'mika.sato@example.com',
      phone: '089-111-2222',
      nationalId: '1100400123450',
    })
    const { user, onClose, onCreated } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), '  Mika Sato  ')
    await user.type(screen.getByLabelText(/Phone number/i), '089-111-2222')
    await user.type(screen.getByLabelText(/National ID/i), '1100400123450')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    await waitFor(() => {
      // SSK-136 no invented <name>@example.com address any more: a blank email is simply not sent.
      expect(mockedCreateTenant).toHaveBeenCalledWith({
        fullName: 'Mika Sato',
        phone: '089-111-2222',
        nationalId: '1100400123450',
        lineId: undefined,
        email: undefined,
      })
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submits a complete tenant form with Passport and uppercase conversion', async () => {
    mockedCreateTenant.mockResolvedValue({
      id: 100,
      fullName: 'John Doe',
      email: 'john.doe@example.com',
      phone: '089-222-3333',
      nationalId: 'AA1234567',
    })
    const { user, onClose, onCreated } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), 'John Doe')
    await user.type(screen.getByLabelText(/Phone number/i), '089-222-3333')
    
    // Switch to Passport
    await user.click(screen.getByRole('radio', { name: /Passport/i }))
    await user.type(screen.getByLabelText(/Passport number/i), 'aa1234567')

    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    await waitFor(() => {
      expect(mockedCreateTenant).toHaveBeenCalledWith({
        fullName: 'John Doe',
        phone: '089-222-3333',
        nationalId: 'AA1234567',
        lineId: undefined,
        email: undefined,
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
    await user.type(screen.getByLabelText(/National ID/i), '1100400123450')
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

  it('formats National ID automatically and validates Thai 13-digit checksum in English', async () => {
    const { user } = renderAddTenantDialog()
    const idInput = screen.getByLabelText(/National ID/i)

    // Type National ID
    await user.type(idInput, '1100400123459')
    expect(idInput).toHaveValue('1 1004 00123 45 9')

    await user.type(screen.getByLabelText(/Full name/i), 'Nanami Aoki')
    await user.type(screen.getByLabelText(/Phone number/i), '089-777-8888')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Thai National ID checksum')
  })

  it('rejects a passport shorter than 6 characters, the same rule as the backend', async () => {
    const { user } = renderAddTenantDialog()

    await user.click(screen.getByRole('radio', { name: /Passport/i }))
    await user.type(screen.getByLabelText(/Passport number/i), 'A12')
    await user.type(screen.getByLabelText(/Full name/i), 'Nanami Aoki')
    await user.type(screen.getByLabelText(/Phone number/i), '089-777-8888')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Passport number must be 6–20 alphanumeric characters')
    expect(mockedCreateTenant).not.toHaveBeenCalled()
  })

  it('requires identification, as the instructor decided on 11 Sep', async () => {
    const { user } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), 'Mana Sukjai')
    await user.type(screen.getByLabelText(/Phone number/i), '089-123-4567')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the national ID')
    expect(mockedCreateTenant).not.toHaveBeenCalled()
  })

  it('sends the email exactly as typed, trimmed, without inventing one', async () => {
    mockedCreateTenant.mockResolvedValue({
      id: 101,
      fullName: 'Mika Sato',
      email: 'mika@dorm.ac.th',
      phone: '089-111-2222',
      nationalId: '1100400123450',
    })
    const { user } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), 'Mika Sato')
    await user.type(screen.getByLabelText(/Phone number/i), '089-111-2222')
    await user.type(screen.getByLabelText(/National ID/i), '1100400123450')
    await user.type(screen.getByLabelText(/^Email$/i), '  mika@dorm.ac.th ')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    await waitFor(() => {
      expect(mockedCreateTenant).toHaveBeenCalledWith(expect.objectContaining({ email: 'mika@dorm.ac.th' }))
    })
  })

  it('rejects a malformed email with the same sentence as the backend', async () => {
    const { user } = renderAddTenantDialog()

    await user.type(screen.getByLabelText(/Full name/i), 'Mika Sato')
    await user.type(screen.getByLabelText(/Phone number/i), '089-111-2222')
    await user.type(screen.getByLabelText(/National ID/i), '1100400123450')
    await user.type(screen.getByLabelText(/^Email$/i), 'mika.dorm.ac.th')
    await user.click(screen.getByRole('button', { name: /Confirm|Add Unit/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That email address is not valid')
    expect(mockedCreateTenant).not.toHaveBeenCalled()
  })
})
