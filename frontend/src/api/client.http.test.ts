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
  it('sends login credentials to the API with JSON headers', async () => {
    const user = { username: 'admin', displayName: 'Administrator', email: null, phone: null }
    fetchMock.mockResolvedValueOnce(jsonResponse(user))

    await expect(client.login('admin', 'secret')).resolves.toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret' }),
    })
  })

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

  it('sends the receipt ids to POST /api/receipts/send as a JSON body (SSK-143)', async () => {
    const result = {
      sent: [
        {
          receiptId: 1,
          receiptNo: 'RC-2026-0001',
          tenantName: 'Yuki Tanaka',
          email: 'yuki.t@example.com',
          sentAt: '2026-09-26T02:14:05.123Z',
          sentCount: 1,
        },
      ],
      skipped: [{ receiptId: 2, receiptNo: 'RC-2026-0002', tenantName: 'Kenji Sato', reason: 'NO_EMAIL' }],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(result))

    await expect(client.sendReceipts([1, 2])).resolves.toEqual(result)
    expect(fetchMock).toHaveBeenCalledWith('/api/receipts/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiptIds: [1, 2] }),
    })
  })

  it('sends the billing schedule to PUT /api/billing-schedule as a JSON body (SSK-143)', async () => {
    const saved = {
      enabled: true,
      dayOfMonth: 22,
      sendTime: '10:30',
      updatedAt: '2026-09-26T02:00:00.000Z',
      nextRunAt: '2026-10-22T03:30:00.000Z',
      lastRun: null,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(saved))

    await expect(client.updateBillingSchedule({ enabled: true, dayOfMonth: 22, sendTime: '10:30' })).resolves.toEqual(saved)
    expect(fetchMock).toHaveBeenCalledWith('/api/billing-schedule', {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, dayOfMonth: 22, sendTime: '10:30' }),
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

describe('document and attachment HTTP contract (SSK-161, SSK-172)', () => {
  it('sends only the document filters that are set, with the search trimmed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    await client.fetchDocuments({ type: 'RECEIPT_SCAN', roomId: 7, q: '  Yuki  ', from: '' })
    expect(fetchMock).toHaveBeenCalledWith('/api/documents?type=RECEIPT_SCAN&roomId=7&q=Yuki', {
      headers: { Accept: 'application/json' },
    })

    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    await client.fetchDocuments({ q: '   ' })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/documents', { headers: { Accept: 'application/json' } })
  })

  it('uploads a document as multipart with exactly one owner field and no hand-made Content-Type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 3 }, 201))
    const file = new File(['%PDF-1.4'], 'aircon-203.pdf', { type: 'application/pdf' })

    await client.uploadDocument({
      file,
      type: 'MAINTENANCE_REPORT',
      scanDate: '2026-11-28',
      description: '  Aircon report  ',
      owner: { kind: 'MAINTENANCE_TICKET', id: 41 },
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/documents')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Accept: 'application/json' })
    const form = init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect([...form.keys()]).toEqual(['file', 'type', 'scanDate', 'description', 'ticketId'])
    expect((form.get('file') as File).name).toBe('aircon-203.pdf')
    expect(form.get('type')).toBe('MAINTENANCE_REPORT')
    expect(form.get('scanDate')).toBe('2026-11-28')
    expect(form.get('description')).toBe('Aircon report')
    expect(form.get('ticketId')).toBe('41')
  })

  it('leaves out an empty description', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 4 }, 201))
    await client.uploadDocument({
      file: new File(['%PDF-1.4'], 'lease.pdf'),
      type: 'CONTRACT_SCAN',
      scanDate: '2026-11-01',
      description: '   ',
      owner: { kind: 'LEASE', id: 2 },
    })
    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData
    expect([...form.keys()]).toEqual(['file', 'type', 'scanDate', 'leaseId'])
  })

  it('uploads an attachment with ownerType and ownerId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7 }, 201))
    await client.uploadAttachment(new File(['x'], 'slip.jpg'), 'PAYMENT', 31)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/attachments')
    const form = init.body as FormData
    expect(form.get('ownerType')).toBe('PAYMENT')
    expect(form.get('ownerId')).toBe('31')
  })

  it('turns the HTML 413 page from nginx into the same message the backend sends', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html><body>413 Request Entity Too Large</body></html>', {
        status: 413,
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    await expect(client.uploadAttachment(new File(['x'], 'big.pdf'), 'LEASE', 1)).rejects.toMatchObject({
      name: 'ApiError',
      status: 413,
      message: 'The file is larger than 5 MB',
    })
  })

  it('keeps the backend message for other upload errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Only PDF, PNG and JPEG files are allowed' }, 415))
    await expect(
      client.uploadDocument({
        file: new File(['MZ'], 'x.png'),
        type: 'RECEIPT_SCAN',
        scanDate: '2026-11-01',
        owner: { kind: 'RECEIPT', id: 1 },
      }),
    ).rejects.toMatchObject({ status: 415, message: 'Only PDF, PNG and JPEG files are allowed' })
  })

  it('downloads file content through the client with the usual Accept header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), { headers: { 'Content-Type': 'application/pdf' } }),
    )

    const blob = await client.fetchAttachmentContent(12)

    expect(fetchMock).toHaveBeenCalledWith('/api/attachments/12/content', { headers: { Accept: 'application/json' } })
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBe(5)
  })

  it('deletes documents and attachments with DELETE', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await client.deleteDocument(3)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/documents/3', {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    })

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await client.deleteAttachment(7)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/attachments/7', {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    })
  })
})
