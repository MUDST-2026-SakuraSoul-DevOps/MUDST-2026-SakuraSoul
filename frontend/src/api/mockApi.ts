import { findConflictingLease, isBackwardsRange, overlapMessage } from '../domain/lease'
import { validateApartmentConfig } from '../domain/apartmentConfig'
import { validateTenant } from '../domain/tenant'
import { validateRoom } from '../domain/room'
import type {
  ApartmentConfig,
  ApartmentConfigRequest,
  CreateRoomRequest,
  Lease,
  LeaseRequest,
  MaintenanceTicket,
  RoomStatus,
  RoomType,
  Tenant,
} from './types'
import { todayInBangkok } from '../format'

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

/**
 * วันที่นับจากวันนี้ตามเวลาไทย ใช้ตั้งข้อมูลตัวอย่าง
 *
 * เดิมใช้ toISOString ซึ่งคืนวัน UTC ทำให้ช่วงเที่ยงคืนถึงเกือบเจ็ดโมงเช้าตาม
 * เวลาไทย ข้อมูลตัวอย่างทั้งชุดเลื่อนไปหนึ่งวัน แล้วสัญญาที่ตั้งใจให้หมดวันนี้
 * กลายเป็นหมดไปแล้วเมื่อวาน ซึ่งทำให้เทสที่พึ่งวันสัมพัทธ์แกว่งตามเวลาที่รัน
 */
function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return todayInBangkok(d)
}

