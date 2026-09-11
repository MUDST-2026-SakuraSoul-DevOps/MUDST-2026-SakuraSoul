import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, logout } from '../api/client'
import { LogoutConfirmModal } from './LogoutConfirmModal'

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    logout: vi.fn(),
  }
})

const mockedLogout = vi.mocked(logout)

// Confirming without an onConfirm prop is how AppLayout uses this modal, so the
// destination route has to exist for the redirect to be observable.
function renderModalWithLoginRoute() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LogoutConfirmModal />} />
        <Route path="/login" element={<h1>Welcome back</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedLogout.mockResolvedValue(undefined)
})

describe('LogoutConfirmModal', () => {
  it('opens the logout confirmation modal when clicking logout button', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LogoutConfirmModal />
      </MemoryRouter>,
    )

    // Test 1: Verify that clicking the logout button opens the confirmation modal.
    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(screen.getByRole('heading', { name: 'Log Out' })).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to logout?')).toBeInTheDocument()
  })

  it('closes the modal when clicking cancel', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LogoutConfirmModal />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(screen.getByRole('button', { name: /canc/i }))

    expect(screen.queryByRole('heading', { name: 'Log Out' })).not.toBeInTheDocument()
  })

  it('closes the modal and calls onConfirm when clicking Confirm', async () => {
    const user = userEvent.setup()
    const handleConfirm = vi.fn()
    render(
      <MemoryRouter>
        <LogoutConfirmModal onConfirm={handleConfirm} />
      </MemoryRouter>,
    )

    // Test 3: Verify that clicking Confirm triggers confirmation callback.
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(handleConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Log Out' })).not.toBeInTheDocument()
  })

  it('closes the modal when clicking the overlay', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LogoutConfirmModal />
      </MemoryRouter>,
    )

    // Test 4: Verify that clicking outside the modal content closes the overlay.
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(screen.getByText('Are you sure you want to logout?').parentElement!.parentElement!)

    expect(screen.queryByRole('heading', { name: 'Log Out' })).not.toBeInTheDocument()
  })

  it('ends the session on the server and goes to the login page', async () => {
    const user = userEvent.setup()
    renderModalWithLoginRoute()

    // Test 5: Confirming without a callback must call the logout endpoint, not
    // just change the route, otherwise the session stays alive on the server.
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(mockedLogout).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('still goes to the login page when the logout request fails', async () => {
    mockedLogout.mockRejectedValue(new ApiError(503, 'Service Unavailable'))
    const user = userEvent.setup()
    renderModalWithLoginRoute()

    // Test 6: A failed request must never trap the user inside a session they
    // have already asked to leave.
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})
