import { describe, expect, it } from 'vitest'
import type { MaintenanceTask, Reminder, SupplyItem } from './maintenanceBoard'
import {
  heightPercent,
  isReminderOverdue,
  nextOccurrence,
  reminderNextLabel,
  restockHeadroom,
  composeSupplyCategory,
  splitSupplyCategory,
  supplyStatus,
  validateMaintenanceTask,
  validateReminder,
  validateRestockQuantity,
  validateSupplyItem,
  verticalPercent,
  workWeekOf,
} from './maintenanceBoard'

function task(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    id: 1,
    roomId: 1,
    task: 'AC Not Cooling',
    detail: '',
    maintenanceType: 'HVAC',
    unit: '101',
    priority: 'Medium',
    assignTo: '',
    reportBy: '',
    date: '',
    status: 'Wait for Assign',
    billToTenant: false,
    amount: 0,
    ...overrides,
  }
}

function supply(overrides: Partial<SupplyItem> = {}): SupplyItem {
  return {
    id: 1,
    name: 'LED Bulbs 60W',
    sku: 'EL-001',
    category: 'Electrical',
    stock: 10,
    minStock: 5,
    maxStock: 50,
    ...overrides,
  }
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
  it('accepts a task with a title and unit number', () => {
    expect(validateMaintenanceTask(task())).toBeNull()
  })

  it('rejects a task without a title', () => {
    expect(validateMaintenanceTask(task({ task: '' }))).toBe('Please enter the task title')
  })

  it('rejects a task without a unit number', () => {
    expect(validateMaintenanceTask(task({ unit: '' }))).toBe('Please enter the unit number')
  })

  it('rejects a unit number that is not three digits', () => {
    expect(validateMaintenanceTask(task({ unit: 'A1' }))).toContain('three digits')
    expect(validateMaintenanceTask(task({ unit: '10' }))).toContain('three digits')
  })
})

describe('validateSupplyItem', () => {
  it('accepts a supply item with a name, category, and non-negative quantity', () => {
    expect(validateSupplyItem(supply())).toBeNull()
  })

  it('allows zero stock when the item is out of stock', () => {
    expect(validateSupplyItem(supply({ stock: 0, minStock: 5 }))).toBeNull()
  })

  it('rejects a negative quantity', () => {
    expect(validateSupplyItem(supply({ stock: -1 }))).toBe('Quantity cannot be negative')
  })

  it('rejects NaN from an empty quantity field', () => {
    expect(validateSupplyItem(supply({ stock: Number.NaN }))).toBe('Quantity cannot be negative')
  })

  /*
    BUG-M6 in SSK-111 adds a Max Stock field to cap restocking
  */
  it('rejects a negative maximum stock', () => {
    expect(validateSupplyItem(supply({ maxStock: -1 }))).toBe('Maximum stock cannot be negative')
  })

  it('rejects a maximum stock below the minimum stock', () => {
    expect(validateSupplyItem(supply({ minStock: 50, maxStock: 20 }))).toBe(
      'Maximum stock cannot be lower than minimum stock',
    )
  })

  it('allows maximum stock equal to minimum stock', () => {
    expect(validateSupplyItem(supply({ minStock: 50, maxStock: 50 }))).toBeNull()
  })

  /*
    QA reported that stock could exceed the configured maximum. The observed example was
    LED Bulbs 60W had 284 items despite a configured maximum of 200
  */
  it('rejects stock above the maximum', () => {
    expect(validateSupplyItem(supply({ stock: 284, minStock: 50, maxStock: 200 }))).toBe(
      'Quantity cannot be higher than maximum stock',
    )
  })

  it('allows stock equal to the maximum', () => {
    expect(validateSupplyItem(supply({ stock: 200, minStock: 50, maxStock: 200 }))).toBeNull()
  })
})

