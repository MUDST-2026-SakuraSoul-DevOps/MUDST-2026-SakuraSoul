import { findConflictingLease, isBackwardsRange, overlapMessage } from '../domain/lease'
import { validateApartmentConfig } from '../domain/apartmentConfig'
import { validateTenant } from '../domain/tenant'
import { validateRoom } from '../domain/room'
import type {
  ApartmentConfig,
  ApartmentConfigRequest,
  AuthUser,
  CreateRoomRequest,
  Lease,
  LeaseRequest,
  MaintenancePriority,
  MaintenanceStatus,
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
 * แอดมินคนเดียวของ backend จำลอง GET /auth/me ตอบตัวนี้เสมอ เทสของหน้าอื่นจะได้
 * ไม่ต้องล็อกอินก่อน ไม่ได้เก็บไว้ใน Store เพราะไม่มีคำขอไหนแก้มันได้
 * resetMockStore จึงไม่ต้องรู้จัก
 */
const MOCK_ADMIN: AuthUser = {
  username: 'admin',
  displayName: 'Administrator',
  email: null,
  phone: null,
}

/**
 * ช่องที่เหลือของใบแจ้งซ่อมตามสัญญา API ชุดเดียวกับ DevDataSeeder ฝั่ง backend (SSK-131)
 * วันนัดคิดจากวันนี้ ข้อมูลตัวอย่างจะได้ไม่ดูเก่า
 */
function ticketExtras(
  maintenanceType: string,
  priority: MaintenancePriority,
  scheduledDate: string | null,
): Pick<MaintenanceTicket, 'maintenanceType' | 'priority' | 'scheduledDate' | 'cost' | 'source' | 'closedAt' | 'suppliesUsed'> {
  return { maintenanceType, priority, scheduledDate, cost: null, source: 'MANUAL', closedAt: null, suppliesUsed: [] }
}

const MAINTENANCE_STATUSES: MaintenanceStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE']
const MAINTENANCE_PRIORITIES: MaintenancePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

/** ช่องว่างล้วนเก็บเป็น null กฎเดียวกับ MaintenanceTicket.trimToNull ฝั่ง backend */
function trimToNull(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

/** ช่องที่ตรวจเหมือนกันทั้งตอนสร้างและตอน PATCH ข้อความตรงกับ backend */
function invalidTicketFields(body: Record<string, unknown>): Response | null {
  if (
    body.priority !== undefined &&
    body.priority !== null &&
    !MAINTENANCE_PRIORITIES.includes(body.priority as MaintenancePriority)
  ) {
    return problem(400, 'Bad Request', 'Priority must be LOW, MEDIUM, HIGH or URGENT')
  }
  if (typeof body.cost === 'number' && body.cost < 0) {
    return problem(400, 'Bad Request', 'The cost cannot be negative')
  }
  return null
}

/**
 * เวลาเต็มแบบ ISO เหมือน reportedAt ที่ backend ส่ง (Instant) ไม่ใช่วันที่ล้วน
 * seed ใบแจ้งซ่อมด้วยรูปแบบเดียวกับของจริง หน้าเว็บจะได้เจอค่าแบบเดียวกันทั้งสองโหมด (SSK-131)
 */
function isoTimestamp(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString()
}

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

/*
  ค่าเช่าตามประเภทห้อง เลียนแบบตาราง room_type_rate ของ backend (V12 SSK-127)
  ใช้ใน mock เท่านั้น หน้าเว็บจริงรู้ค่าเช่าจาก baseRent ของห้องกับ monthlyRent ของสัญญา

  หมายเหตุ: backend (V11) กำหนดประเภทห้องตามชั้น แต่ mock ใช้เลขห้องคู่/คี่ ตามที่เทสเดิม
  คาดหวังไว้ (102 เป็น Double) ผลต่อราคาเหมือนกันคือราคาตามประเภทห้อง
*/
const MOCK_ROOM_TYPE_RENT: Record<RoomType, number> = {
  SINGLE: 3500,
  DOUBLE: 4500,
}

interface MockRoom {
  id: number
  roomNumber: string
  floor: number
  roomType: RoomType
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

  // อัตราตั้งต้นอิงราคาหอพักแถวมหาวิทยาลัยจริง ไม่ได้ตั้งใจให้เป็นค่าถาวร
  // แอดมินเข้าไปแก้ได้ที่หน้า Apartment Config
  const config: ApartmentConfig = {
    electricRatePerUnit: 50,
    waterRatePerUnit: 100,
    commonAreaFee: 300,
    internetFee: 250,
    updatedAt: isoDate(-30),
  }

  /*
    สัญญาจริงล็อกอัตราสี่ตัวจาก Config ตอนเซ็น (LeaseService) และ LeaseResponse ส่งมาครบเสมอ
    สัญญาตัวอย่างจึงต้องมีครบเหมือนกัน เดิมไม่มีเลย หน้าเว็บในโหมด mock เลยต้องเดาค่าเอง (SSK-136)
  */
  const locked = {
    electricRatePerUnit: config.electricRatePerUnit,
    waterRatePerUnit: config.waterRatePerUnit,
    commonAreaFee: config.commonAreaFee,
    internetFee: config.internetFee,
  }

  const leases: Lease[] = [
    {
      id: 1,
      roomId: byNumber('102').id,
      roomNumber: '102',
      tenantId: 1,
      tenantName: 'Yuki Tanaka',
      startDate: isoDate(-320),
      endDate: isoDate(12),
      monthlyRent: 4500,
      billingCycle: 'MONTHLY',
      securityDeposit: 9000,
      status: 'ACTIVE',
      ...locked,
    },
    {
      id: 2,
      roomId: byNumber('201').id,
      roomNumber: '201',
      tenantId: 2,
      tenantName: 'Kenji Sato',
      startDate: isoDate(-150),
      endDate: isoDate(215),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
      securityDeposit: 7000,
      status: 'ACTIVE',
      ...locked,
    },
    {
      id: 3,
      roomId: byNumber('207').id,
      roomNumber: '207',
      tenantId: 3,
      tenantName: 'Hiroshi Nakamura',
      startDate: isoDate(-60),
      endDate: null,
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
      securityDeposit: 7000,
      status: 'ACTIVE',
      ...locked,
    },
    {
      id: 4,
      roomId: byNumber('110').id,
      roomNumber: '110',
      tenantId: 4,
      tenantName: 'Aiko Tanaka',
      startDate: isoDate(-30),
      endDate: isoDate(700),
      monthlyRent: 4500,
      billingCycle: 'YEARLY',
      securityDeposit: 9000,
      status: 'ACTIVE',
      ...locked,
    },
    {
      id: 5,
      roomId: byNumber('103').id,
      roomNumber: '103',
      tenantId: 5,
      tenantName: 'Arisa Fujimoto',
      startDate: isoDate(-700),
      endDate: isoDate(-330),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
      securityDeposit: 7000,
      status: 'ENDED',
      ...locked,
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
      reportedAt: isoTimestamp(-6),
      assignedTo: 'Kenji Tanaka',
      reportedBy: 'Sarah J.',
      ...ticketExtras('Air Conditioning', 'HIGH', isoDate(1)),
    },
    {
      id: 2,
      roomId: byNumber('206').id,
      roomNumber: '206',
      title: 'Bathroom drain pipe leaking',
      detail: 'Water seeping into the ceiling below. Waiting on the plumber to lift the tiles.',
      // มีช่างประปารับงานแล้ว รอเปิดกระเบื้องอยู่ จึงเป็นงานที่กำลังทำ ไม่ใช่รอคนรับ
      status: 'IN_PROGRESS',
      reportedAt: isoTimestamp(-2),
      assignedTo: 'Mei Lin',
      reportedBy: 'David W.',
      ...ticketExtras('Plumbing', 'MEDIUM', isoDate(2)),
    },
    {
      id: 3,
      roomId: byNumber('104').id,
      roomNumber: '104',
      title: 'Scheduled AC cleaning',
      detail: 'Six-month service due. Cleaning booked.',
      // จองช่างไว้แล้วตามรายละเอียด จึงมีคนรับงาน
      status: 'IN_PROGRESS',
      reportedAt: isoTimestamp(-1),
      assignedTo: 'Kenji Tanaka',
      reportedBy: 'Alex P.',
      ...ticketExtras('Air Conditioning', 'LOW', isoDate(3)),
    },
    {
      id: 4,
      roomId: byNumber('201').id,
      roomNumber: '201',
      title: 'Bathroom tap dripping',
      detail: 'Tenant reports the tap drips constantly.',
      // เพิ่งแจ้งเข้ามา ยังไม่มีช่างรับ ตรงกับสถานะ Wait for Assign
      status: 'OPEN',
      reportedAt: isoTimestamp(-3),
      assignedTo: null,
      reportedBy: 'Kenji Sato',
      ...ticketExtras('Plumbing', 'MEDIUM', null),
    },
  ]

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
    baseRent: MOCK_ROOM_TYPE_RENT[room.roomType],
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

/**
 * สร้างหรือแก้สัญญาให้เหมือน LeaseService ของ backend (SSK-127)
 *
 * - ค่าเช่า: ตอนสร้างเอาจากประเภทห้อง ตอนแก้คงค่าเดิม ไม่อ่านจาก body เลย
 * - เงินมัดจำกับอัตราค่าไฟ/น้ำ: ส่งมาใช้ค่าที่ส่ง ไม่ส่งมาตอนสร้างใช้ 0 กับอัตราจาก
 *   Apartment Config ตอนแก้คงค่าเดิมของสัญญา
 */
function leaseFromRequest(id: number, body: LeaseRequest, existing?: Lease): Lease | Response {
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
    monthlyRent: existing ? existing.monthlyRent : MOCK_ROOM_TYPE_RENT[room.roomType],
    billingCycle: body.billingCycle,
    status: 'ACTIVE',
    securityDeposit: body.securityDeposit ?? (existing ? existing.securityDeposit : 0),
    electricRatePerUnit:
      body.electricRatePerUnit ?? (existing ? existing.electricRatePerUnit : store.config.electricRatePerUnit),
    waterRatePerUnit: body.waterRatePerUnit ?? (existing ? existing.waterRatePerUnit : store.config.waterRatePerUnit),
    commonAreaFee: body.commonAreaFee ?? (existing ? existing.commonAreaFee : store.config.commonAreaFee),
    internetFee: body.internetFee ?? (existing ? existing.internetFee : store.config.internetFee),
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

  if (segments[0] === 'auth') {
    if (method === 'POST' && segments[1] === 'login') {
      const username = String(body?.username ?? '').trim()
      const password = String(body?.password ?? '')
      if (!username) {
        return problem(400, 'Bad Request', 'Please enter the username')
      }
      if (!password) {
        return problem(400, 'Bad Request', 'Please enter the password')
      }
      // รหัสผ่านอะไรก็ผ่าน ตัวจำลองไม่ได้เก็บรหัสผ่านไว้เทียบ เคส "รหัสผ่านผิด"
      // พิสูจน์ที่ LoginPage.test.tsx ด้วยการ mock login ให้โยน ApiError(401) แทน
      return ok(MOCK_ADMIN)
    }
    if (method === 'GET' && segments[1] === 'me') {
      return ok(MOCK_ADMIN)
    }
    // 204 ห้ามมี body ใช้ ok() ไม่ได้เพราะ Response 204 ที่มี body จะโยน error
    if (method === 'POST' && segments[1] === 'logout') {
      return new Response(null, { status: 204 })
    }
  }

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
    // เหมือน RoomService.delete: ห้องที่มีประวัติสัญญาหรือใบแจ้งซ่อมลบไม่ได้ ลบสำเร็จตอบ 204
    if (method === 'DELETE' && segments.length === 2) {
      const id = Number(segments[1])
      const room = store.rooms.find((r) => r.id === id)
      if (!room) {
        return problem(404, 'Not Found', `No unit with id ${segments[1]}`)
      }
      if (store.leases.some((l) => l.roomId === id)) {
        return problem(409, 'Conflict', `Unit ${room.roomNumber} has lease history and cannot be deleted`)
      }
      if (store.tickets.some((t) => t.roomId === id)) {
        return problem(409, 'Conflict', `Unit ${room.roomNumber} has maintenance history and cannot be deleted`)
      }
      store.rooms = store.rooms.filter((r) => r.id !== id)
      return new Response(null, { status: 204 })
    }
  }


  /*
    ใบแจ้งซ่อม (SSK-131) ทำตัวเหมือน MaintenanceService ฝั่ง backend รวมข้อความ error
    ที่ต้องตรงกันเป๊ะ เพราะหน้าเว็บเอา detail ไปโชว์ในป็อปอัปตรง ๆ ต่างกันแค่การเบิกของ
    mock ไม่มีคลังอุปกรณ์ ใบที่สร้างผ่าน mock จึงไม่มีรายการเบิกของ (suppliesUsed ว่างเสมอ)
  */
  if (segments[0] === 'maintenance') {
    const findTicket = (id: string) => store.tickets.find((t) => String(t.id) === id)
    const notFound = (id: string) => problem(404, 'Not Found', `No maintenance ticket with id ${id}`)

    if (method === 'GET' && segments.length === 1) {
      const status = query.get('status')
      const roomId = query.get('roomId')
      if (status !== null && !MAINTENANCE_STATUSES.includes(status as MaintenanceStatus)) {
        return problem(400, 'Bad Request', 'Status must be OPEN, IN_PROGRESS or DONE')
      }
      // เรียงใบล่าสุดขึ้นก่อน คนเปิดหน้า Log มาดูว่าเพิ่งมีอะไรแจ้งเข้ามา
      return ok(
        store.tickets
          .filter((t) => status === null || t.status === status)
          .filter((t) => roomId === null || String(t.roomId) === roomId)
          .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt) || b.id - a.id),
      )
    }
    if (method === 'GET' && segments.length === 2) {
      const ticket = findTicket(segments[1])
      return ticket ? ok(ticket) : notFound(segments[1])
    }
    if (method === 'POST' && segments.length === 1) {
      if (body?.roomId === undefined || body.roomId === null) {
        return problem(400, 'Bad Request', 'Please choose the unit')
      }
      const title = String(body.title ?? '').trim()
      if (title === '') {
        return problem(400, 'Bad Request', 'Please enter the task title')
      }
      const invalid = invalidTicketFields(body)
      if (invalid) {
        return invalid
      }
      const room = store.rooms.find((r) => r.id === Number(body.roomId))
      if (!room) {
        return problem(404, 'Not Found', `No unit with id ${String(body.roomId)}`)
      }
      store.nextId += 1
      const created: MaintenanceTicket = {
        id: store.nextId,
        roomId: room.id,
        roomNumber: room.roomNumber,
        title,
        detail: (body.detail as string | null | undefined) ?? null,
        status: 'OPEN',
        reportedAt: new Date().toISOString(),
        assignedTo: trimToNull(body.assignedTo),
        reportedBy: (body.reportedBy as string | null | undefined) ?? null,
        maintenanceType: (body.maintenanceType as string | null | undefined) ?? null,
        priority: (body.priority as MaintenancePriority | undefined) ?? 'MEDIUM',
        scheduledDate: (body.scheduledDate as string | null | undefined) ?? null,
        cost: (body.cost as number | null | undefined) ?? null,
        source: 'MANUAL',
        closedAt: null,
        suppliesUsed: [],
      }
      store.tickets = [...store.tickets, created]
      return ok(created, 201)
    }
    if (method === 'PATCH' && segments.length === 2) {
      const existing = findTicket(segments[1])
      if (!existing) {
        return notFound(segments[1])
      }
      const patch = body ?? {}
      if (patch.status !== undefined && !MAINTENANCE_STATUSES.includes(patch.status as MaintenanceStatus)) {
        return problem(400, 'Bad Request', 'Status must be OPEN, IN_PROGRESS or DONE')
      }
      if (patch.title !== undefined && patch.title !== null && String(patch.title).trim() === '') {
        return problem(400, 'Bad Request', 'Please enter the task title')
      }
      const invalid = invalidTicketFields(patch)
      if (invalid) {
        return invalid
      }
      // ช่องที่ไม่ส่งมา (หรือส่ง null) แปลว่าไม่แก้ ส่วนช่าง ประเภท ผู้แจ้งที่ส่ง "" มาแปลว่าล้างค่า
      const has = (key: string) => patch[key] !== undefined && patch[key] !== null
      const status = has('status') ? (patch.status as MaintenanceStatus) : existing.status
      const updated: MaintenanceTicket = {
        ...existing,
        status,
        closedAt: has('status') ? (status === 'DONE' ? new Date().toISOString() : null) : existing.closedAt,
        title: has('title') ? String(patch.title).trim() : existing.title,
        detail: has('detail') ? String(patch.detail) : existing.detail,
        assignedTo: has('assignedTo') ? trimToNull(patch.assignedTo) : existing.assignedTo,
        maintenanceType: has('maintenanceType') ? trimToNull(patch.maintenanceType) : existing.maintenanceType,
        reportedBy: has('reportedBy') ? trimToNull(patch.reportedBy) : existing.reportedBy,
        priority: has('priority') ? (patch.priority as MaintenancePriority) : existing.priority,
        scheduledDate: has('scheduledDate') ? String(patch.scheduledDate) : existing.scheduledDate,
        cost: has('cost') ? Number(patch.cost) : existing.cost,
      }
      store.tickets = store.tickets.map((t) => (t.id === existing.id ? updated : t))
      return ok(updated)
    }
    // เหมือน MaintenanceService.delete ลบได้เฉพาะใบ OPEN ที่แอดมินสร้างเองและยังไม่เบิกของ
    if (method === 'DELETE' && segments.length === 2) {
      const ticket = findTicket(segments[1])
      if (!ticket) {
        return notFound(segments[1])
      }
      if (ticket.status === 'IN_PROGRESS') {
        return problem(409, 'Conflict', 'This ticket is in progress and cannot be deleted. Only open tickets can be deleted.')
      }
      if (ticket.status === 'DONE') {
        return problem(409, 'Conflict', 'This ticket is done and is kept as maintenance history. It cannot be deleted.')
      }
      if (ticket.source === 'RECURRING') {
        return problem(
          409,
          'Conflict',
          'This ticket was created by a recurring reminder and cannot be deleted. Mark it as Done instead.',
        )
      }
      if (ticket.suppliesUsed.length > 0) {
        return problem(
          409,
          'Conflict',
          'This ticket has supplies recorded against it and cannot be deleted. Mark it as Done instead.',
        )
      }
      store.tickets = store.tickets.filter((t) => t.id !== ticket.id)
      return new Response(null, { status: 204 })
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
      // เหมือน TenantService.create: เลขบัตรซ้ำกับคนที่มีอยู่ตอบ 409 เดิม mock รับเลขซ้ำได้
      // เทสที่เพิ่มผู้เช่าด้วยเลขบัตรของ Yuki จึงผ่านทั้งที่บน backend จริงจะได้ 409 (SSK-136)
      if (draft.nationalId && store.tenants.some((t) => t.nationalId === draft.nationalId)) {
        return problem(409, 'Conflict', 'A tenant with this national ID already exists')
      }
      store.nextId += 1
      // เหมือน TenantService.create: อีเมลกับ Line ID ไม่บังคับ ว่างเก็บเป็น null
      // ช่วงสัญญากับประเภทห้องไม่ใช่ข้อมูลผู้เช่า ส่งมาก็ไม่เก็บ (SSK-136)
      const tenant: Tenant = {
        id: store.nextId,
        fullName: draft.fullName,
        email: trimToNull(body?.email),
        phone: draft.phone,
        nationalId: draft.nationalId === '' || draft.nationalId === undefined ? null : draft.nationalId,
        lineId: trimToNull(body?.lineId),
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
      /*
        เหมือน TenantService.update: กฎเดียวกับตอนเพิ่ม เลขบัตรซ้ำกับคนอื่นตอบ 409
        และแทนทั้งก้อน ช่องไม่บังคับที่ไม่ส่งมา (email, lineId) ถูกล้างเป็น null ไม่ใช่คงค่าเดิม
        เดิม mock คงค่าเดิมไว้ ฟอร์มแก้ผู้เช่าที่ลืมส่งอีเมลจึงผ่านเทส แต่บน backend จริงอีเมลหาย (SSK-136)
      */
      const draft = {
        fullName: String(body?.fullName ?? '').trim(),
        email: String(body?.email ?? '').trim(),
        phone: String(body?.phone ?? '').trim(),
        nationalId: String(body?.nationalId ?? '').trim(),
      }
      const invalid = validateTenant(draft)
      if (invalid) {
        return problem(400, 'Bad Request', invalid)
      }
      if (store.tenants.some((t) => t.id !== id && t.nationalId === draft.nationalId)) {
        return problem(409, 'Conflict', 'A tenant with this national ID already exists')
      }
      const updated: Tenant = {
        id: existing.id,
        fullName: draft.fullName,
        email: trimToNull(body?.email),
        phone: draft.phone,
        nationalId: draft.nationalId,
        lineId: trimToNull(body?.lineId),
      }
      store.tenants = store.tenants.map((t) => (t.id === id ? updated : t))
      return ok(updated)
    }
    // เหมือน TenantService.delete: ผู้เช่าที่มีประวัติสัญญาลบไม่ได้ ลบสำเร็จตอบ 204
    if (method === 'DELETE' && segments.length === 2) {
      const id = Number(segments[1])
      if (!store.tenants.some((t) => t.id === id)) {
        return problem(404, 'Not Found', `No tenant with id ${segments[1]}`)
      }
      if (store.leases.some((l) => l.tenantId === id)) {
        return problem(409, 'Conflict', 'This tenant has lease history and cannot be deleted. End the lease instead.')
      }
      store.tenants = store.tenants.filter((t) => t.id !== id)
      return new Response(null, { status: 204 })
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
      const draft = leaseFromRequest(existing.id, body as unknown as LeaseRequest, existing)
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
