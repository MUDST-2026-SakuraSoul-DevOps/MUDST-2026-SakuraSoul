import { describe, expect, it } from 'vitest'
import type { MaintenanceTask, Reminder, SupplyItem } from './maintenanceBoard'
import {
  heightPercent,
  reminderNextLabel,
  supplyStatus,
  validateMaintenanceTask,
  validateReminder,
  validateSupplyItem,
  verticalPercent,
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

describe('reminderNextLabel', () => {
  it('ใช้ข้อความที่ดีไซน์เขียนไว้ถ้ามี', () => {
    expect(reminderNextLabel(reminder({ nextLabel: 'Next: 1st of Month' }))).toBe(
      'Next: 1st of Month',
    )
  })

  it('ใบที่ผู้ใช้เพิ่มเองไม่มีข้อความนั้น จึงใช้วันเริ่มแทน', () => {
    expect(reminderNextLabel(reminder())).toBe('Next: 2026-09-01')
  })
})
