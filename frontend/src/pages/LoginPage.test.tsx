import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import LoginPage from './LoginPage'

describe('LoginPage', () => {
  it('renders the admin login form', () => {
    render(<LoginPage />)

    // Test 1: renders the admin login form
    expect(screen.getByText('Sakura Soul')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('allows the admin to type username and password', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    // Test 2: allows the admin to type username and password
    await user.type(screen.getByLabelText('Username'), 'adminsakura01')
    await user.type(screen.getByLabelText('Password'), 'password123')

    expect(screen.getByLabelText('Username')).toHaveValue('adminsakura01')
    expect(screen.getByLabelText('Password')).toHaveValue('password123')
  })

  it('uses a password input for the password field', () => {
    render(<LoginPage />)

    // Test 3: uses a password input for the password field
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })
})