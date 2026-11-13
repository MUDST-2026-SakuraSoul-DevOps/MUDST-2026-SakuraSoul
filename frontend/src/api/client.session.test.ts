import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * session หมดอายุระหว่างใช้งาน (US-01-S3): คำขอไหนก็ตามที่ได้ 401 ต้องพากลับไปหน้า login ครั้งเดียว
 * ยกเว้นคำขอของ /auth/* ที่จัดการ 401 เอง (ล็อกอินผิด และยามที่ถามว่ายังล็อกอินอยู่ไหม)
 *
 * ปิด backend จำลองแล้วดัก fetch แบบเดียวกับ client.http.test.ts
 * ธง redirectingToLogin ของ client.ts อยู่ระดับ module จึงต้องโหลด client ใหม่ทุกเคส
 * ไม่งั้นผลของเคสหลังจะขึ้นกับว่าเคสก่อนหน้าเด้งไปแล้วหรือยัง
 */
const fetchMock = vi.fn()
const assign = vi.fn()
let client: typeof import('./client')

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } })
}

function unauthorized(): Response {
  return response(401, { title: 'Unauthorized', detail: 'Full authentication is required to access this resource' })
}

async function openClientOn(pathname: string) {
  vi.stubGlobal('location', { pathname, assign })
  client = await import('./client')
}

beforeEach(() => {
  fetchMock.mockReset()
  assign.mockReset()
  vi.resetModules()
  vi.stubEnv('VITE_API_MOCK', '0')
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('session expiry (US-01-S3)', () => {
  it('sends the user to the login page once when several requests on a page get 401 together', async () => {
    await openClientOn('/units')
    fetchMock.mockImplementation(async () => unauthorized())

    const results = await Promise.allSettled([client.fetchRooms(), client.fetchTenants()])

    expect(assign.mock.calls).toEqual([['/login']])
    for (const result of results) {
      expect(result.status).toBe('rejected')
      const error = (result as PromiseRejectedResult).reason
      expect(error).toBeInstanceOf(client.ApiError)
      expect(error).toMatchObject({ status: 401, message: 'Full authentication is required to access this resource' })
    }
  })

  // ล็อกอินซ้ำจากหน้าอื่น (เช่นตอน session หมดแล้วกรอกใหม่) รหัสผิดต้องเห็นข้อความ ไม่ใช่ถูกพาไปหน้าใหม่
  it('keeps a failed login on its form instead of reloading the page', async () => {
    await openClientOn('/units')
    fetchMock.mockResolvedValueOnce(response(401, { title: 'Unauthorized', detail: 'Invalid username or password' }))

    await expect(client.login('admin', 'wrong')).rejects.toMatchObject({ status: 401, message: 'Invalid username or password' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login')
    expect(assign).not.toHaveBeenCalled()
  })

  it('lets the auth check answer 401 on any page without redirecting from the client', async () => {
    await openClientOn('/units')
    fetchMock.mockResolvedValueOnce(unauthorized())

    await expect(client.fetchMe()).rejects.toMatchObject({ status: 401 })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/me')
    expect(assign).not.toHaveBeenCalled()
  })

  it('does not reload the login page when a request made there gets 401', async () => {
    await openClientOn('/login')
    fetchMock.mockResolvedValueOnce(unauthorized())

    await expect(client.fetchRooms()).rejects.toMatchObject({ status: 401 })

    expect(assign).not.toHaveBeenCalled()
  })

  it('does not redirect for other errors', async () => {
    await openClientOn('/units')
    fetchMock.mockResolvedValueOnce(response(403, { title: 'Forbidden', detail: 'Access is denied' }))

    await expect(client.fetchRooms()).rejects.toMatchObject({ status: 403, message: 'Access is denied' })

    expect(assign).not.toHaveBeenCalled()
  })
})