describe('validateRestockQuantity', () => {
  it('accepts a positive restock quantity', () => {
    expect(validateRestockQuantity(supply(), 20)).toBeNull()
  })

  it('rejects zero because restocking by zero has no effect', () => {
    expect(validateRestockQuantity(supply(), 0)).toContain('greater than 0')
  })

  it('rejects a negative restock quantity', () => {
    expect(validateRestockQuantity(supply(), -5)).toContain('greater than 0')
  })

  it('rejects decimal quantities because supplies are counted as whole items', () => {
    expect(validateRestockQuantity(supply(), 2.5)).toContain('whole number')
  })

  it('rejects NaN from an empty restock field', () => {
    expect(validateRestockQuantity(supply(), Number.NaN)).toContain('greater than 0')
  })

  /*
    QA reported that restocking could exceed Max Stock despite the configured limit
  */
  it('rejects restocking above the maximum', () => {
    expect(validateRestockQuantity(supply({ stock: 145, maxStock: 200 }), 139)).toContain(
      'above the maximum stock of 200',
    )
  })

  it('allows restocking up to the maximum', () => {
    expect(validateRestockQuantity(supply({ stock: 145, maxStock: 200 }), 55)).toBeNull()
  })

  it('uses each item maximum instead of a shared inventory maximum', () => {
    expect(validateRestockQuantity(supply({ stock: 0, maxStock: 60 }), 61)).toContain(
      'above the maximum stock of 60',
    )
    expect(validateRestockQuantity(supply({ stock: 0, maxStock: 200 }), 61)).toBeNull()
  })
})

describe('restockHeadroom', () => {
  it('returns the remaining restock headroom', () => {
    expect(restockHeadroom(supply({ stock: 145, maxStock: 200 }))).toBe(55)
  })

  it('returns zero when stock is already above the maximum', () => {
    expect(restockHeadroom(supply({ stock: 284, maxStock: 200 }))).toBe(0)
  })
})

describe('validateReminder', () => {
  it('rejects a reminder without a start date', () => {
    expect(validateReminder(reminder({ startDate: '' }))).toBe('Please choose a start date')
  })
})

describe('supplyStatus', () => {
  it('returns Low Stock below the minimum', () => {
    expect(supplyStatus(supply({ stock: 4, minStock: 5 }))).toBe('Low Stock')
  })

  it('returns Low Stock for zero stock when the minimum is positive', () => {
    expect(supplyStatus(supply({ stock: 0, minStock: 5 }))).toBe('Low Stock')
  })

  it('does not return Low Stock for zero stock when the minimum is zero', () => {
    expect(supplyStatus(supply({ stock: 0, minStock: 0 }))).toBe('In Stock')
  })

  it('returns In Stock at the minimum', () => {
    expect(supplyStatus(supply({ stock: 5, minStock: 5 }))).toBe('In Stock')
  })
})

describe('calendar positioning', () => {
  it('maps the start and end of the calendar to 0 and 100', () => {
    expect(verticalPercent('08:00')).toBe(0)
    expect(verticalPercent('18:00')).toBe(100)
  })

  it('maps midday to the middle of the calendar', () => {
    expect(verticalPercent('13:00')).toBe(50)
  })

  it('clamps times outside the range to the calendar bounds', () => {
    expect(verticalPercent('06:00')).toBe(0)
    expect(verticalPercent('23:00')).toBe(100)
  })

  it('sets block height to the occupied time range', () => {
    expect(heightPercent('08:00', '13:00')).toBe(50)
  })

  it('returns zero height when the end time is before the start time', () => {
    expect(heightPercent('13:00', '09:00')).toBe(0)
  })
})

/**
 * This case covers a QA report that the Roofing Inspection card showed the next occurrence as September
 * 2024 2024, which was two years ago, without showing an overdue status
 *
 * The cause was a hardcoded next-occurrence label that did not advance over time
 */
