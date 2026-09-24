import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeaseRequest } from './types'

/**
 * These contract tests disable the in-browser API mock and intercept fetch. They verify the
 * client-side HTTP boundary without sending requests to a real backend or network.
 */
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
  // client.ts reads this value while it is imported, so it must be set first.
  vi.stubEnv('VITE_API_MOCK', '0')
  vi.stubGlobal('fetch', fetchMock)
  client = await import('./client')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('HTTP request contract', () => {
  it('sends GET rooms to the API URL with an Accept header and normalizes the response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      { id: 1, roomNumber: '101', floor: 1, baseRent: 35000 },
    ]))

    const rooms = await client.fetchRooms()

    expect(fetchMock).toHaveBeenCalledWith('/api/rooms', {
      headers: { Accept: 'application/json' },
    })
    expect(rooms).toEqual([
      expect.objectContaining({
        id: 1,
        roomNumber: '101',
        status: 'AVAILABLE',
        currentLease: null,
        roomType: 'SINGLE',
      }),
    ])
  })

  it('sends POST lease with the expected method, headers, and JSON body', async () => {
    const body: LeaseRequest = {
      roomId: 7,
      tenantId: 12,
      startDate: '2026-10-01',
      endDate: '2027-09-30',
      monthlyRent: 35000,
      billingCycle: 'MONTHLY',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 25, ...body, status: 'ACTIVE' }, 201))

    await client.createLease(body)

    expect(fetchMock).toHaveBeenCalledWith('/api/leases', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  })

  it('serializes lease status, room ID, and tenant ID filters into the query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))

    await client.fetchLeases({ status: 'ACTIVE', roomId: 7, tenantId: 12 })

    expect(fetchMock).toHaveBeenCalledWith('/api/leases?status=ACTIVE&roomId=7&tenantId=12', {
      headers: { Accept: 'application/json' },
    })
  })

  it('accepts a 204 logout response without trying to parse a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(client.logout()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
  })
})

describe('HTTP error contract', () => {
  it('uses ProblemDetail.detail before title', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      title: 'Bad Request',
      detail: 'The end date cannot be before the start date',
    }, 400))

    await expect(client.createLease({
      roomId: 7,
      tenantId: 12,
      startDate: '2026-10-02',
      endDate: '2026-10-01',
      monthlyRent: 35000,
      billingCycle: 'MONTHLY',
    })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'The end date cannot be before the start date',
    })
  })

  it('uses ProblemDetail.title when detail is absent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ title: 'Tenant not found' }, 404))

    await expect(client.fetchTenant(999)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Tenant not found',
    })
  })

  it('uses the status fallback for a non-JSON error response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Service unavailable', { status: 503 }))

    await expect(client.fetchTenant(999)).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'The request failed (503)',
    })
  })

  it('preserves a network rejection instead of treating it as a response', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'))

    await expect(client.fetchTenants()).rejects.toThrow('Network unavailable')
  })
})

describe('maintenance fallback contract', () => {
  it('converts only maintenance 404 responses into empty lists', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ title: 'Not Found' }, 404))
    await expect(client.fetchMaintenanceLog()).resolves.toEqual([])

    fetchMock.mockResolvedValueOnce(jsonResponse({ title: 'Not Found' }, 404))
    await expect(client.fetchRoomMaintenance(7)).resolves.toEqual([])
  })

  it('keeps maintenance 500 responses as API errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Database unavailable' }, 500))

    await expect(client.fetchMaintenanceLog()).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Database unavailable',
    })
  })

  it('keeps maintenance network failures as rejected promises', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Maintenance service offline'))

    await expect(client.fetchRoomMaintenance(7)).rejects.toThrow('Maintenance service offline')
  })
})
