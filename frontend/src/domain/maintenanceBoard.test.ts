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
  validateRestockQuantity,
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
  it('passes when the task title and unit number are filled', () => {
    expect(validateMaintenanceTask(task())).toBeNull()
  })

  it('rejects a missing task title', () => {
    expect(validateMaintenanceTask(task({ task: '' }))).toBe('Please enter the task title')
  })

  it('rejects a missing unit number', () => {
    expect(validateMaintenanceTask(task({ unit: '' }))).toBe('Please enter the unit number')
  })

  it('rejects unit numbers that are not three digits', () => {
    expect(validateMaintenanceTask(task({ unit: 'A1' }))).toContain('three digits')
    expect(validateMaintenanceTask(task({ unit: '10' }))).toContain('three digits')
  })
})

describe('validateSupplyItem', () => {
  it('passes when name and category are filled and quantity is non-negative', () => {
    expect(validateSupplyItem(supply())).toBeNull()
  })

  it('rejects negative quantities', () => {
    expect(validateSupplyItem(supply({ stock: -1 }))).toBe('Quantity cannot be negative')
  })

  it('rejects NaN from empty quantity inputs instead of saving stock data', () => {
    expect(validateSupplyItem(supply({ stock: Number.NaN }))).toBe('Quantity cannot be negative')
  })
})

describe('validateRestockQuantity', () => {
  it('passes positive quantities', () => {
    expect(validateRestockQuantity(20)).toBeNull()
  })

  it('rejects zero because restocking by zero is meaningless', () => {
    expect(validateRestockQuantity(0)).toContain('greater than 0')
  })

  it('rejects negative values', () => {
    expect(validateRestockQuantity(-5)).toContain('greater than 0')
  })

  it('rejects decimals because supplies are counted as whole items', () => {
    expect(validateRestockQuantity(2.5)).toContain('whole number')
  })

  it('rejects NaN from empty fields', () => {
    expect(validateRestockQuantity(Number.NaN)).toContain('greater than 0')
  })
})

describe('validateReminder', () => {
  it('rejects reminders without a start date because the next occurrence cannot be computed', () => {
    expect(validateReminder(reminder({ startDate: '' }))).toBe('Please choose a start date')
  })
})

describe('supplyStatus', () => {
  it('marks stock below the minimum as Low Stock', () => {
    expect(supplyStatus(supply({ stock: 4, minStock: 5 }))).toBe('Low Stock')
  })

  it('treats stock equal to the minimum as In Stock', () => {
    expect(supplyStatus(supply({ stock: 5, minStock: 5 }))).toBe('In Stock')
  })
})

describe('calendar positioning', () => {
  it('maps the start of the grid to 0 and the end to 100', () => {
    expect(verticalPercent('08:00')).toBe(0)
    expect(verticalPercent('18:00')).toBe(100)
  })

  it('maps midday to the middle of the grid', () => {
    expect(verticalPercent('13:00')).toBe(50)
  })

  it('clamps times outside the schedule range to the grid edges', () => {
    expect(verticalPercent('06:00')).toBe(0)
    expect(verticalPercent('23:00')).toBe(100)
  })

  it('sets block height from the actual duration', () => {
    expect(heightPercent('08:00', '13:00')).toBe(50)
  })

  it('returns zero height when the end time is before the start time', () => {
    expect(heightPercent('13:00', '09:00')).toBe(0)
  })
})

/**
 * QA flagged that the Roofing Inspection card showed the next occurrence in
 * September 2024, two years in the past, without any overdue state.
 *
 * The root cause was storing the next-occurrence text as static data, so it
 * never moved forward as time passed.
 */
describe('nextOccurrence', () => {
  it('does not advance one-time reminders even after the date has passed', () => {
    const once = reminder({ frequency: 'One-time', startDate: '2026-01-10' })
    expect(nextOccurrence(once, '2026-09-09')).toBe('2026-01-10')
  })

  it('advances monthly reminders to the next future occurrence', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(nextOccurrence(monthly, '2026-09-09')).toBe('2026-10-01')
  })

  it('keeps today as the next occurrence instead of skipping to next month', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(nextOccurrence(monthly, '2026-09-01')).toBe('2026-09-01')
  })

  it('advances quarterly reminders by three months', () => {
    const quarterly = reminder({ frequency: 'Quarterly', startDate: '2026-01-15' })
    expect(nextOccurrence(quarterly, '2026-09-09')).toBe('2026-10-15')
  })

  it('clamps day 31 to day 30 when the target month has only 30 days', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-03-31' })
    expect(nextOccurrence(monthly, '2026-04-15')).toBe('2026-04-30')
  })

  it('keeps inactive reminders pinned to their start date', () => {
    const paused = reminder({ frequency: 'Annual', startDate: '2024-09-01', active: false })
    expect(nextOccurrence(paused, '2026-09-09')).toBe('2024-09-01')
  })
})

describe('isReminderOverdue', () => {
  it('marks an inactive reminder from two years ago as overdue', () => {
    const roofing = reminder({ frequency: 'Annual', startDate: '2024-09-01', active: false })
    expect(isReminderOverdue(roofing, '2026-09-09')).toBe(true)
  })

  it('does not mark active monthly reminders as overdue because they advance forward', () => {
    const hvac = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(isReminderOverdue(hvac, '2026-09-09')).toBe(false)
  })

  it('marks missed one-time reminders as overdue', () => {
    const once = reminder({ frequency: 'One-time', startDate: '2026-08-01' })
    expect(isReminderOverdue(once, '2026-09-09')).toBe(true)
  })
})

describe('reminderNextLabel', () => {
  it('shows the computed date instead of a static recurrence description', () => {
    const monthly = reminder({ frequency: 'Monthly', startDate: '2026-09-01' })
    expect(reminderNextLabel(monthly, '2026-09-09')).toBe('Next: 2026-10-01')
  })
})

describe('workWeekOf', () => {
  it('returns Monday through Friday for the week containing the given date', () => {
    // 2026-09-09 is Wednesday, so that work week starts on Monday the 7th.
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

  it('uses Monday itself as the first day instead of moving to the previous week', () => {
    expect(workWeekOf('2026-09-07')[0].date).toBe('2026-09-07')
  })

  it('treats Sunday as part of the week that just ended, not the next week', () => {
    expect(workWeekOf('2026-09-13')[0].date).toBe('2026-09-07')
  })

  it('keeps the week continuous across month boundaries', () => {
    expect(workWeekOf('2026-10-01').map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
  })
})
