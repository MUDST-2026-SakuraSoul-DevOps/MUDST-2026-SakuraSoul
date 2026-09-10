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
    expect(screen.getByRole('dialog', { name: 'เพิ่มผู้เช่าใหม่' })).toBeInTheDocument()
    expect(screen.getByLabelText(/ชื่อ-นามสกุล/)).toBeInTheDocument()
    expect(screen.getByLabelText(/อีเมล/)).toBeInTheDocument()
    expect(screen.getByLabelText(/เบอร์โทร/)).toBeInTheDocument()
    expect(screen.getByLabelText(/เลขบัตรประชาชน/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'บันทึกผู้เช่า' })).toBeInTheDocument()
  })

  it('submits a complete tenant form and notifies the parent page', async () => {
    mockedCreateTenant.mockResolvedValue({
      id: 99,
      fullName: 'มานี รักเรียน',
      email: 'manee@example.com',
      phone: '089-111-2222',
      nationalId: null,
    })
    const { user, onClose, onCreated } = renderAddTenantDialog()

    // Test 2: Verify the happy path payload and callbacks after a valid tenant is saved.
    await user.type(screen.getByLabelText(/ชื่อ-นามสกุล/), '  มานี รักเรียน  ')
    await user.type(screen.getByLabelText(/อีเมล/), 'manee@example.com')
    await user.type(screen.getByLabelText(/เบอร์โทร/), '089-111-2222')
    await user.click(screen.getByRole('button', { name: 'บันทึกผู้เช่า' }))

    await waitFor(() => {
      expect(mockedCreateTenant).toHaveBeenCalledWith({
        fullName: 'มานี รักเรียน',
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
    await user.type(screen.getByLabelText(/อีเมล/), 'noname@example.com')
    await user.type(screen.getByLabelText(/เบอร์โทร/), '089-555-6666')
    await user.click(screen.getByRole('button', { name: 'บันทึกผู้เช่า' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('กรุณากรอกชื่อ-นามสกุล')
    expect(mockedCreateTenant).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an API error and keeps the dialog open when saving fails', async () => {
    mockedCreateTenant.mockRejectedValue(new ApiError(500, 'เพิ่มผู้เช่าไม่สำเร็จจาก API'))
    const { user, onClose, onCreated } = renderAddTenantDialog()

    // Test 4: Verify that backend/API failures are shown without closing the form.
    await user.type(screen.getByLabelText(/ชื่อ-นามสกุล/), 'สมหญิง ตั้งใจ')
    await user.type(screen.getByLabelText(/อีเมล/), 'somying@example.com')
    await user.type(screen.getByLabelText(/เบอร์โทร/), '089-777-8888')
    await user.click(screen.getByRole('button', { name: 'บันทึกผู้เช่า' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('เพิ่มผู้เช่าไม่สำเร็จจาก API')
    expect(screen.getByRole('dialog', { name: 'เพิ่มผู้เช่าใหม่' })).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
