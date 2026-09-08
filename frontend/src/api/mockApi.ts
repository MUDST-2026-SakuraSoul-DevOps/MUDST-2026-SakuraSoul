import { findConflictingLease, isBackwardsRange, overlapMessage } from '../domain/lease'
import { validateApartmentConfig } from '../domain/apartmentConfig'
import { validateTenant } from '../domain/tenant'
import type {
  ApartmentConfig,
  ApartmentConfigRequest,
  Lease,
  LeaseRequest,
  MaintenanceTicket,
  RoomStatus,
  Tenant,
} from './types'

/**
 * backend จำลองที่รันอยู่ในเบราว์เซอร์ เปิดใช้ด้วย VITE_API_MOCK=1
 *
 * ทำไมต้องมี: หน้าจอที่ทีมได้รับมอบหมาย (US-05 ถึง US-09) ทั้งหมดหมุนรอบตาราง
 * lease ซึ่งฝั่ง backend ยังไม่ได้ทำ (README หัวข้อ "ที่ยังไม่มี" ข้อ 1) ถ้ารอ
 * ให้เสร็จก่อนค่อยเริ่มก็จะเสียเวลาไปเปล่า ๆ ทั้งสปรินต์ ตัวนี้เลยตอบตามสัญญา
 * เดียวกับที่ตกลงไว้ใน docs/api-contract-lease.md เพื่อให้เขียนหน้าจอกับเทสจบได้
 * ก่อน พอ endpoint จริงขึ้น ให้ตั้ง VITE_API_MOCK=0 แล้วโค้ดหน้าเว็บไม่ต้องแก้
 * สักบรรทัด
 *
 * ข้อจำกัดที่ตั้งใจ: เก็บใน memory ล้วน กด refresh แล้วข้อมูลกลับไปตั้งต้น และ
 * การเช็คสัญญาทับกันเป็นแบบทีละคำขอ จับ race condition ตาม US-05-S2 ไม่ได้
 * ข้อนั้นต้องพิสูจน์ด้วย integration test ฝั่ง backend กับ exclusion constraint จริง
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

interface MockRoom {
  id: number
  roomNumber: string
  floor: number
  baseRent: number
  note: string | null
  /** ห้องที่ปิดซ่อม สถานะนี้ชนะสถานะจากสัญญาเสมอ */
  underMaintenance: boolean
}

interface Store {
  rooms: MockRoom[]
  tenants: Tenant[]
  leases: Lease[]
  tickets: MaintenanceTicket[]
  config: ApartmentConfig
  nextId: number
}

/** 24 ห้อง ชั้นละ 12 ตรงกับ V2__seed_rooms.sql ของ backend */
function seedRooms(): MockRoom[] {
  const rooms: MockRoom[] = []
  let id = 1
  for (const floor of [1, 2]) {
    for (let n = 1; n <= 12; n += 1) {
      rooms.push({
        id,
        roomNumber: String(floor * 100 + n),
        floor,
        baseRent: floor === 1 ? 3500 : 3800,
        note: null,
        underMaintenance: false,
      })
      id += 1
    }
  }
  return rooms
}

