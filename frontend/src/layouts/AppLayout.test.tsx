import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthUser } from '../api/types'
import { syncProfileWithUser } from '../domain/profileStore'
import AppLayout from './AppLayout'

const SIGNED_IN: AuthUser = {
  username: 'admin',
  displayName: 'Somchai P.',
  email: 'somchai@example.com',
  phone: '080-000-0000',
}

function renderLayout(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<h2>Dashboard content</h2>} />
          <Route path="tenants" element={<h2>Tenant Directory content</h2>} />
          <Route path="settings" element={<h2>Account Settings content</h2>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  syncProfileWithUser(SIGNED_IN)
})

describe('AppLayout', () => {
  // SSK-171: the Maintenance menu shows how many supplies are at or below their minimum
  it('shows the low stock count on the Maintenance menu item', async () => {
    renderLayout()
    const badge = await screen.findByTestId('low-stock-count')
    expect(badge).toHaveTextContent('1')
    expect(badge).toHaveAttribute('title', '1 low stock item')
    // the badge must not change the menu link's name
    expect(screen.getByRole('link', { name: 'Maintenance' })).toContainElement(badge)
  })

  it('navigates to a sidebar destination and marks it as active', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByRole('link', { name: 'Tenants' }))

    expect(await screen.findByRole('heading', { name: 'Tenant Directory content' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tenants' })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates to account settings from the signed-in profile', async () => {
    const user = userEvent.setup()
    renderLayout()

    expect(screen.getByText('Somchai P.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Account Settings' }))

    expect(await screen.findByRole('heading', { name: 'Account Settings content' })).toBeInTheDocument()
  })

  it('opens and cancels logout from the sidebar without leaving the current page', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(screen.getByRole('heading', { name: 'Log Out' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'CANCEL' }))
    expect(screen.queryByRole('heading', { name: 'Log Out' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard content' })).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation menu', async () => {
    const user = userEvent.setup()
    renderLayout()
    const sidebar = screen.getByRole('complementary')

    expect(sidebar.classList).toContain('-translate-x-full')

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(sidebar.classList).toContain('translate-x-0')

    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(sidebar.classList).toContain('-translate-x-full')
  })
})
