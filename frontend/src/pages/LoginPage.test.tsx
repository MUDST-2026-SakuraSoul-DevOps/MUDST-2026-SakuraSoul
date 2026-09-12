import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, login } from '../api/client'
import type { AuthUser } from '../api/types'
import LoginPage from './LoginPage'

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    login: vi.fn(),
  }
})

const mockedLogin = vi.mocked(login)

const ADMIN: AuthUser = {
  username: 'admin',
  displayName: 'Administrator',
  email: null,
  phone: null,
}

function passwordInput() {
  return screen.getByLabelText('Password')
}

// The login page is the only place in the app that navigates somewhere else on
// success, so it gets a routes harness instead of a bare MemoryRouter: without a
// destination route there is no way to prove where signing in actually lands.
function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedLogin.mockResolvedValue(ADMIN)
})

describe('LoginPage', () => {
  it('renders the admin login form', () => {
    renderLoginPage()

    // Test 1: renders the admin login form
    expect(screen.getByText('Sakura Soul')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(passwordInput()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('allows the admin to type username and password', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    // Test 2: allows the admin to type username and password
    await user.type(screen.getByLabelText('Username'), 'adminsakura01')
    await user.type(passwordInput(), 'password123')

    expect(screen.getByLabelText('Username')).toHaveValue('adminsakura01')
    expect(passwordInput()).toHaveValue('password123')
  })

  it('uses a password input for the password field', () => {
    renderLoginPage()

    // Test 3: uses a password input for the password field
    expect(passwordInput()).toHaveAttribute('type', 'password')
  })

  it('submits the form and signs in to navigate to dashboard', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(passwordInput(), 'admin1234')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockedLogin).toHaveBeenCalledWith('admin', 'admin1234')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows the message from the server and stays on the form when the credentials are wrong', async () => {
    mockedLogin.mockRejectedValue(new ApiError(401, 'The username or password is incorrect'))
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(passwordInput(), 'not-the-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The username or password is incorrect',
    )
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
  })
})