function seed(): Store {
  const rooms = seedRooms()
  const byNumber = (roomNumber: string): MockRoom => {
    const room = rooms.find((r) => r.roomNumber === roomNumber)
    if (!room) {
      throw new Error(`seed ผิด ไม่มีห้อง ${roomNumber}`)
    }
    return room
  }

  byNumber('106').underMaintenance = true
  byNumber('206').underMaintenance = true

  const tenants: Tenant[] = [
    { id: 1, fullName: 'ยูกิ ทานากะ', email: 'yuki.t@example.com', phone: '081-234-5678', nationalId: '1100400123456' },
    { id: 2, fullName: 'เคนจิ ซาโต้', email: 'kenji.s@example.com', phone: '082-345-6789', nationalId: '1100400234567' },
    { id: 3, fullName: 'ฮิโรชิ นากามุระ', email: 'hiroshi.n@example.com', phone: '083-456-7890', nationalId: '1100400345678' },
    { id: 4, fullName: 'สมชาย ใจดี', email: 'somchai.j@example.com', phone: '084-567-8901', nationalId: '1100400456789' },
    { id: 5, fullName: 'อาริสา พงษ์ศิริ', email: 'arisa.p@example.com', phone: '085-678-9012', nationalId: '1100400567890' },
    { id: 6, fullName: 'ธนกฤต วัฒนชัย', email: 'thanakrit.w@example.com', phone: '086-789-0123', nationalId: null },
  ]

  const leases: Lease[] = [
    {
      id: 1,
      roomId: byNumber('102').id,
      roomNumber: '102',
      tenantId: 1,
      tenantName: 'ยูกิ ทานากะ',
      startDate: isoDate(-320),
      endDate: isoDate(12),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
      status: 'ACTIVE',
    },
    {
      id: 2,
      roomId: byNumber('201').id,
      roomNumber: '201',
      tenantId: 2,
      tenantName: 'เคนจิ ซาโต้',
      startDate: isoDate(-150),
      endDate: isoDate(215),
      monthlyRent: 3800,
      billingCycle: 'MONTHLY',
      status: 'ACTIVE',
    },
    {
      id: 3,
      roomId: byNumber('207').id,
      roomNumber: '207',
      tenantId: 3,
      tenantName: 'ฮิโรชิ นากามุระ',
      startDate: isoDate(-60),
      endDate: null,
      monthlyRent: 3800,
      billingCycle: 'MONTHLY',
      status: 'ACTIVE',
    },
    {
      id: 4,
      roomId: byNumber('110').id,
      roomNumber: '110',
      tenantId: 4,
      tenantName: 'สมชาย ใจดี',
      startDate: isoDate(-30),
      endDate: isoDate(700),
      monthlyRent: 42000,
      billingCycle: 'YEARLY',
      status: 'ACTIVE',
    },
    {
      id: 5,
      roomId: byNumber('103').id,
      roomNumber: '103',
      tenantId: 5,
      tenantName: 'อาริสา พงษ์ศิริ',
      startDate: isoDate(-700),
      endDate: isoDate(-330),
      monthlyRent: 3400,
      billingCycle: 'MONTHLY',
      status: 'ENDED',
    },
  ]

  const tickets: MaintenanceTicket[] = [
    {
      id: 1,
      roomId: byNumber('106').id,
      roomNumber: '106',
      title: 'เปลี่ยนคอมเพรสเซอร์แอร์',
      detail: 'แอร์ไม่เย็น ช่างนัดเข้าเปลี่ยนคอมเพรสเซอร์ ปิดห้องระหว่างซ่อม',
      status: 'IN_PROGRESS',
      reportedAt: isoDate(-6),
    },
    {
      id: 2,
      roomId: byNumber('206').id,
      roomNumber: '206',
      title: 'ท่อน้ำทิ้งห้องน้ำรั่ว',
      detail: 'น้ำซึมลงฝ้าห้องข้างล่าง รอช่างประปาเข้ารื้อกระเบื้อง',
      status: 'OPEN',
      reportedAt: isoDate(-2),
    },
    {
      id: 3,
      roomId: byNumber('104').id,
      roomNumber: '104',
      title: 'ล้างแอร์ตามรอบ',
      detail: 'ครบรอบ 6 เดือน นัดล้างแอร์',
      status: 'OPEN',
      reportedAt: isoDate(-1),
    },
    {
      id: 4,
      roomId: byNumber('201').id,
      roomNumber: '201',
      title: 'ก๊อกอ่างล้างหน้าหยด',
      detail: 'ผู้เช่าแจ้งว่าน้ำหยดตลอดเวลา',
      status: 'OPEN',
      reportedAt: isoDate(-3),
    },
  ]

  // อัตราตั้งต้นอิงราคาหอพักแถวมหาวิทยาลัยจริง ไม่ได้ตั้งใจให้เป็นค่าถาวร
  // แอดมินเข้าไปแก้ได้ที่หน้า Apartment Config
  const config: ApartmentConfig = {
    electricRatePerUnit: 8,
    waterRatePerUnit: 18,
    commonAreaFee: 300,
    internetFee: 250,
    updatedAt: isoDate(-30),
  }

  return { rooms, tenants, leases, tickets, config, nextId: 100 }
}

let store: Store = seed()

/** ให้เทสเรียกเพื่อกลับไปสถานะตั้งต้น จะได้ไม่ต้องพึ่งลำดับการรัน */
export function resetMockStore(): void {
  store = seed()
}

