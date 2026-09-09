import type { CreateTenantRequest, RoomDetail, RoomSummary, Tenant } from './types'

/**
 * ตอน dev คำขอไป /api ถูก proxy ไป localhost:8080 ตามที่ตั้งไว้ใน vite.config.ts
 * ตอนขึ้น production nginx เป็นคน proxy ให้ เลยใช้ path เดียวกันได้ทั้งสองที่
 */
const BASE_URL = '/api'

/** backend ตอบ error เป็น ProblemDetail ตาม RFC 9457 ข้อความที่คนอ่านอยู่ในฟิลด์ detail */
interface ProblemDetail {
  title?: string
  detail?: string
  status?: number
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail = `เรียก API ไม่สำเร็จ (${response.status})`
  try {
    const problem = (await response.json()) as ProblemDetail
    detail = problem.detail ?? problem.title ?? detail
  } catch {
    // ตอบกลับมาไม่ใช่ JSON ก็ใช้ข้อความตั้งต้นไป
  }
  return new ApiError(response.status, detail)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    throw await toApiError(response)
  }
  // POST /api/tenants (201 Created) ก็ตอบ body กลับมาเหมือนกัน จึงไม่ต้องเช็ค 204 แยก
  return (await response.json()) as T
}

export function fetchRooms(): Promise<RoomSummary[]> {
  return request<RoomSummary[]>('/rooms')
}

export function fetchRoom(id: number | string): Promise<RoomDetail> {
  return request<RoomDetail>(`/rooms/${id}`)
}

export function fetchTenants(): Promise<Tenant[]> {
  return request<Tenant[]>('/tenants')
}

export function fetchTenant(id: number | string): Promise<Tenant> {
  return request<Tenant>(`/tenants/${id}`)
}

export function createTenant(body: CreateTenantRequest): Promise<Tenant> {
  return request<Tenant>('/tenants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
