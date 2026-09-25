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
  Receipt,
  ReceiptItem,
  RoomStatus,
  RoomType,
  Supply,
  Tenant,
} from './types'
import { dateInBangkok, todayInBangkok } from '../format'
import { roundMoney } from '../domain/billing'

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

/*
  อัตราที่สัญญาตัวอย่างล็อกไว้ตอนเซ็น เท่ากับ Config ตั้งต้น ของจริงทุกสัญญามีอัตราเพราะ backend
  คัดลอกไว้ตอนเซ็น ถ้าสัญญาตัวอย่างไม่มี บิลจะไปอ่าน Config ล่าสุดแทน ซึ่งผิดกฎล็อกอัตรา
*/
const SEED_LEASE_RATES = {
  electricRatePerUnit: 50,
  waterRatePerUnit: 100,
  commonAreaFee: 300,
  internetFee: 250,
}

/** ของในคลังตามที่เก็บในตาราง supply_item ป้าย status คิดตอนตอบเหมือน backend (SSK-23) */
type MockSupply = Omit<Supply, 'status'>

/** แถวของ supply_restock หนึ่งแถวต่อการเติมหนึ่งครั้ง ใช้นับการ์ด restockedThisWeek */
interface MockRestock {
  supplyId: number
  quantity: number
  restockedAt: string
}

interface Store {
  rooms: MockRoom[]
  tenants: Tenant[]
  leases: Lease[]
  tickets: MaintenanceTicket[]
  receipts: Receipt[]
  supplies: MockSupply[]
  restocks: MockRestock[]
  config: ApartmentConfig
  nextId: number
  /**
   * id ของอุปกรณ์แยกจาก nextId เพราะรหัส SKU ที่ server ออกให้มี id อยู่ในนั้น (PL-004)
   * backend seed ไว้สามชิ้น ของชิ้นแรกที่เพิ่มจึงเป็น id 4 และไม่นำ id ที่ถูกลบกลับมาใช้ซ้ำ
   * เหมือน IDENTITY ของ PostgreSQL
   */
  nextSupplyId: number
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
      ...SEED_LEASE_RATES,
      securityDeposit: 9000,
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
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
      ...SEED_LEASE_RATES,
      securityDeposit: 7000,
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
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
      ...SEED_LEASE_RATES,
      securityDeposit: 7000,
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
      monthlyRent: 4500,
      billingCycle: 'YEARLY',
      ...SEED_LEASE_RATES,
      securityDeposit: 9000,
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
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
      ...SEED_LEASE_RATES,
      securityDeposit: 7000,
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
      reportedAt: isoTimestamp(-6),
      assignedTo: 'Kenji Tanaka',
      reportedBy: 'Sarah J.',
      ...ticketExtras('Air Conditioning', 'HIGH', isoDate(1)),
      // เบิกไส้กรองแอร์ไป 1 ชิ้น ชุดเดียวกับ DevDataSeeder (SSK-23) ให้กฎ "ของที่เคยถูกเบิกลบไม่ได้"
      // มีของให้ลองจริง ยอด Air Filters ใน seed ข้างล่างจึงเป็นยอดหลังเบิกแล้ว
      suppliesUsed: [{ supplyId: 2, name: 'Air Filters 16x20x1', quantity: 1 }],
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

  // อัตราตั้งต้นอิงราคาหอพักแถวมหาวิทยาลัยจริง ไม่ได้ตั้งใจให้เป็นค่าถาวร
  // แอดมินเข้าไปแก้ได้ที่หน้า Apartment Config
  const config: ApartmentConfig = {
    electricRatePerUnit: 50,
    waterRatePerUnit: 100,
    commonAreaFee: 300,
    internetFee: 250,
    updatedAt: isoDate(-30),
  }

  const receipts: Receipt[] = [
    buildReceipt(1, 'RC-2026-0001', leases[0], monthFromToday(-1), 180, 12, config, 'PAID'),
    // due เจ็ดวันก่อนเสมอ ใบนี้จึงเลยกำหนด (Overdue) ไม่ว่าเทสจะรันวันไหนของเดือน (SSK-16)
    // ถ้าใช้ค่าตั้งต้นวันที่ 5 ของเดือนนี้ ช่วงวันที่ 1-5 ใบนี้จะยังเป็น Pending แล้วเทสแกว่งตามวันที่
    buildReceipt(2, 'RC-2026-0002', leases[1], monthFromToday(-1), 95, 9, config, 'PENDING', isoDate(-7)),
  ]