interface MockRoom {
  id: number
  roomNumber: string
  floor: number
  roomType: RoomType
  baseRent: number
  note: string | null
  address: string | null
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

const BUILDING_ADDRESS = 'Building A, 123 Street'

/**
 * 24 ห้อง ชั้นละ 12 ตรงกับ V2__seed_rooms.sql ของ backend
 *
 * ประเภทห้องยังไม่มีใน seed ของ backend จริง ตรงนี้แจกแบบห้องเลขคู่เป็นห้องคู่
 * เพื่อให้ตารางมีทั้งสองแบบให้เห็น พอ backend เพิ่มคอลัมน์จริงค่อยยึดของจริงแทน
 */
function seedRooms(): MockRoom[] {
  const rooms: MockRoom[] = []
  let id = 1
  for (const floor of [1, 2]) {
    for (let n = 1; n <= 12; n += 1) {
      rooms.push({
        id,
        roomNumber: String(floor * 100 + n),
        floor,
        roomType: n % 2 === 0 ? 'DOUBLE' : 'SINGLE',
        baseRent: floor === 1 ? 3500 : 3800,
        note: null,
        address: BUILDING_ADDRESS,
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
      throw new Error(`Bad seed data: no unit ${roomNumber}`)
    }
    return room
  }

  byNumber('106').underMaintenance = true
  byNumber('206').underMaintenance = true

  const tenants: Tenant[] = [
    { id: 1, fullName: 'Yuki Tanaka', email: 'yuki.t@example.com', phone: '081-234-5678', nationalId: '1100400123450' },
    { id: 2, fullName: 'Kenji Sato', email: 'kenji.s@example.com', phone: '082-345-6789', nationalId: '1100400234561' },
    { id: 3, fullName: 'Hiroshi Nakamura', email: 'hiroshi.n@example.com', phone: '083-456-7890', nationalId: '1100400345673' },
    { id: 4, fullName: 'Aiko Tanaka', email: 'somchai.j@example.com', phone: '084-567-8901', nationalId: '1100400456785' },
    { id: 5, fullName: 'Arisa Fujimoto', email: 'arisa.p@example.com', phone: '085-678-9012', nationalId: '1100400567897' },
    { id: 6, fullName: 'Haruto Watanabe', email: 'thanakrit.w@example.com', phone: '086-789-0123', nationalId: null },
  ]

  const leases: Lease[] = [
    {
      id: 1,
      roomId: byNumber('102').id,
      roomNumber: '102',
      tenantId: 1,
      tenantName: 'Yuki Tanaka',
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
      tenantName: 'Kenji Sato',
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
      tenantName: 'Hiroshi Nakamura',
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
      tenantName: 'Aiko Tanaka',
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
      tenantName: 'Arisa Fujimoto',
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
      title: 'AC compressor replacement',
      detail: 'Air conditioner not cooling. Technician booked to swap the compressor; unit closed during the work.',
      status: 'IN_PROGRESS',
      reportedAt: isoDate(-6),
    },
    {
      id: 2,
      roomId: byNumber('206').id,
      roomNumber: '206',
      title: 'Bathroom drain pipe leaking',
      detail: 'Water seeping into the ceiling below. Waiting on the plumber to lift the tiles.',
      status: 'OPEN',
      reportedAt: isoDate(-2),
    },
    {
      id: 3,
      roomId: byNumber('104').id,
      roomNumber: '104',
      title: 'Scheduled AC cleaning',
      detail: 'Six-month service due. Cleaning booked.',
      status: 'OPEN',
      reportedAt: isoDate(-1),
    },
    {
      id: 4,
      roomId: byNumber('201').id,
      roomNumber: '201',
      title: 'Bathroom tap dripping',
      detail: 'Tenant reports the tap drips constantly.',
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
    roomType: room.roomType,
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
  return withNote ? { ...base, note: room.note, address: room.address } : base
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
    return problem(404, 'Not Found', `No unit with id ${body.roomId}`)
  }
  if (!tenant) {
    return problem(404, 'Not Found', `No tenant with id ${body.tenantId}`)
  }
  if (isBackwardsRange(body.startDate, body.endDate)) {
    return problem(400, 'Bad Request', 'The end date cannot be before the start date')
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
    if (method === 'POST' && segments.length === 1) {
      const request: CreateRoomRequest = {
        roomNumber: String(body?.roomNumber ?? '').trim(),
        floor: Number(body?.floor),
        roomType: (body?.roomType ?? 'SINGLE') as RoomType,
        address: body?.address ? String(body.address).trim() : undefined,
      }
      const invalid = validateRoom(request)
      if (invalid !== null) {
        return problem(400, 'Bad Request', invalid)
      }
      // เลขห้องซ้ำต้องไม่ผ่าน ฝั่งจริงมี unique constraint บน room_number อยู่แล้ว
      if (store.rooms.some((r) => r.roomNumber === request.roomNumber)) {
        return problem(409, 'Conflict', `Unit ${request.roomNumber} already exists`)
      }
      const created: MockRoom = {
        id: store.nextId,
        roomNumber: request.roomNumber,
        floor: request.floor,
        roomType: request.roomType,
        baseRent: request.floor === 1 ? 3500 : 3800,
        note: null,
        address: request.address ?? BUILDING_ADDRESS,
        underMaintenance: false,
      }
      store.nextId += 1
      store.rooms.push(created)
      store.rooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber))
      return ok(roomPayload(created, true), 201)
    }
    const room = store.rooms.find((r) => String(r.id) === segments[1])
    if (!room) {
      return problem(404, 'Not Found', `No unit with id ${segments[1]}`)
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
        return problem(400, 'Bad Request', 'Only MAINTENANCE and AVAILABLE can be set directly')
      }
      // เก็บเป็นธงแยก ไม่ได้ทับสถานะที่คำนวณจากสัญญา ปลดล็อกแล้วห้องที่ยังมีคนเช่า
      // จึงกลับไปเป็น OCCUPIED เองโดยไม่ต้องจำว่าก่อนล็อกมันเป็นอะไร
      room.underMaintenance = status === 'MAINTENANCE'
      return ok(roomPayload(room, true))
    }
  }

  if (segments[0] === 'maintenance') {
    if (method === 'GET' && segments.length === 1) {
      // เรียงใบล่าสุดขึ้นก่อน คนเปิดหน้า Log มาดูว่าเพิ่งมีอะไรแจ้งเข้ามา
      return ok([...store.tickets].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)))
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
      return tenant ? ok(tenant) : problem(404, 'Not Found', `No tenant with id ${segments[1]}`)
    }
    if (method === 'PUT' && segments.length === 2) {
      const id = Number(segments[1])
      const existing = store.tenants.find((t) => t.id === id)
      if (!existing) {
        return problem(404, 'Not Found', `No tenant with id ${segments[1]}`)
      }
      const updated: Tenant = {
        ...existing,
        fullName: String(body?.fullName ?? existing.fullName).trim(),
        email: String(body?.email ?? existing.email).trim(),
        phone: String(body?.phone ?? existing.phone).trim(),
        nationalId: (body?.nationalId as string | null | undefined) ?? existing.nationalId,
      }
      store.tenants = store.tenants.map((t) => (t.id === id ? updated : t))
      return ok(updated)
    }
    if (method === 'DELETE' && segments.length === 2) {
      const id = Number(segments[1])
      store.tenants = store.tenants.filter((t) => t.id !== id)
      return ok({ success: true })
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
      return problem(404, 'Not Found', `No lease with id ${segments[1]}`)
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
        return problem(409, 'Conflict', 'This lease has already ended')
      }
      const endDate = String(body?.endDate ?? isoDate(0))
      if (endDate < existing.startDate) {
        return problem(400, 'Bad Request', 'The end date cannot be before the start date')
      }
      const ended: Lease = { ...existing, status: 'ENDED', endDate }
      store.leases = store.leases.map((l) => (l.id === existing.id ? ended : l))
      return ok(ended)
    }
  }

  return problem(404, 'Not Found', `The mock does not handle ${method} /api${path} yet`)
}
