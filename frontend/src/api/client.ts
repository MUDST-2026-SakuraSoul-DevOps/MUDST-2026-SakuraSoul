import { mockFetch } from './mockApi'
import type {
  ApartmentConfig,
  ApartmentConfigRequest,
  AuthUser,
  CreateRoomRequest,
  CreateTenantRequest,
  Lease,
  LeaseQuery,
  LeaseRequest,
  LoginRequest,
  MaintenanceTicket,
  RoomDetail,
  RoomSummary,
  SettableRoomStatus,
  Tenant,
} from './types'

/**
 * ตอน dev คำขอไป /api ถูก proxy ไป localhost:8080 ตามที่ตั้งไว้ใน vite.config.ts
 * ตอนขึ้น production nginx เป็นคน proxy ให้ เลยใช้ path เดียวกันได้ทั้งสองที่
 */
const BASE_URL = '/api'

/**
 * เปิด backend จำลองด้วย VITE_API_MOCK=1 (ตั้งไว้ใน .env.development แล้ว)
 * ตั้งเป็น 0 เมื่อ endpoint สัญญาเช่าฝั่ง Spring ขึ้นจริง โค้ดหน้าเว็บไม่ต้องแก้
 */
const USE_MOCK = import.meta.env.VITE_API_MOCK === '1'

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

/**
 * 409 คือกรณีสัญญาเช่าทับช่วงเวลากัน ทั้งตอนสร้าง (US-05) และตอนแก้ (US-06-S2)
 * แยกออกมาเป็นฟังก์ชันเพราะหน้าจอต้องโชว์ error แบบนี้ติดกับฟอร์ม ไม่ใช่ทั้งหน้า
 */
export function isOverlapError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409
}

/** ข้อความที่เอาไปโชว์ผู้ใช้ได้จาก error อะไรก็ตามที่หลุดออกมาจาก client */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail = `The request failed (${response.status})`
  try {
    const problem = (await response.json()) as ProblemDetail
    detail = problem.detail ?? problem.title ?? detail
  } catch {
    // ตอบกลับมาไม่ใช่ JSON ก็ใช้ข้อความตั้งต้นไป
  }
  return new ApiError(response.status, detail)
}

/** /auth/* จัดการ 401 เอง (ล็อกอินผิด กับ ยามที่ถามว่าล็อกอินอยู่ไหม) ไม่ต้องเด้ง */
function isAuthPath(path: string): boolean {
  return path.startsWith('/auth/')
}

/**
 * หน้าหนึ่งยิงหลายคำขอพร้อมกัน พอ session หมดทุกคำขอจะ 401 พร้อมกัน
 * ธงนี้กันไม่ให้สั่งเปลี่ยนหน้าซ้ำหลายรอบจาก 401 ชุดเดียวกัน
 */
let redirectingToLogin = false

/**
 * session หมดอายุระหว่างใช้งานจะโผล่มาที่คำขอไหนก็ได้ (US-01-S3)
 * ดักที่นี่ที่เดียวตามที่ตกลงไว้ใน docs/frontend-workplan.md ข้อ 4 ไม่ต้องไปดักทีละหน้า
 * ใช้ location.assign ไม่ใช่ useNavigate เพราะชั้นนี้อยู่นอก React Router
 * และตอน session หมด การโหลดหน้าใหม่ทั้งใบคือสิ่งที่ต้องการอยู่แล้ว state เก่าทิ้งให้หมด
 */
function redirectToLogin(): void {
  if (redirectingToLogin || window.location.pathname === '/login') {
    return
  }
  redirectingToLogin = true
  window.location.assign('/login')
}

/** ยิงคำขอจริงหนึ่งครั้ง คืน Response ดิบ เป็นที่เดียวที่ดัก 401 */
async function send(path: string, init?: RequestInit): Promise<Response> {
  const response = USE_MOCK
    ? await mockFetch(path, init)
    : await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init?.headers },
      })
  if (response.status === 401 && !isAuthPath(path)) {
    redirectToLogin()
  }
  if (!response.ok) {
    throw await toApiError(response)
  }
  return response
}

/**
 * สำหรับ endpoint ที่ตอบ body กลับมา ซึ่งรวม POST /api/tenants (201 Created) ที่
 * ตอบตัวที่เพิ่งสร้างกลับมาด้วย จึงอ่าน json ได้เลยโดยไม่ต้องแยกเช็ค 204 ตรงนี้
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>
}

/** สำหรับ endpoint ที่ตอบ 204 ไม่มี body ตอนนี้มีแค่ POST /api/auth/logout */
async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
  await send(path, init)
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** ล็อกอินแอดมิน ตอบข้อมูลผู้ใช้กลับมาพร้อมตั้ง cookie ของ session ให้ในตัว (US-01) */
export function login(username: string, password: string): Promise<AuthUser> {
  const body: LoginRequest = { username, password }
  return request<AuthUser>('/auth/login', json('POST', body))
}

/** ถามว่าตอนนี้ล็อกอินอยู่ไหม ตอบ 401 ถ้า session หมดหรือยังไม่เคยล็อกอิน (US-01) */
export function fetchMe(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me')
}

/** ปิด session ฝั่ง server ตอบ 204 เสมอ ถึงจะหมดอายุไปก่อนแล้วก็ตาม (US-02) */
export function logout(): Promise<void> {
  return requestNoContent('/auth/logout', { method: 'POST' })
}

/**
 * backend ตัวจริงตอนนี้ยังคืนแค่ id/roomNumber/floor/baseRent เพราะไม่มีตาราง
 * lease (README หัวข้อ "ที่ยังไม่มี" ข้อ 1) เติมค่าตั้งต้นให้ตรงนี้ที่เดียว
 * หน้าจอจะได้ไม่ต้องเขียน `?? 'AVAILABLE'` กระจายไปทุกที่ และตอน backend เพิ่ม
 * ฟิลด์จริงมาแล้วก็ไม่ต้องแก้อะไร
 */
