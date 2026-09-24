import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
let client: typeof import('./client')

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(async () => {
  fetchMock.mockReset()
  vi.resetModules()
  vi.stubEnv('VITE_API_MOCK', '0')
  vi.stubGlobal('fetch', fetchMock)
  client = await import('./client')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('HTTP API client without the simulated backend', () => {
  it('sends the login body to the real API path with JSON headers', async () => {
    const user = { username: 'admin', displayName: 'Administrator', email: null, phone: null }
    fetchMock.mockResolvedValueOnce(jsonResponse(user))

    await expect(client.login('admin', 'secret')).resolves.toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret' }),
    })
  })

  it('handles a successful 204 response without trying to parse JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(client.logout()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
  })

  it('uses ProblemDetail detail for a rejected request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      title: 'Bad Request',
      detail: 'Electricity rate per unit cannot be negative',
    }, 400))

    await expect(client.updateApartmentConfig({
      electricRatePerUnit: -1,
      waterRatePerUnit: 18,
      commonAreaFee: 300,
      internetFee: 250,
    })).rejects.toMatchObject({
      status: 400,
      message: 'Electricity rate per unit cannot be negative',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/apartment-config', {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        electricRatePerUnit: -1,
        waterRatePerUnit: 18,
        commonAreaFee: 300,
        internetFee: 250,
      }),
    })
  })

  it('falls back to status text when an error response is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('gateway unavailable', { status: 502 }))

    await expect(client.fetchRooms()).rejects.toMatchObject({
      status: 502,
      message: 'The request failed (502)',
    })
  })

  it('treats maintenance 404 as no endpoint but does not hide a 500 error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Not Found' }, 404))
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Database unavailable' }, 500))

    await expect(client.fetchMaintenanceLog()).resolves.toEqual([])
    await expect(client.fetchRoomMaintenance(101)).rejects.toMatchObject({
      status: 500,
      message: 'Database unavailable',
    })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/maintenance',
      '/api/rooms/101/maintenance',
    ])
  })

  it('propagates a network failure instead of presenting an empty maintenance history', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'))

    await expect(client.fetchMaintenanceLog()).rejects.toThrow('Network unavailable')
  })
})
