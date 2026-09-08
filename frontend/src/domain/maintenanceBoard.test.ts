import { describe, expect, it } from 'vitest'
import type { MaintenanceTask, Reminder, SupplyItem } from './maintenanceBoard'
import {
  heightPercent,
  isReminderOverdue,
  nextOccurrence,
  reminderNextLabel,
  supplyStatus,
  validateMaintenanceTask,
  validateReminder,
  validateSupplyItem,
  verticalPercent,
  workWeekOf,
} from './maintenanceBoard'

function task(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    id: 1,
    task: 'AC Not Cooling',
    detail: '',
    maintenanceType: 'HVAC',
    unit: '101',
    priority: 'Medium',
    assignTo: '',
    reportBy: '',
    date: '',
    status: 'Wait for Assign',
    ...overrides,
  }
}

function supply(overrides: Partial<SupplyItem> = {}): SupplyItem {
  return { id: 1, name: 'LED Bulbs 60W', sku: 'EL-001', category: 'Electrical', stock: 10, minStock: 5, ...overrides }
}

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 1,
    name: 'HVAC Inspection',
    frequency: 'Monthly',
    startDate: '2026-09-01',
    unit: '',
    time: '09:00',
    priority: 'Medium',
    notes: '',
    active: true,
    ...overrides,
  }
}

describe('validateMaintenanceTask', () => {
  it('ผ่านเมื่อกรอกชื่องานกับเลขห้องครบ', () => {
    expect(validateMaintenanceTask(task())).toBeNull()
  })

  it('ไม่มีชื่องานไม่ผ่าน', () => {
    expect(validateMaintenanceTask(task({ task: '' }))).toBe('ต้องกรอกชื่องานซ่อม')
  })

  it('ไม่มีเลขห้องไม่ผ่าน', () => {
    expect(validateMaintenanceTask(task({ unit: '' }))).toBe('ต้องกรอกเลขห้อง')
  })

  it('เลขห้องที่ไม่ใช่ตัวเลขสามหลักไม่ผ่าน', () => {
    expect(validateMaintenanceTask(task({ unit: 'A1' }))).toContain('สามหลัก')
    expect(validateMaintenanceTask(task({ unit: '10' }))).toContain('สามหลัก')
  })
})

describe('validateSupplyItem', () => {
  it('ผ่านเมื่อกรอกชื่อกับหมวดหมู่ และจำนวนไม่ติดลบ', () => {
    expect(validateSupplyItem(supply())).toBeNull()
  })

  it('จำนวนติดลบไม่ผ่าน', () => {
    expect(validateSupplyItem(supply({ stock: -1 }))).toBe('จำนวนคงเหลือต้องไม่ติดลบ')
  })

  it('ช่องจำนวนที่ว่างไว้กลายเป็น NaN ต้องไม่ผ่าน ไม่ใช่หลุดเข้าไปเป็นของในสต็อก', () => {
    expect(validateSupplyItem(supply({ stock: Number.NaN }))).toBe('จำนวนคงเหลือต้องไม่ติดลบ')
  })
})

describe('validateReminder', () => {
  it('ไม่มีวันเริ่มไม่ผ่าน เพราะคำนวณครั้งถัดไปไม่ได้', () => {
    expect(validateReminder(reminder({ startDate: '' }))).toBe('ต้องเลือกวันเริ่ม')
  })
})

describe('supplyStatus', () => {
  it('ต่ำกว่าขั้นต่ำคือ Low Stock', () => {
    expect(supplyStatus(supply({ stock: 4, minStock: 5 }))).toBe('Low Stock')
  })

  it('เท่ากับขั้นต่ำยังถือว่าพอ', () => {
    expect(supplyStatus(supply({ stock: 5, minStock: 5 }))).toBe('In Stock')
  })
})

describe('ตำแหน่งบนปฏิทิน', () => {
  it('ต้นตารางคือ 0 และท้ายตารางคือ 100', () => {
    expect(verticalPercent('08:00')).toBe(0)
    expect(verticalPercent('18:00')).toBe(100)
  })

  it('กลางวันอยู่กลางตารางพอดี', () => {
    expect(verticalPercent('13:00')).toBe(50)
  })

  it('เวลานอกช่วงถูกหนีบไว้ที่ขอบ ไม่หลุดออกนอกกรอบตาราง', () => {
    expect(verticalPercent('06:00')).toBe(0)
    expect(verticalPercent('23:00')).toBe(100)
  })

  it('ความสูงของบล็อกเท่ากับช่วงเวลาที่กินจริง', () => {
    expect(heightPercent('08:00', '13:00')).toBe(50)
  })

  it('เวลาจบก่อนเวลาเริ่มได้ความสูงศูนย์ ไม่ใช่ค่าติดลบที่ทำให้บล็อกกลับหัว', () => {
    expect(heightPercent('13:00', '09:00')).toBe(0)
  })
})

