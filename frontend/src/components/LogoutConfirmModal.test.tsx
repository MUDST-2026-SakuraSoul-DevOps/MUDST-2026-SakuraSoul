import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LogoutConfirmModal } from './LogoutConfirmModal'

describe('LogoutConfirmModal', () => {
  it('opens the logout confirmation modal when clicking logout button', async () => {
    const user = userEvent.setup()
    render(<LogoutConfirmModal />)

    // Test 1: Verify that clicking the logout button opens the confirmation modal.
    await user.click(screen.getByRole('button', { name: 'ออกจากระบบ' }))

    expect(screen.getByRole('heading', { name: 'Log Out' })).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to logout?')).toBeInTheDocument()
  })

  it('closes the modal when clicking cancel', async () => {
    const user = userEvent.setup()
    render(<LogoutConfirmModal />)

    // Test 2: Verify that clicking cancel closes the modal without logging out.
    await user.click(screen.getByRole('button', { name: 'ออกจากระบบ' }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('heading', { name: 'Log Out' })).not.toBeInTheDocument()
  })

  it('closes the modal when clicking Confirm', async () => {
    const user = userEvent.setup()
    render(<LogoutConfirmModal />)

    // Test 3: Verify that clicking Confirm closes the modal before real logout logic is wired.
    await user.click(screen.getByRole('button', { name: 'ออกจากระบบ' }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(screen.queryByRole('heading', { name: 'Log Out' })).not.toBeInTheDocument()
  })

  it('closes the modal when clicking the overlay', async () => {
    const user = userEvent.setup()
    render(<LogoutConfirmModal />)

    // Test 4: Verify that clicking outside the modal content closes the overlay.
    await user.click(screen.getByRole('button', { name: 'ออกจากระบบ' }))
    await user.click(screen.getByText('Are you sure you want to logout?').parentElement!.parentElement!)

    expect(screen.queryByRole('heading', { name: 'Log Out' })).not.toBeInTheDocument()
  })
})