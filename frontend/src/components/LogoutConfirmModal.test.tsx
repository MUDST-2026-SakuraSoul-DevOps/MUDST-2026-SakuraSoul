import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LogoutConfirmModal } from './LogoutConfirmModal'

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
})