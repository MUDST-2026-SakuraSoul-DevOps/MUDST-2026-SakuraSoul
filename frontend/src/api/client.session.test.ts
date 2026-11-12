import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ต่อจาก client.http.test.ts: ปิด backend จำลองแล้วดัก fetch แบบเดียวกัน
 * คุมการเด้งไปหน้า login ตอน session หมด และ query string ของ endpoint อ่านข้อมูลที่ยังไม่มีเทส
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

describe('session expiry contract (US-01-S3)', () => {
  /** แทน window ชั่วคราว jsdom ไม่ยอมให้ spy location.assign ตรง ๆ */
  function fakeWindow(pathname: string) {
    const assign = vi.fn()
    vi.stubGlobal('window', { location: { pathname, assign } })
    return assign
  }

  it('sends the user to /login once even when several requests get 401 together', async () => {
    const assign = fakeWindow('/rooms')
    fetchMock.mockResolvedValue(jsonResponse({ title: 'Unauthorized' }, 401))

    await expect(client.fetchTenants()).rejects.toMatchObject({ status: 401 })
    await expect(client.fetchRooms()).rejects.toMatchObject({ status: 401 })

    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('does not redirect for a 401 from the auth endpoints or while already on the login page', async () => {
    const assign = fakeWindow('/rooms')
    fetchMock.mockResolvedValueOnce(jsonResponse({ title: 'Bad credentials' }, 401))
    await expect(client.login('admin', 'wrong')).rejects.toMatchObject({ status: 401 })
    expect(assign).not.toHaveBeenCalled()

    const onLogin = fakeWindow('/login')
    fetchMock.mockResolvedValueOnce(jsonResponse({ title: 'Unauthorized' }, 401))
    await expect(client.fetchTenants()).rejects.toMatchObject({ status: 401 })
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('falls back to the status text when the problem body has neither detail nor title', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 422))
    await expect(client.fetchTenant(1)).rejects.toMatchObject({ status: 422, message: 'The request failed (422)' })
  })
})

describe('query strings of the read endpoints', () => {
  it('reads one receipt and filters receipts by month', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))
    await client.fetchReceipts({ month: '2026-11' })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/receipts?month=2026-11', expect.anything())

    fetchMock.mockResolvedValue(jsonResponse({ id: 3 }))
    await client.fetchReceipt(3)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/receipts/3', expect.anything())
  })

  it('asks for every meter reading or one month only', async () => {
    fetchMock.mockImplementation(async () => jsonResponse([]))
    await client.fetchMeterReadings()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/meter-readings', expect.anything())
    await client.fetchMeterReadings('2026-10')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/meter-readings?month=2026-10', expect.anything())
  })

  it('pays a receipt with or without naming the method', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 3 }))
    await client.payReceipt(3)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/receipts/3/pay', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock.mock.lastCall?.[1]).not.toHaveProperty('body')
  })

  it('puts every summary report filter in the query, for both the JSON and the CSV', async () => {
    const query = { groupBy: 'unit' as const, from: '2026-01', to: '2026-11', floor: 2, roomId: 7, tenantId: 9, status: 'PAID' as const }
    const expected = 'groupBy=unit&from=2026-01&to=2026-11&floor=2&roomId=7&tenantId=9&status=PAID'

    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [] }))
    await client.fetchSummaryReport(query)
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/reports/summary?${expected}`, expect.anything())

    fetchMock.mockResolvedValueOnce(new Response('unit,charges\n', { status: 200 }))
    await client.downloadSummaryReportCsv(query)
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/reports/summary.csv?${expected}`, expect.anything())

    // ไม่ใส่ตัวกรองเสริม ก็ไม่มีพารามิเตอร์ว่างติดไป
    fetchMock.mockResolvedValueOnce(jsonResponse({ rows: [] }))
    await client.fetchSummaryReport({ groupBy: 'month', from: '2026-01', to: '2026-02' })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/reports/summary?groupBy=month&from=2026-01&to=2026-02', expect.anything())

    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))
    await client.downloadSummaryReportCsv({ groupBy: 'month', from: '2026-01', to: '2026-02' })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/reports/summary.csv?groupBy=month&from=2026-01&to=2026-02', expect.anything())
  })
})
