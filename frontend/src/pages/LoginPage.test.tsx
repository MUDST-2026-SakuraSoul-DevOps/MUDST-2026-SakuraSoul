import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import LoginPage from './LoginPage'

function passwordInput() {
  return screen.getByLabelText('Password')
}

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

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

    await user.type(screen.getByLabelText('Username'), 'adminsakura01')
    await user.type(passwordInput(), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
