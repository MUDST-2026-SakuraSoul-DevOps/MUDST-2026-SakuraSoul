import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchMe } from '../api/client'
import { RequireAuth } from './RequireAuth'

// The happy path runs through the real client and the mock backend, which is
// always signed in. The mock has no way to answer 401 for /auth/me on purpose
// (see mockApi.ts), so the redirect branch is forced with a rejected call here.
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    fetchMe: vi.fn(actual.fetchMe),
  }
})

const mockedFetchMe = vi.mocked(fetchMe)

function renderGuardedApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/" element={<p>Secret</p>} />
        </Route>
        <Route path="/login" element={<h1>Welcome back</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RequireAuth', () => {
  it('shows the guarded page when the session is still valid', async () => {
    renderGuardedApp()

    expect(await screen.findByText('Secret')).toBeInTheDocument()
    expect(mockedFetchMe).toHaveBeenCalledTimes(1)
  })

  it('sends the visitor to the login page when there is no session', async () => {
    mockedFetchMe.mockRejectedValueOnce(new ApiError(401, 'Please sign in'))
    renderGuardedApp()

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
  })
})