function activeLeaseOf(roomId: number): Lease | null {
  const today = isoDate(0)
  return (
    store.leases.find(
      (l) =>
        l.roomId === roomId &&
        l.status === 'ACTIVE' &&
        l.startDate <= today &&
        (l.endDate === null || l.endDate >= today),
    ) ?? null
  )
}

function statusOf(room: MockRoom): RoomStatus {
  if (room.underMaintenance) {
    return 'MAINTENANCE'
  }
  return activeLeaseOf(room.id) === null ? 'AVAILABLE' : 'OCCUPIED'
}

function roomPayload(room: MockRoom, withNote: boolean) {
  const lease = activeLeaseOf(room.id)
  // เรียงตามวันแจ้งเพื่อให้ใบที่เก่าที่สุดเป็นตัวที่ขึ้นบนการ์ด ค้างมานานสุดควรเห็นก่อน
  const openTickets = store.tickets
    .filter((t) => t.roomId === room.id && t.status !== 'DONE')
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
  const base = {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor,
    baseRent: room.baseRent,
    status: statusOf(room),
    currentLease:
      lease === null
        ? null
        : {
            id: lease.id,
            tenantId: lease.tenantId,
            tenantName: lease.tenantName,
            startDate: lease.startDate,
            endDate: lease.endDate,
            monthlyRent: lease.monthlyRent,
            billingCycle: lease.billingCycle,
          },
    openMaintenanceCount: openTickets.length,
    openMaintenanceTitle: openTickets[0]?.title ?? null,
  }
  return withNote ? { ...base, note: room.note } : base
}

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** ตอบ error ให้หน้าตาเหมือน ProblemDetail (RFC 9457) ที่ Spring ฝั่งจริงตอบ */
function problem(status: number, title: string, detail: string): Response {
  return new Response(JSON.stringify({ status, title, detail }), { status, headers: JSON_HEADERS })
}

function leaseFromRequest(id: number, body: LeaseRequest): Lease | Response {
  const room = store.rooms.find((r) => r.id === body.roomId)
  const tenant = store.tenants.find((t) => t.id === body.tenantId)
  if (!room) {
    return problem(404, 'Not Found', `ไม่พบห้อง id ${body.roomId}`)
  }
  if (!tenant) {
    return problem(404, 'Not Found', `ไม่พบผู้เช่า id ${body.tenantId}`)
  }
  if (isBackwardsRange(body.startDate, body.endDate)) {
    return problem(400, 'Bad Request', 'วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา')
  }
  return {
    id,
    roomId: room.id,
    roomNumber: room.roomNumber,
    tenantId: tenant.id,
    tenantName: tenant.fullName,
    startDate: body.startDate,
    endDate: body.endDate,
    monthlyRent: body.monthlyRent,
    billingCycle: body.billingCycle,
    status: 'ACTIVE',
  }
}

/**
 * router ง่าย ๆ ของ mock รับ path ที่ตัด /api ออกมาแล้ว
 * ตั้งใจไม่ใช้ library เพื่อไม่ให้ dependency ของโปรเจกต์งอกเพราะของชั่วคราว
 */
