import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./components/RequireAuth', async () => {
  const { Outlet } = await import('react-router-dom')
  return { RequireAuth: Outlet }
})

vi.mock('./layouts/AppLayout', async () => {
  const { Outlet } = await import('react-router-dom')
  return { default: Outlet }
})

vi.mock('./pages/LoginPage', () => ({ default: () => <h1>Login page</h1> }))
vi.mock('./pages/DashboardPage', () => ({ default: () => <h1>Dashboard page</h1> }))
vi.mock('./pages/UnitsPage', () => ({ default: () => <h1>Units page</h1> }))
vi.mock('./pages/TenantsPage', () => ({ default: () => <h1>Tenants page</h1> }))
vi.mock('./pages/PaymentsPage', () => ({ default: () => <h1>Payments page</h1> }))
vi.mock('./pages/MaintenancePage', () => ({ default: () => <h1>Maintenance page</h1> }))
vi.mock('./pages/ContractsPage', () => ({ default: () => <h1>Contracts page</h1> }))
vi.mock('./pages/AppliancesPage', () => ({ default: () => <h1>Appliances page</h1> }))
vi.mock('./pages/AccountSettingsPage', () => ({ default: () => <h1>Account settings page</h1> }))

function renderAt(path: string) {
  window.history.replaceState({}, '', path)
  return render(<App />)
}

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('App routes', () => {
  it('renders the public login route', () => {
    renderAt('/login')

    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument()
  })

  it.each([
    ['/', 'Dashboard page'],
    ['/units', 'Units page'],
    ['/tenants', 'Tenants page'],
    ['/payments', 'Payments page'],
    ['/maintenance', 'Maintenance page'],
    ['/contracts', 'Contracts page'],
    ['/appliances', 'Appliances page'],
  ])('renders %s through the protected application route', (path, pageName) => {
    renderAt(path)

    expect(screen.getByRole('heading', { name: pageName })).toBeInTheDocument()
  })

  it.each(['/settings', '/account-settings', '/account'])(
    'renders account settings at the %s alias',
    (path) => {
      renderAt(path)

      expect(screen.getByRole('heading', { name: 'Account settings page' })).toBeInTheDocument()
    },
  )
})