  // อุปกรณ์สามชิ้นชุดเดียวกับ DevDataSeeder.supplyPlan ฝั่ง backend (SSK-23) รหัส SKU ตามที่เคยใช้บนหน้าเว็บ
  const supplies: MockSupply[] = [
    {
      id: 1,
      name: 'LED Bulbs 60W',
      sku: 'EL-001',
      category: 'Electrical',
      stock: 145,
      minStock: 50,
      maxStock: 200,
      createdAt: isoTimestamp(-30),
    },
    {
      id: 2,
      name: 'Air Filters 16x20x1',
      sku: 'HV-042',
      category: 'HVAC',
      stock: 8,
      minStock: 20,
      maxStock: 60,
      createdAt: isoTimestamp(-30),
    },
    {
      id: 3,
      name: 'Copper Pipe Fittings',
      sku: 'PL-108',
      category: 'Plumbing',
      stock: 85,
      minStock: 30,
      maxStock: 120,
      createdAt: isoTimestamp(-30),
    },
  ]

  return {
    rooms,
    tenants,
    leases,
    tickets,
    receipts,
    supplies,
    restocks: [],
    config,
    nextId: 100,
    nextSupplyId: 4,
  }
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

/** เดือน "YYYY-MM" นับจากเดือนนี้ตามเวลาไทย */
function monthFromToday(offsetMonths: number): string {
  const [year, month] = todayInBangkok().split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1 + offsetMonths, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * ใบเสร็จห้าบรรทัดคงที่ อัตราทั้งหมดมาจากสัญญา สัญญาตัวอย่างที่ไม่ได้เก็บอัตราไว้
 * ตกไปใช้ Config แทน ของจริงทุกสัญญามีอัตราเพราะ backend คัดลอกไว้ตอนเซ็น
 */
function buildReceipt(
  id: number,
  receiptNo: string,
  lease: Lease,
  billingMonth: string,
  electricUnits: number,
  waterUnits: number,
  config: ApartmentConfig,
  status: Receipt['status'] = 'PENDING',
  dueDate?: string,
): Receipt {
  const electricRate = lease.electricRatePerUnit ?? config.electricRatePerUnit
  const waterRate = lease.waterRatePerUnit ?? config.waterRatePerUnit
  const flat = (item: string, amount: number): ReceiptItem => ({
    item,
    detail: null,
    usageValue: null,
    usageUnit: null,
    rate: null,
    amount: roundMoney(amount),
  })
  const metered = (item: string, usage: number, rate: number): ReceiptItem => ({
    item,
    detail: null,
    usageValue: usage,
    usageUnit: 'units',
    rate,
    amount: roundMoney(usage * rate),
  })
  const items = [
    flat('Room rent', lease.monthlyRent),
    flat('Common area fee', lease.commonAreaFee ?? config.commonAreaFee),
    flat('Internet', lease.internetFee ?? config.internetFee),
    metered('Electricity', electricUnits, electricRate),
    metered('Water', waterUnits, waterRate),
  ]
  const [year, month] = billingMonth.split('-').map(Number)
  const fifthOfNextMonth = new Date(Date.UTC(year, month, 5)).toISOString().slice(0, 10)
  return {
    id,
    receiptNo,
    leaseId: lease.id,
    roomNumber: lease.roomNumber,
    tenantName: lease.tenantName,
    billingMonth,
    issuedAt: new Date().toISOString(),
    dueDate: dueDate ?? fifthOfNextMonth,
    status,
    items,
    totalAmount: roundMoney(items.reduce((sum, row) => sum + row.amount, 0)),
    paidAt: status === 'PAID' ? new Date().toISOString() : null,
    paymentMethod: null,
  }
}

/** เดือนทับกับช่วงสัญญาไหม ไม่ต้องอยู่เต็มเดือน ตรงกับ ReceiptService ฝั่ง backend */
function monthOverlapsLease(billingMonth: string, lease: Lease): boolean {
  const first = `${billingMonth}-01`
  const [year, month] = billingMonth.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return lease.startDate <= last && (lease.endDate === null || lease.endDate >= first)
}

/** ตรวจ body ของ POST /receipts ตามลำดับช่อง ข้อความตรงกับ ReceiptDtos.CreateReceiptRequest */
function invalidReceiptFields(body: Record<string, unknown> | null): Response | null {
  if (body?.leaseId == null) {
    return problem(400, 'Bad Request', 'Please choose the lease')
  }
  const billingMonth = String(body.billingMonth ?? '').trim()
  if (billingMonth === '') {
    return problem(400, 'Bad Request', 'Please choose the billing month')
  }
  if (typeof body.electricUnits !== 'number') {
    return problem(400, 'Bad Request', 'Please enter the electricity units')
  }
  if (body.electricUnits < 0) {
    return problem(400, 'Bad Request', 'Electricity units cannot be negative')
  }
  if (typeof body.waterUnits !== 'number') {
    return problem(400, 'Bad Request', 'Please enter the water units')
  }
  if (body.waterUnits < 0) {
    return problem(400, 'Bad Request', 'Water units cannot be negative')
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
    return problem(400, 'Bad Request', 'The billing month must be in YYYY-MM format')
  }
  return null
}

/** ของในคลังพร้อมป้ายที่คิดตอนตอบ กฎเดียวกับ SupplyDtos.SupplyStatus (stock < minStock) */
function supplyPayload(supply: MockSupply): Supply {
  return { ...supply, status: supply.stock < supply.minStock ? 'LOW_STOCK' : 'IN_STOCK' }
}

/** ตัวนำหน้ารหัสที่ server ออกให้ เหมือน SupplyService.skuPrefix (SSK-23) */
function skuPrefix(category: string): string {
  const letters = category.replace(/[^A-Za-z]/g, '')
  return letters === '' ? 'XX' : letters.slice(0, 2).toUpperCase()
}

/** รหัสที่ server ออกให้ ชนกับรหัสที่มีคนพิมพ์ไว้แล้วต่อท้าย -2, -3 เหมือน SupplyService.generateSku */
function generateSku(category: string, id: number): string {
  const base = `${skuPrefix(category)}-${String(id).padStart(3, '0')}`
  let candidate = base
  for (let suffix = 2; store.supplies.some((s) => s.sku === candidate); suffix++) {
    candidate = `${base}-${suffix}`
  }
  return candidate
}

/**
 * body ของ POST/PUT /supplies ตรวจตามลำดับเดียวกับ validateSupplyItem ข้อความตรงกับ backend
 * ห้าข้อแรกคือ bean validation ของ SupplyDtos สองข้อหลังคือ SupplyItem.requireBounds
 * ซึ่ง backend ตรวจหลังเช็ครหัสซ้ำ จึงแยกออกมาให้ route เรียกทีหลัง
 */
function invalidSupplyFields(body: Record<string, unknown> | null): Response | null {
  const isCount = (value: unknown) => typeof value === 'number' && value >= 0
  if (String(body?.name ?? '').trim() === '') {
    return problem(400, 'Bad Request', 'Please enter the item name')
  }
  if (String(body?.category ?? '').trim() === '') {
    return problem(400, 'Bad Request', 'Please choose the category')
  }
  if (!isCount(body?.stock)) {
    return problem(400, 'Bad Request', 'Quantity cannot be negative')
  }
  if (!isCount(body?.minStock)) {
    return problem(400, 'Bad Request', 'Minimum stock cannot be negative')
  }
  if (!isCount(body?.maxStock)) {
    return problem(400, 'Bad Request', 'Maximum stock cannot be negative')
  }
  return null
}

function supplyBoundsError(stock: number, minStock: number, maxStock: number): Response | null {
  if (maxStock < minStock) {
    return problem(400, 'Bad Request', 'Maximum stock cannot be lower than minimum stock')
  }
  if (stock > maxStock) {
    return problem(400, 'Bad Request', 'Quantity cannot be higher than maximum stock')
  }
  return null
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
    หน้าเว็บยังไม่มีฟอร์มเบิกของ mock จึงไม่ตัดสต็อกตาม suppliesUsed ที่ส่งมา ใบที่สร้างผ่าน mock
    ไม่มีรายการเบิกของ มีแค่ใบห้อง 106 ใน seed ที่เบิก Air Filters ไว้ให้กฎลบของใน SSK-23 ลองได้
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

  /*
    คลังอุปกรณ์ (SSK-23) ทำตัวเหมือน SupplyService ฝั่ง backend ทั้งลำดับการตรวจและข้อความ error
    ซึ่งหน้าเว็บเอา detail ไปโชว์ในป็อปอัปตรง ๆ รวมถึงการออก SKU เพดาน maxStock การนับยอดเติม
    เจ็ดวันตามวันไทย และ 409 ตอนลบของที่ใบแจ้งซ่อมเคยเบิกไปแล้ว
  */
  if (segments[0] === 'supplies') {
    const findSupply = (id: string) => store.supplies.find((s) => String(s.id) === id)
    const notFound = (id: string) => problem(404, 'Not Found', `No supply with id ${id}`)
    const skuTaken = (sku: string, ignoreId?: number) =>
      store.supplies.some((s) => s.sku === sku && s.id !== ignoreId)

    if (method === 'GET' && segments.length === 1) {
      return ok([...store.supplies].sort((a, b) => a.name.localeCompare(b.name)).map(supplyPayload))
    }
    // "สัปดาห์นี้" คือเจ็ดวันปฏิทินรวมวันนี้ตามเวลาไทย ไม่ใช่ 168 ชั่วโมงถอยหลัง เหมือน SupplyService.summary
    if (method === 'GET' && segments[1] === 'summary') {
      const since = isoDate(-6)
      return ok({
        totalItems: store.supplies.length,
        lowStockItems: store.supplies.filter((s) => s.stock < s.minStock).length,
        restockedThisWeek: store.restocks
          .filter((r) => dateInBangkok(r.restockedAt) >= since)
          .reduce((sum, r) => sum + r.quantity, 0),
      })
    }
    if (method === 'POST' && segments.length === 1) {
      const invalid = invalidSupplyFields(body)
      if (invalid) {
        return invalid
      }
      const fields = body as Record<string, unknown>
      const sku = trimToNull(fields.sku)
      if (sku !== null && skuTaken(sku)) {
        return problem(409, 'Conflict', 'An item with this SKU already exists')
      }
      const [stock, minStock, maxStock] = [fields.stock, fields.minStock, fields.maxStock] as number[]
      const outOfBounds = supplyBoundsError(stock, minStock, maxStock)
      if (outOfBounds) {
        return outOfBounds
      }
      const id = store.nextSupplyId
      store.nextSupplyId += 1
      const category = String(fields.category).trim()
      const created: MockSupply = {
        id,
        name: String(fields.name).trim(),
        sku: sku ?? generateSku(category, id),
        category,
        stock,
        minStock,
        maxStock,
        createdAt: new Date().toISOString(),
      }
      store.supplies = [...store.supplies, created]
      return ok(supplyPayload(created), 201)
    }
    if (method === 'PUT' && segments.length === 2) {
      // backend ตรวจ body (@Valid) ก่อนหาของ ส่วน 404 มาก่อนรหัสซ้ำและกฎเพดาน
      const invalid = invalidSupplyFields(body)
      if (invalid) {
        return invalid
      }
      const existing = findSupply(segments[1])
      if (!existing) {
        return notFound(segments[1])
      }
      const fields = body as Record<string, unknown>
      const sku = trimToNull(fields.sku)
      if (sku !== null && skuTaken(sku, existing.id)) {
        return problem(409, 'Conflict', 'An item with this SKU already exists')
      }
      const [stock, minStock, maxStock] = [fields.stock, fields.minStock, fields.maxStock] as number[]
      const outOfBounds = supplyBoundsError(stock, minStock, maxStock)
      if (outOfBounds) {
        return outOfBounds
      }
      const updated: MockSupply = {
        ...existing,
        name: String(fields.name).trim(),
        sku,
        category: String(fields.category).trim(),
        stock,
        minStock,
        maxStock,
      }
      store.supplies = store.supplies.map((s) => (s.id === existing.id ? updated : s))
      return ok(supplyPayload(updated))
    }
    if (method === 'POST' && segments[2] === 'restock') {
      const existing = findSupply(segments[1])
      if (!existing) {
        return notFound(segments[1])
      }
      const quantity = body?.quantity
      // ตัวหนังสือไปไม่ถึง service ฝั่งจริง Jackson อ่านไม่ออกแล้วบอกชื่อช่อง
      if (typeof quantity === 'string') {
        return problem(400, 'Bad Request', 'The quantity field must be a number')
      }
      if (typeof quantity !== 'number' || !(quantity > 0)) {
        return problem(400, 'Bad Request', 'The restock amount must be greater than 0')
      }
      if (!Number.isInteger(quantity)) {
        return problem(400, 'Bad Request', 'The restock amount must be a whole number')
      }
      const total = existing.stock + quantity
      if (total > existing.maxStock) {
        return problem(
          400,
          'Bad Request',
          `Restocking ${quantity} would bring the total to ${total}, above the maximum stock of ${existing.maxStock}`,
        )
      }
      const restocked: MockSupply = { ...existing, stock: total }
      store.supplies = store.supplies.map((s) => (s.id === existing.id ? restocked : s))
      store.restocks = [...store.restocks, { supplyId: existing.id, quantity, restockedAt: new Date().toISOString() }]
      return ok(supplyPayload(restocked))
    }
    // เหมือน SupplyService.delete: ของที่เคยถูกเบิกลบไม่ได้ ลบสำเร็จประวัติการเติมหายไปด้วย ตอบ 204
    if (method === 'DELETE' && segments.length === 2) {
      const existing = findSupply(segments[1])
      if (!existing) {
        return notFound(segments[1])
      }
      if (store.tickets.some((t) => t.suppliesUsed.some((used) => used.supplyId === existing.id))) {
        return problem(
          409,
          'Conflict',
          'This item has been used in maintenance tickets and cannot be deleted. Set its stock to 0 instead.',
        )
      }
      store.restocks = store.restocks.filter((r) => r.supplyId !== existing.id)
      store.supplies = store.supplies.filter((s) => s.id !== existing.id)
      return new Response(null, { status: 204 })
    }
  }

  if (segments[0] === 'receipts') {
    if (method === 'GET' && segments.length === 1) {
      const leaseId = query.get('leaseId')
      const status = query.get('status')
      const month = query.get('month')
      return ok(
        store.receipts
          .filter((r) => leaseId === null || String(r.leaseId) === leaseId)
          .filter((r) => status === null || r.status === status)
          .filter((r) => month === null || r.billingMonth === month)
          .sort((a, b) => b.id - a.id),
      )
    }
    if (method === 'POST' && segments.length === 1) {
      const invalid = invalidReceiptFields(body)
      if (invalid) {
        return invalid
      }
      const fields = body as Record<string, unknown>
      const lease = store.leases.find((l) => l.id === Number(fields.leaseId))
      if (!lease) {
        return problem(404, 'Not Found', `No lease with id ${String(fields.leaseId)}`)
      }
      const billingMonth = String(fields.billingMonth).trim()
      if (!monthOverlapsLease(billingMonth, lease)) {
        return problem(400, 'Bad Request', 'The billing month is outside the lease period')
      }
      if (store.receipts.some((r) => r.leaseId === lease.id && r.billingMonth === billingMonth)) {
        return problem(409, 'Conflict', 'A receipt for this month has already been issued for this lease')
      }
      const year = new Date().getFullYear()
      const sequence = store.receipts.filter((r) => r.receiptNo.startsWith(`RC-${year}-`)).length + 1
      store.nextId += 1
      const receipt = buildReceipt(
        store.nextId,
        `RC-${year}-${String(sequence).padStart(4, '0')}`,
        lease,
        billingMonth,
        fields.electricUnits as number,
        fields.waterUnits as number,
        store.config,
        'PENDING',
        (fields.dueDate as string | null | undefined) || undefined,
      )
      store.receipts = [...store.receipts, receipt]
      return ok(receipt, 201)
    }
    const receipt = store.receipts.find((r) => String(r.id) === segments[1])
    if (!receipt) {
      return problem(404, 'Not Found', `No receipt with id ${segments[1]}`)
    }
    if (method === 'GET' && segments.length === 2) {
      return ok(receipt)
    }
    if (method === 'POST' && segments[2] === 'pay') {
      if (receipt.status === 'PAID') {
        return problem(409, 'Conflict', 'This receipt has already been paid')
      }
      const paid: Receipt = {
        ...receipt,
        status: 'PAID',
        paidAt: new Date().toISOString(),
        paymentMethod: (body?.paymentMethod as string | undefined)?.trim() || null,
      }
      store.receipts = store.receipts.map((r) => (r.id === paid.id ? paid : r))
      return ok(paid)
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