export async function mockFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const [rawPath, rawQuery] = path.split('?')
  const query = new URLSearchParams(rawQuery ?? '')
  const segments = rawPath.split('/').filter(Boolean)
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null

  if (segments[0] === 'rooms') {
    if (method === 'GET' && segments.length === 1) {
      return ok(store.rooms.map((room) => roomPayload(room, false)))
    }
    const room = store.rooms.find((r) => String(r.id) === segments[1])
    if (!room) {
      return problem(404, 'Not Found', `ไม่พบห้อง id ${segments[1]}`)
    }
    if (method === 'GET' && segments.length === 2) {
      return ok(roomPayload(room, true))
    }
    if (method === 'GET' && segments[2] === 'maintenance') {
      return ok(store.tickets.filter((t) => t.roomId === room.id))
    }
    if (method === 'PATCH' && segments[2] === 'status') {
      const status = String(body?.status ?? '')
      if (status !== 'MAINTENANCE' && status !== 'AVAILABLE') {
        return problem(400, 'Bad Request', 'สถานะที่ตั้งเองได้มีแค่ MAINTENANCE กับ AVAILABLE')
      }
      // เก็บเป็นธงแยก ไม่ได้ทับสถานะที่คำนวณจากสัญญา ปลดล็อกแล้วห้องที่ยังมีคนเช่า
      // จึงกลับไปเป็น OCCUPIED เองโดยไม่ต้องจำว่าก่อนล็อกมันเป็นอะไร
      room.underMaintenance = status === 'MAINTENANCE'
      return ok(roomPayload(room, true))
    }
  }

  if (segments[0] === 'tenants') {
    if (method === 'GET' && segments.length === 1) {
      return ok(store.tenants)
    }
    if (method === 'POST' && segments.length === 1) {
      const draft = {
        fullName: String(body?.fullName ?? '').trim(),
        email: String(body?.email ?? '').trim(),
        phone: String(body?.phone ?? '').trim(),
        nationalId: (body?.nationalId as string | undefined)?.trim(),
      }
      const invalid = validateTenant(draft)
      if (invalid) {
        return problem(400, 'Bad Request', invalid)
      }
      store.nextId += 1
      const tenant: Tenant = {
        id: store.nextId,
        fullName: draft.fullName,
        email: draft.email,
        phone: draft.phone,
        nationalId: draft.nationalId === '' || draft.nationalId === undefined ? null : draft.nationalId,
      }
      store.tenants = [...store.tenants, tenant]
      return ok(tenant, 201)
    }
    if (method === 'GET' && segments.length === 2) {
      const tenant = store.tenants.find((t) => String(t.id) === segments[1])
      return tenant ? ok(tenant) : problem(404, 'Not Found', `ไม่พบผู้เช่า id ${segments[1]}`)
    }
  }

  if (segments[0] === 'apartment-config' && segments.length === 1) {
    if (method === 'GET') {
      return ok(store.config)
    }
    if (method === 'PUT') {
      const draft = body as unknown as ApartmentConfigRequest
      const invalid = validateApartmentConfig(draft)
      if (invalid) {
        return problem(400, 'Bad Request', invalid)
      }
      store.config = { ...draft, updatedAt: isoDate(0) }
      return ok(store.config)
    }
  }

  if (segments[0] === 'leases') {
    if (method === 'GET' && segments.length === 1) {
      const status = query.get('status')
      const roomId = query.get('roomId')
      const tenantId = query.get('tenantId')
      return ok(
        store.leases.filter(
          (l) =>
            (status === null || l.status === status) &&
            (roomId === null || String(l.roomId) === roomId) &&
            (tenantId === null || String(l.tenantId) === tenantId),
        ),
      )
    }

    if (method === 'POST' && segments.length === 1) {
      store.nextId += 1
      const draft = leaseFromRequest(store.nextId, body as unknown as LeaseRequest)
      if (draft instanceof Response) {
        return draft
      }
      const conflict = findConflictingLease(store.leases, draft)
      if (conflict) {
        return problem(409, 'Conflict', overlapMessage(conflict))
      }
      store.leases = [...store.leases, draft]
      return ok(draft, 201)
    }

    const existing = store.leases.find((l) => String(l.id) === segments[1])
    if (!existing) {
      return problem(404, 'Not Found', `ไม่พบสัญญา id ${segments[1]}`)
    }

    if (method === 'PUT' && segments.length === 2) {
      const draft = leaseFromRequest(existing.id, body as unknown as LeaseRequest)
      if (draft instanceof Response) {
        return draft
      }
      const conflict = findConflictingLease(store.leases, draft, existing.id)
      if (conflict) {
        return problem(409, 'Conflict', overlapMessage(conflict))
      }
      const updated: Lease = { ...draft, status: existing.status }
      store.leases = store.leases.map((l) => (l.id === existing.id ? updated : l))
      return ok(updated)
    }

    if (method === 'POST' && segments[2] === 'terminate') {
      if (existing.status === 'ENDED') {
        return problem(409, 'Conflict', 'สัญญานี้สิ้นสุดไปแล้ว')
      }
      const endDate = String(body?.endDate ?? isoDate(0))
      if (endDate < existing.startDate) {
        return problem(400, 'Bad Request', 'วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา')
      }
      const ended: Lease = { ...existing, status: 'ENDED', endDate }
      store.leases = store.leases.map((l) => (l.id === existing.id ? ended : l))
      return ok(ended)
    }
  }

  return problem(404, 'Not Found', `mock ยังไม่รองรับ ${method} /api${path}`)
}
