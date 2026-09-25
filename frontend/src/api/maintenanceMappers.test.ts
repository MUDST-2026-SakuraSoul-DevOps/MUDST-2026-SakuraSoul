import { describe, expect, it } from 'vitest'
import type { MaintenanceTicket, Supply } from './types'
import type { MaintenanceTask } from '../domain/maintenanceBoard'
import type { CreateMaintenanceDraft } from '../domain/maintenanceTicket'
import {
  createTicketRequest,
  dashboardCreateRequest,
  supplyRequest,
  supplyToRow,
  taskStatusOf,
  taskStatusToApi,
  ticketPatch,
  ticketToTask,
} from './maintenanceMappers'

/**
 * ตัวแปลงระหว่างใบแจ้งซ่อมของ API กับโมเดลของหน้าจอ (SSK-131)
 *
 * จุดที่พังเงียบที่สุดคือป้ายสถานะกับค่าซ่อม ถ้าแปลงผิด ตารางยังขึ้นครบทุกแถว
 * แต่ป้ายหรือยอดเงินผิดโดยไม่มี error ให้เห็น เทสชุดนี้จึงเน้นสองเรื่องนั้น
 */

function ticket(overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket {
  return {
    id: 7,
    roomId: 6,
    roomNumber: '106',
    title: 'AC compressor replacement',
    detail: 'Air conditioner not cooling',
    status: 'OPEN',
    reportedAt: '2026-09-20T03:00:00Z',
    assignedTo: null,
    reportedBy: 'Sarah J.',
    maintenanceType: 'Air Conditioning',
    priority: 'HIGH',
    scheduledDate: '2026-09-26',
    cost: null,
    source: 'MANUAL',
    closedAt: null,
    suppliesUsed: [],
    ...overrides,
  }
}

function task(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return { ...ticketToTask(ticket()), ...overrides }
}

describe('taskStatusOf', () => {
  it('ใบ Open ที่ยังไม่มีช่างรับขึ้น Wait for Assign', () => {
    expect(taskStatusOf({ status: 'OPEN', assignedTo: null })).toBe('Wait for Assign')
  })

  it('ใบ Open ที่มีช่างรับแล้วขึ้น Pending', () => {
    expect(taskStatusOf({ status: 'OPEN', assignedTo: 'Mei Lin' })).toBe('Pending')
  })

  it('ช่างที่เป็นสตริงว่างนับว่ายังไม่มีคนรับ', () => {
    expect(taskStatusOf({ status: 'OPEN', assignedTo: '' })).toBe('Wait for Assign')
  })

  it('In Progress กับ Done ไม่ขึ้นกับว่ามีช่างหรือไม่', () => {
    expect(taskStatusOf({ status: 'IN_PROGRESS', assignedTo: null })).toBe('In Progress')
    expect(taskStatusOf({ status: 'DONE', assignedTo: 'Mei Lin' })).toBe('Done')
  })

  it('แปลงป้ายกลับเป็นสถานะของ API ได้ครบทุกป้าย', () => {
    expect(taskStatusToApi('Wait for Assign')).toBe('OPEN')
    expect(taskStatusToApi('Pending')).toBe('OPEN')
    expect(taskStatusToApi('In Progress')).toBe('IN_PROGRESS')
    expect(taskStatusToApi('Done')).toBe('DONE')
  })
})

describe('ticketToTask', () => {
  it('แปลงช่องที่ชื่อไม่ตรงกันครบทุกช่อง', () => {
    expect(ticketToTask(ticket({ assignedTo: 'Kenji Tanaka' }))).toEqual({
      id: 7,
      roomId: 6,
      task: 'AC compressor replacement',
      detail: 'Air conditioner not cooling',
      maintenanceType: 'Air Conditioning',
      unit: '106',
      priority: 'High',
      assignTo: 'Kenji Tanaka',
      reportBy: 'Sarah J.',
      date: '2026-09-26',
      status: 'Pending',
      billToTenant: false,
      amount: 0,
    })
  })

  it('ช่องที่ API ส่ง null มาเป็นสตริงว่างในฟอร์ม', () => {
    const converted = ticketToTask(
      ticket({ detail: null, maintenanceType: null, reportedBy: null, scheduledDate: null }),
    )
    expect(converted.detail).toBe('')
    expect(converted.maintenanceType).toBe('')
    expect(converted.reportBy).toBe('')
    expect(converted.date).toBe('')
  })

  it('ใบที่มีค่าซ่อมติ๊ก Bill to tenant พร้อมยอดเดิม', () => {
    const converted = ticketToTask(ticket({ cost: 850 }))
    expect(converted.billToTenant).toBe(true)
    expect(converted.amount).toBe(850)
  })

  it('ค่าซ่อมศูนย์ไม่ติ๊ก Bill to tenant', () => {
    expect(ticketToTask(ticket({ cost: 0 })).billToTenant).toBe(false)
  })
})

describe('createTicketRequest', () => {
  it('ช่องว่างส่งเป็น null และไม่ส่งค่าซ่อมถ้าไม่ได้เก็บผู้เช่า', () => {
    const body = createTicketRequest(
      task({ id: 0, detail: '', maintenanceType: '', assignTo: '', reportBy: '', date: '', amount: 500 }),
    )
    expect(body).toEqual({
      roomId: 6,
      title: 'AC compressor replacement',
      detail: null,
      maintenanceType: null,
      priority: 'HIGH',
      assignedTo: null,
      reportedBy: null,
      scheduledDate: null,
      cost: null,
    })
  })

  it('ติ๊ก Bill to tenant แล้วส่งยอดเป็น cost', () => {
    expect(createTicketRequest(task({ billToTenant: true, amount: 1200 })).cost).toBe(1200)
  })
})

describe('ticketPatch', () => {
  it('ไม่ได้แก้อะไรเลยได้ก้อนว่าง', () => {
    const original = task()
    expect(ticketPatch({ ...original }, original)).toEqual({})
  })

  it('ส่งเฉพาะช่องที่เปลี่ยน ไม่ส่งทั้งใบกลับไปทับของคนอื่น', () => {
    const original = task()
    expect(ticketPatch({ ...original, task: 'Compressor swapped', priority: 'Urgent' }, original)).toEqual({
      title: 'Compressor swapped',
      priority: 'URGENT',
    })
  })

  it('เลือก Done แล้วส่ง status เป็น DONE', () => {
    const original = task({ status: 'In Progress' })
    expect(ticketPatch({ ...original, status: 'Done' }, original)).toEqual({ status: 'DONE' })
  })

  it('Pending กับ Wait for Assign เป็น OPEN ทั้งคู่ ถอนช่างแล้วไม่ส่ง status', () => {
    const original = task({ assignTo: 'Mei Lin', status: 'Pending' })
    expect(ticketPatch({ ...original, assignTo: '', status: 'Wait for Assign' }, original)).toEqual({
      assignedTo: '',
    })
  })

  it('ล้างประเภทงานกับผู้แจ้งส่งสตริงว่าง ให้ backend ล้างค่า', () => {
    const original = task()
    expect(ticketPatch({ ...original, maintenanceType: '', reportBy: '' }, original)).toEqual({
      maintenanceType: '',
      reportedBy: '',
    })
  })

  it('วันนัดที่ลบทิ้งไม่ถูกส่ง เพราะ PATCH ล้างวันไม่ได้', () => {
    const original = task()
    expect(ticketPatch({ ...original, date: '' }, original)).toEqual({})
    expect(ticketPatch({ ...original, date: '2026-10-01' }, original)).toEqual({ scheduledDate: '2026-10-01' })
  })

  it('เลิกเก็บค่าซ่อมจากผู้เช่าส่ง cost เป็น 0 ไม่ใช่ null', () => {
    const original = task({ billToTenant: true, amount: 850 })
    expect(ticketPatch({ ...original, billToTenant: false }, original)).toEqual({ cost: 0 })
  })

  it('ยอดที่พิมพ์ค้างไว้ในช่องที่ปิดอยู่ไม่ถูกส่ง', () => {
    const original = task()
    expect(ticketPatch({ ...original, amount: 999 }, original)).toEqual({})
  })
})

describe('dashboardCreateRequest', () => {
  function draft(overrides: Partial<CreateMaintenanceDraft> = {}): CreateMaintenanceDraft {
    return {
      roomNumber: '105',
      maintenanceType: 'Electrical',
      availability: 'AVAILABLE',
      billToTenant: false,
      amount: 0,
      recurring: false,
      nextDate: '',
      repeatEvery: '',
      notes: '',
      ...overrides,
    }
  }

  it('ใช้ประเภทงานเป็นชื่องาน เพราะฟอร์มบน Dashboard ไม่มีช่องชื่อ', () => {
    expect(dashboardCreateRequest(draft(), 5)).toEqual({
      roomId: 5,
      title: 'Electrical',
      maintenanceType: 'Electrical',
      detail: null,
      cost: null,
    })
  })

  it('หมายเหตุเป็น detail และยอดที่เก็บผู้เช่าเป็น cost', () => {
    const body = dashboardCreateRequest(draft({ notes: 'Socket sparks', billToTenant: true, amount: 300 }), 5)
    expect(body.detail).toBe('Socket sparks')
    expect(body.cost).toBe(300)
  })
})

/**
 * SSK-23 ของในคลังจาก API เป็นแถวของตาราง และกลับเป็น body ของ POST/PUT
 *
 * จุดที่พังเงียบคือป้ายกับรหัส ถ้าสลับป้าย ตารางยังขึ้นครบแต่ของที่ใกล้หมดดูเหมือนของพอ
 * ถ้าส่งรหัสว่างเป็นสตริงว่าง backend จะเก็บเป็น null แทนการออกรหัสให้ไม่ได้ แต่ถ้าไม่ส่งรหัสเดิม
 * กลับไปตอนแก้ รหัสจะหายจากแถวเพราะ PUT แก้ทั้งก้อน
 */
function supply(overrides: Partial<Supply> = {}): Supply {
  return {
    id: 2,
    name: 'Air Filters 16x20x1',
    sku: 'HV-042',
    category: 'HVAC',
    stock: 8,
    minStock: 20,
    maxStock: 60,
    status: 'LOW_STOCK',
    createdAt: '2026-09-01T03:00:00Z',
    ...overrides,
  }
}

describe('supplyToRow', () => {
  it('ป้ายมาจาก status ของ API ไม่ได้คำนวณเอง', () => {
    expect(supplyToRow(supply()).status).toBe('Low Stock')
    expect(supplyToRow(supply({ status: 'IN_STOCK' })).status).toBe('In Stock')
  })

  it('ของเก่าที่ไม่มีรหัสเป็นสตริงว่าง ช่องค้นหากับฟอร์มใช้ sku เป็นสตริงเสมอ', () => {
    expect(supplyToRow(supply({ sku: null })).sku).toBe('')
  })

  it('ช่องตัวเลขกับเพดานมาครบ', () => {
    expect(supplyToRow(supply())).toMatchObject({ id: 2, stock: 8, minStock: 20, maxStock: 60, category: 'HVAC' })
  })
})

describe('supplyRequest', () => {
  it('ของใหม่ที่ยังไม่มีรหัสส่ง sku เป็น null ให้ server ออกรหัสให้', () => {
    const row = supplyToRow(supply({ id: 0, sku: null }))
    expect(supplyRequest(row).sku).toBeNull()
  })

  it('ตอนแก้ส่งรหัสเดิมกลับไป เพราะ PUT แก้ทั้งก้อน', () => {
    expect(supplyRequest(supplyToRow(supply()))).toEqual({
      name: 'Air Filters 16x20x1',
      sku: 'HV-042',
      category: 'HVAC',
      stock: 8,
      minStock: 20,
      maxStock: 60,
    })
  })
})