describe('nextOccurrence', () => {
  it('does not move a one-time reminder after its date has passed', () => {
    const once = reminder({ frequency: 'One-time', startDate: '2026-01-10' })
    expect(nextOccurrence(once, '2026-09-09')).toBe('2026-01-10')
  })

  it('moves a monthly reminder to the next future occurrence', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(nextOccurrence(monthly, '2026-09-09')).toBe('2026-10-01')
  })

  it('keeps today as the next occurrence', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(nextOccurrence(monthly, '2026-09-01')).toBe('2026-09-01')
  })

  it('moves a quarterly reminder by three months', () => {
    const quarterly = reminder({ frequency: 'Quarterly', startDate: '2026-01-15' })
    expect(nextOccurrence(quarterly, '2026-09-09')).toBe('2026-10-15')
  })

  it('clamps day 31 to day 30 in a 30-day month', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-03-31' })
    expect(nextOccurrence(monthly, '2026-04-15')).toBe('2026-04-30')
  })

  it('keeps an inactive reminder at its start date', () => {
    const paused = reminder({ frequency: 'Annual', startDate: '2024-09-01', active: false })
    expect(nextOccurrence(paused, '2026-09-09')).toBe('2024-09-01')
  })
})

describe('isReminderOverdue', () => {
  it('marks an inactive reminder from two years ago as overdue', () => {
    const roofing = reminder({ frequency: 'Annual', startDate: '2024-09-01', active: false })
    expect(isReminderOverdue(roofing, '2026-09-09')).toBe(true)
  })

  it('does not mark an active monthly reminder overdue because it advances', () => {
    const hvac = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(isReminderOverdue(hvac, '2026-09-09')).toBe(false)
  })

  it('marks a missed one-time reminder as overdue', () => {
    const once = reminder({ frequency: 'One-time', startDate: '2026-08-01' })
    expect(isReminderOverdue(once, '2026-09-09')).toBe(true)
  })
})

describe('reminderNextLabel', () => {
  it('shows the calculated date instead of a fixed frequency description', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(reminderNextLabel(monthly, '2026-09-09')).toBe('Next: 2026-10-01')
  })
})

describe('workWeekOf', () => {
  it('returns Monday through Friday for the containing week', () => {
    // 2026-09-09 is a Wednesday, so that week starts on Monday the 7th
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

  it('keeps Monday as the first day of its week', () => {
    expect(workWeekOf('2026-09-07')[0].date).toBe('2026-09-07')
  })

  it('keeps Sunday in the week that just ended', () => {
    expect(workWeekOf('2026-09-13')[0].date).toBe('2026-09-07')
  })

  it('handles weeks spanning two months', () => {
    expect(workWeekOf('2026-10-01').map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
  })
})

describe('หมวด Other ของ Supply Item', () => {
  it('เลือก Other แล้วพิมพ์รายละเอียด เก็บเป็น Other: รายละเอียด', () => {
    expect(composeSupplyCategory('Other', '  Gardening tools ')).toBe('Other: Gardening tools')
  })

  it('เลือก Other แต่ไม่พิมพ์รายละเอียด เก็บเป็น Other เฉย ๆ', () => {
    expect(composeSupplyCategory('Other', '   ')).toBe('Other')
  })

  it('หมวดอื่นไม่เอารายละเอียดมาปน แม้จะเคยพิมพ์ค้างไว้ตอนเลือก Other', () => {
    expect(composeSupplyCategory('Plumbing', 'Gardening tools')).toBe('Plumbing')
  })

  it('แยกค่าที่เก็บไว้กลับเป็นหมวดกับรายละเอียดตอนเปิดแก้', () => {
    expect(splitSupplyCategory('Other: Gardening tools')).toEqual({ choice: 'Other', otherDetail: 'Gardening tools' })
    expect(splitSupplyCategory('HVAC')).toEqual({ choice: 'HVAC', otherDetail: '' })
    expect(splitSupplyCategory('')).toEqual({ choice: '', otherDetail: '' })
  })

  it('หมวดเก่าที่พิมพ์ไว้ก่อนเป็น dropdown นับเป็น Other และข้อความเดิมไม่หาย', () => {
    expect(splitSupplyCategory('Garden')).toEqual({ choice: 'Other', otherDetail: 'Garden' })
  })
})
