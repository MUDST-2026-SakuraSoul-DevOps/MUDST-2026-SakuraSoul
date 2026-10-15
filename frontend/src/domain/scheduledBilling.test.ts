import { describe, expect, it } from 'vitest'
import {
  billingPeriodOf,
  billingSlotAt,
  DEFAULT_BILLING_SCHEDULE_REQUEST,
  nextBillingRunAt,
  normalizeSendTime,
  validateBillingSchedule,
} from './scheduledBilling'

/*
  SSK-143 กฎของค่าตั้งเวลาเตือนใบค้างรายเดือน เคสทั้งหมดตรงกับ BillingScheduleRulesTest ฝั่ง backend
  ถ้าสองไฟล์นี้เริ่มคาดหวังคนละอย่าง แปลว่ากฎสองฝั่งหลุดจากกันแล้ว ป็อปอัปจะบอกรอบถัดไปไม่ตรงกับที่งานจริงส่ง
*/

describe('validateBillingSchedule', () => {
  it('checks each field in form order with the same messages as the backend', () => {
    expect(validateBillingSchedule({ dayOfMonth: 25, sendTime: '09:00' })).toBe(
      'Please choose whether the schedule is enabled',
    )
    expect(validateBillingSchedule({ enabled: true, sendTime: '09:00' })).toBe('Please choose the billing day')
    expect(validateBillingSchedule({ enabled: true, dayOfMonth: Number.NaN, sendTime: '09:00' })).toBe(
      'Please choose the billing day',
    )
    expect(validateBillingSchedule({ enabled: true, dayOfMonth: 0, sendTime: '09:00' })).toBe(
      'Billing day must be between 1 and 31',
    )
    expect(validateBillingSchedule({ enabled: true, dayOfMonth: 32, sendTime: '09:00' })).toBe(
      'Billing day must be between 1 and 31',
    )
    expect(validateBillingSchedule({ enabled: true, dayOfMonth: 25, sendTime: ' ' })).toBe(
      'Please choose the send time',
    )
    expect(validateBillingSchedule({ enabled: true, dayOfMonth: 25, sendTime: '25:00' })).toBe(
      'The send time must be in HH:MM format',
    )
    expect(validateBillingSchedule(DEFAULT_BILLING_SCHEDULE_REQUEST)).toBeNull()
    expect(validateBillingSchedule({ enabled: true, dayOfMonth: 31, sendTime: '23:59' })).toBeNull()
  })

  it('starts paused on the 25th at 09:00 like the row V15 inserts', () => {
    expect(DEFAULT_BILLING_SCHEDULE_REQUEST).toEqual({ enabled: false, dayOfMonth: 25, sendTime: '09:00' })
  })

  it('keeps minutes only, like the backend stores the time', () => {
    expect(normalizeSendTime('10:30:59')).toBe('10:30')
    expect(normalizeSendTime('07:05')).toBe('07:05')
  })
})

describe('billingSlotAt', () => {
  it('turns 09:00 Bangkok time into 02:00 UTC', () => {
    expect(billingSlotAt('2026-10', 25, '09:00')).toBe('2026-10-25T02:00:00.000Z')
  })

  it('uses the last day of short months: Feb 2026 gets the 28th and Feb 2028 the 29th', () => {
    expect(billingSlotAt('2026-02', 31, '09:00')).toBe('2026-02-28T02:00:00.000Z')
    expect(billingSlotAt('2028-02', 31, '09:00')).toBe('2028-02-29T02:00:00.000Z')
    expect(billingSlotAt('2026-04', 31, '09:00')).toBe('2026-04-30T02:00:00.000Z')
    expect(billingSlotAt('2026-01', 31, '09:00')).toBe('2026-01-31T02:00:00.000Z')
  })

  it('puts half past midnight in Bangkok on the previous day in UTC', () => {
    expect(billingSlotAt('2026-10', 1, '00:30')).toBe('2026-09-30T17:30:00.000Z')
  })
})

describe('nextBillingRunAt', () => {
  const schedule = { enabled: true, dayOfMonth: 25, sendTime: '09:00' }

  it('has no next run while paused', () => {
    expect(
      nextBillingRunAt({ ...schedule, enabled: false, updatedAt: '2026-09-01T00:00:00Z' }, false, new Date('2026-09-25T03:00:00Z')),
    ).toBeNull()
  })

  it('runs this month when saved before this month’s slot', () => {
    expect(
      nextBillingRunAt({ ...schedule, updatedAt: '2026-09-20T03:00:00Z' }, false, new Date('2026-09-20T05:00:00Z')),
    ).toBe('2026-09-25T02:00:00.000Z')
  })

  it('waits for next month when enabled after this month’s slot, instead of emailing everyone at once', () => {
    expect(
      nextBillingRunAt({ ...schedule, updatedAt: '2026-09-26T03:00:00Z' }, false, new Date('2026-09-26T03:01:00Z')),
    ).toBe('2026-10-25T02:00:00.000Z')
  })

  it('waits for next month when this month already ran', () => {
    expect(
      nextBillingRunAt({ ...schedule, updatedAt: '2026-09-01T00:00:00Z' }, true, new Date('2026-09-25T02:05:00Z')),
    ).toBe('2026-10-25T02:00:00.000Z')
  })

  it('still catches up this month after the backend was down at the slot', () => {
    expect(
      nextBillingRunAt({ ...schedule, updatedAt: '2026-09-01T00:00:00Z' }, false, new Date('2026-09-27T07:00:00Z')),
    ).toBe('2026-09-25T02:00:00.000Z')
  })

  it('runs on the last day of February when set to the 31st', () => {
    expect(
      nextBillingRunAt(
        { ...schedule, dayOfMonth: 31, updatedAt: '2026-01-31T03:00:00Z' },
        false,
        new Date('2026-02-10T02:00:00Z'),
      ),
    ).toBe('2026-02-28T02:00:00.000Z')
  })
})

describe('billingPeriodOf', () => {
  it('follows Bangkok time: 01:00 on 1 Oct in Bangkok is October even though UTC is still in September', () => {
    expect(billingPeriodOf(new Date('2026-09-30T18:00:00Z'))).toBe('2026-10')
  })
})
