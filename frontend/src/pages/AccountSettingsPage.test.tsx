import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, beforeEach } from 'vitest'
import AccountSettingsPage from './AccountSettingsPage'

function renderAccountSettings() {
  return render(
    <MemoryRouter>
      <AccountSettingsPage />
    </MemoryRouter>,
  )
}

describe('AccountSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders account settings page with profile and personal details cards', () => {
    renderAccountSettings()

    expect(screen.getByRole('heading', { name: 'Account Settings' })).toBeInTheDocument()
    expect(
      screen.getByText('Manage your personal profile, account credentials, and system preferences.'),
    ).toBeInTheDocument()

    // Profile card
    expect(screen.getByRole('heading', { name: 'Haruka S.' })).toBeInTheDocument()
    expect(screen.getByText('Property Manager')).toBeInTheDocument()
    expect(screen.getByText('Staff ID')).toBeInTheDocument()
    expect(screen.getByText('SS-882')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload new photo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()

    // Personal details card
    expect(screen.getByRole('heading', { name: 'Personal Details' })).toBeInTheDocument()
    expect(screen.getByText('USERNAME')).toBeInTheDocument()
    expect(screen.getByText('Haruka')).toBeInTheDocument()
    expect(screen.getByText('PASSWORD')).toBeInTheDocument()
    expect(screen.getByText('haruka.s@sakurasoul.co.jp')).toBeInTheDocument()
    expect(screen.getByText('PHONE NUMBER')).toBeInTheDocument()
    expect(screen.getByText('+81 90-1234-5678')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit personal details/i })).toBeInTheDocument()
  })

  it('opens edit modal and updates personal details', async () => {
    const user = userEvent.setup()
    renderAccountSettings()

    await user.click(screen.getByRole('button', { name: /edit personal details/i }))

    expect(screen.getByRole('heading', { name: 'Edit Personal Details' })).toBeInTheDocument()

    const usernameInput = screen.getByLabelText('Username')
    await user.clear(usernameInput)
    await user.type(usernameInput, 'HarukaAdmin')

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(screen.queryByRole('heading', { name: 'Edit Personal Details' })).not.toBeInTheDocument()
    expect(screen.getByText('HarukaAdmin')).toBeInTheDocument()
  })

  it('allows removing profile photo to reset to default', async () => {
    const user = userEvent.setup()
    renderAccountSettings()

    await user.click(screen.getByRole('button', { name: /remove/i }))
    expect(screen.getByRole('heading', { name: 'Haruka S.' })).toBeInTheDocument()
  })
})