function normalizeRoom<T extends RoomSummary>(raw: T): T {
  return {
    ...raw,
    status: raw.status ?? 'AVAILABLE',
    currentLease: raw.currentLease ?? null,
    openMaintenanceCount: raw.openMaintenanceCount ?? 0,
    openMaintenanceTitle: raw.openMaintenanceTitle ?? null,
    roomType: raw.roomType ?? 'SINGLE',
  }
}

export async function fetchRooms(): Promise<RoomSummary[]> {
  const rooms = await request<RoomSummary[]>('/rooms')
  return rooms.map(normalizeRoom)
}

export async function fetchRoom(id: number | string): Promise<RoomDetail> {
  return normalizeRoom(await request<RoomDetail>(`/rooms/${id}`))
}

/**
 * เพิ่มห้องใหม่จากฟอร์ม Add Unit
 *
 * endpoint นี้ยังไม่มีฝั่ง Spring เพิ่งเพิ่มเข้าสัญญาตามดีไซน์รอบล่าสุด ดู
 * docs/api-contract-lease.md หัวข้อ Create room ระหว่างนี้ mock ตอบให้แล้ว
 */
export async function createRoom(body: CreateRoomRequest): Promise<RoomDetail> {
  return normalizeRoom(await request<RoomDetail>('/rooms', json('POST', body)))
}

/**
 * ล็อกห้องเป็นซ่อมบำรุง หรือปลดล็อกกลับเป็นว่าง (US-15)
 *
 * ส่งแค่ AVAILABLE กับ MAINTENANCE เท่านั้น ห้องที่ปลดล็อกแล้วยังมีสัญญา active
 * อยู่จะกลับไปเป็น OCCUPIED เอง เพราะสถานะมีผู้เช่าคำนวณจากสัญญา ไม่ได้เก็บตรง ๆ
 */
export async function updateRoomStatus(
  roomId: number,
  status: SettableRoomStatus,
): Promise<RoomDetail> {
  return normalizeRoom(await request<RoomDetail>(`/rooms/${roomId}/status`, json('PATCH', { status })))
}

export function deleteRoom(id: number | string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/rooms/${id}`, { method: 'DELETE' })
}


export function fetchTenants(): Promise<Tenant[]> {
  return request<Tenant[]>('/tenants')
}

export function fetchTenant(id: number | string): Promise<Tenant> {
  return request<Tenant>(`/tenants/${id}`)
}

export function createTenant(body: CreateTenantRequest): Promise<Tenant> {
  return request<Tenant>('/tenants', json('POST', body))
}

export function updateTenant(id: number | string, body: Partial<Tenant>): Promise<Tenant> {
  return request<Tenant>(`/tenants/${id}`, json('PUT', body))
}

export function deleteTenant(id: number | string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/tenants/${id}`, { method: 'DELETE' })
}

export function fetchLeases(query: LeaseQuery = {}): Promise<Lease[]> {
  const params = new URLSearchParams()
  if (query.status) {
    params.set('status', query.status)
  }
  if (query.roomId !== undefined) {
    params.set('roomId', String(query.roomId))
  }
  if (query.tenantId !== undefined) {
    params.set('tenantId', String(query.tenantId))
  }
  const suffix = params.toString()
  return request<Lease[]>(suffix === '' ? '/leases' : `/leases?${suffix}`)
}

/** ตอบ 409 พร้อมข้อความบอกช่วงวันที่ที่ชน เมื่อห้องไม่ว่าง (US-05-S1) */
export function createLease(body: LeaseRequest): Promise<Lease> {
  return request<Lease>('/leases', json('POST', body))
}

/** ตอบ 409 เหมือนตอนสร้าง เมื่อแก้วันที่ไปทับสัญญาอื่นของห้องเดียวกัน (US-06-S2) */
export function updateLease(id: number, body: LeaseRequest): Promise<Lease> {
  return request<Lease>(`/leases/${id}`, json('PUT', body))
}

/** ยกเลิก/ปิดสัญญา ทำให้ห้องกลับไปเป็นว่าง (US-06-S1) */
export function terminateLease(id: number, endDate: string): Promise<Lease> {
  return request<Lease>(`/leases/${id}/terminate`, json('POST', { endDate }))
}

/** อัตราค่าสาธารณูปโภคของตึก ใช้คำนวณใบเสร็จ (US-16) */
export function fetchApartmentConfig(): Promise<ApartmentConfig> {
  return request<ApartmentConfig>('/apartment-config')
}

/** ตอบ 400 เมื่ออัตราติดลบหรือไม่ใช่ตัวเลข (US-16-S2) */
export function updateApartmentConfig(body: ApartmentConfigRequest): Promise<ApartmentConfig> {
  return request<ApartmentConfig>('/apartment-config', json('PUT', body))
}

/**
 * งานซ่อมของห้อง เป็นของ epic CR-05 ที่ทีมอื่นดูแล endpoint อาจยังไม่มี
 * ถ้าโดน 404 ให้ถือว่ายังไม่มีใบแจ้งซ่อม จะได้ไม่ทำให้ป็อปอัปทั้งอันพัง
 */
export async function fetchMaintenanceLog(): Promise<MaintenanceTicket[]> {
  try {
    return await request<MaintenanceTicket[]>('/maintenance')
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return []
    }
    throw error
  }
}

export async function fetchRoomMaintenance(roomId: number): Promise<MaintenanceTicket[]> {
  try {
    return await request<MaintenanceTicket[]>(`/rooms/${roomId}/maintenance`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return []
    }
    throw error
  }
}