/**
 * ชุดนี้มาจากที่ QA ทักว่าการ์ด Roofing Inspection โชว์ว่าครั้งถัดไปคือ ก.ย.
 * 2024 ซึ่งผ่านมาสองปีแล้ว แต่หน้าจอแสดงเฉย ๆ ไม่มีสถานะเลยกำหนด
 *
 * ต้นเหตุคือข้อความครั้งถัดไปถูกฝังไว้ตายตัวในข้อมูล พอเวลาเดินผ่านไปก็ไม่ขยับ
 */
describe('nextOccurrence', () => {
  it('ใบครั้งเดียวไม่เลื่อน ถึงจะเลยวันมาแล้วก็ตาม', () => {
    const once = reminder({ frequency: 'One-time', startDate: '2026-01-10' })
    expect(nextOccurrence(once, '2026-09-09')).toBe('2026-01-10')
  })

  it('รอบรายเดือนเลื่อนไปครั้งถัดไปที่ยังมาไม่ถึง', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(nextOccurrence(monthly, '2026-09-09')).toBe('2026-10-01')
  })

  it('วันที่ตรงกับวันนี้พอดี ยังถือว่าเป็นครั้งถัดไป ไม่ข้ามไปเดือนหน้า', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(nextOccurrence(monthly, '2026-09-01')).toBe('2026-09-01')
  })

  it('รอบรายไตรมาสเลื่อนทีละสามเดือน', () => {
    const quarterly = reminder({ frequency: 'Quarterly', startDate: '2026-01-15' })
    expect(nextOccurrence(quarterly, '2026-09-09')).toBe('2026-10-15')
  })

  it('วันที่ 31 บวกเดือนไปเจอเดือนที่มี 30 วัน ต้องหนีบเป็นวันที่ 30', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-03-31' })
    expect(nextOccurrence(monthly, '2026-04-15')).toBe('2026-04-30')
  })

  it('ใบที่ปิดอยู่ถือว่าตารางหยุดเดิน ครั้งถัดไปค้างที่วันเริ่ม', () => {
    const paused = reminder({ frequency: 'Annual', startDate: '2024-09-01', active: false })
    expect(nextOccurrence(paused, '2026-09-09')).toBe('2024-09-01')
  })
})

describe('isReminderOverdue', () => {
  it('ใบที่ปิดค้างไว้ตั้งแต่สองปีก่อน ถือว่าเลยกำหนด', () => {
    const roofing = reminder({ frequency: 'Annual', startDate: '2024-09-01', active: false })
    expect(isReminderOverdue(roofing, '2026-09-09')).toBe(true)
  })

  it('ใบรายเดือนที่ยังเดินอยู่ ไม่เลยกำหนด เพราะมันเลื่อนไปข้างหน้าเอง', () => {
    const hvac = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(isReminderOverdue(hvac, '2026-09-09')).toBe(false)
  })

  it('ใบครั้งเดียวที่พลาดไปแล้ว ถือว่าเลยกำหนด', () => {
    const once = reminder({ frequency: 'One-time', startDate: '2026-08-01' })
    expect(isReminderOverdue(once, '2026-09-09')).toBe(true)
  })
})

describe('reminderNextLabel', () => {
  it('บอกวันที่จริง ไม่ใช่คำบรรยายรอบที่ฝังไว้ตายตัว', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(reminderNextLabel(monthly, '2026-09-09')).toBe('Next: 2026-10-01')
  })
})

describe('workWeekOf', () => {
  it('คืนวันจันทร์ถึงศุกร์ของสัปดาห์ที่ครอบวันที่ให้มา', () => {
    // 2026-09-09 เป็นวันพุธ สัปดาห์นั้นเริ่มวันจันทร์ที่ 7
    const week = workWeekOf('2026-09-09')
    expect(week.map((d) => d.date)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ])
    expect(week[0].label).toBe('Mon 7')
    expect(week[4].label).toBe('Fri 11')
  })

  it('วันจันทร์เองต้องเป็นวันแรก ไม่ถอยไปสัปดาห์ก่อน', () => {
    expect(workWeekOf('2026-09-07')[0].date).toBe('2026-09-07')
  })

  it('วันอาทิตย์ยังนับเป็นสัปดาห์ที่เพิ่งผ่าน ไม่ใช่สัปดาห์ถัดไป', () => {
    expect(workWeekOf('2026-09-13')[0].date).toBe('2026-09-07')
  })

  it('ข้ามเดือนก็ยังต่อกันถูก', () => {
    expect(workWeekOf('2026-10-01').map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
  })
})
