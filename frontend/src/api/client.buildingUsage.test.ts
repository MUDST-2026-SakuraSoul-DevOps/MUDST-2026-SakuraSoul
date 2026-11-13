import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SSK-181: URL ที่ fetchBuildingUsage และ downloadBuildingUsageCsv ส่งไปหา backend จริง
 * ปิด backend จำลองแล้วดักที่ fetch แบบเดียวกับ client.http.test.ts
 */
const fetchMock = vi.fn()
let client: typeof import('./client')

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

describe('building usage requests', () => {
  it('asks for both utilities by month without a comparison by default', async () => {
    const body = { from: '2025-01', to: '2026-12', points: [] }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(client.fetchBuildingUsage({ from: '2025-01', to: '2026-12' })).resolves.toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith('/api/usage/building?from=2025-01&to=2026-12&metric=both&granularity=month', {
      headers: { Accept: 'application/json' },
    })
  })

  it('sends the granularity and compare=yoy when asked', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await client.fetchBuildingUsage({ from: '2024-01', to: '2026-12', metric: 'water', granularity: 'year', compare: true })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/usage/building?from=2024-01&to=2026-12&metric=water&granularity=year&compare=yoy')
  })

  it('downloads the CSV from the .csv endpoint with the same query', async () => {
    fetchMock.mockResolvedValueOnce(new Response('period,electric_units\r\nTotal,5\r\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }))

    const blob = await client.downloadBuildingUsageCsv({ from: '2026-01', to: '2026-03', granularity: 'month', compare: true })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/usage/building.csv?from=2026-01&to=2026-03&metric=both&granularity=month&compare=yoy')
    expect(await blob.text()).toBe('period,electric_units\r\nTotal,5\r\n')
  })

  it('turns the backend 400 problem into an ApiError with its message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 400, title: 'Bad Request', detail: 'The range can be at most 10 years' }), {
        status: 400,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    )

    await expect(client.fetchBuildingUsage({ from: '2010-01', to: '2026-12' })).rejects.toMatchObject({
      status: 400,
      message: 'The range can be at most 10 years',
    })
  })
})
