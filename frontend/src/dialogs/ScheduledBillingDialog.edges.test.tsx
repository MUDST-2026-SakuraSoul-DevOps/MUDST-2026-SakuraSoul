import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import type { BillingSchedule } from '../api/types'
import { ScheduledBillingDialog } from './ScheduledBillingDialog'

/*
  หน้าต่างตั้งรอบส่งอีเมลเตือนบิล (SSK-143) เทสของหน้า Payments เปิดแล้วกดบันทึกค่าเดิม
  ตรงนี้ไล่ตัวเลือกวัน (ปุ่มลัด ตาราง 1-31 คลิกข้างนอกปิด) สรุปรอบล่าสุด และข้อความผิด
*/

const updateBillingSchedule = vi.fn()
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  updateBillingSchedule: (...args: unknown[]) => updateBillingSchedule(...args),
}))

function schedule(overrides: Partial<BillingSchedule> = {}): BillingSchedule {
  return {
    enabled: true,
    dayOfMonth: 25,
    sendTime: '09:00',
    updatedAt: '2026-10-01T00:00:00Z',
    nextRunAt: null,
    lastRun: null,
    ...overrides,
  }
}

function setup(s: BillingSchedule = schedule()) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const user = userEvent.setup()
  render(<ScheduledBillingDialog schedule={s} onClose={onClose} onSaved={onSaved} />)
  return { user, onClose, onSaved }
}

const trigger = () => screen.getByRole('button', { name: /Every \d+(st|nd|rd|th) of the month/ })

// ต้องมีปีกกา ถ้าคืนค่า mock ออกไป vitest จะถือว่าเป็นฟังก์ชัน cleanup แล้วเรียกมันหลังจบเทส
beforeEach(() => {
  updateBillingSchedule.mockReset()
})

describe('ScheduledBillingDialog', () => {
  it('picks a day from the quick presets and from the 1–31 grid', async () => {
    updateBillingSchedule.mockImplementation(async (form) => schedule(form))
    const { user, onSaved } = setup()

    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: '1st' }))
    expect(trigger()).toHaveTextContent('Every 1st of the month')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: '22' }))
    expect(trigger()).toHaveTextContent('Every 22nd of the month')

    await user.click(screen.getByRole('button', { name: 'Save Schedule' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateBillingSchedule).toHaveBeenCalledWith({ enabled: true, dayOfMonth: 22, sendTime: '09:00' })
  })

  it('closes the day picker on a click outside it but not on a click inside', async () => {
    const { user } = setup()

    await user.click(trigger())
    fireEvent.mouseDown(screen.getByText('Select Day:'))
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.mouseDown(document.body)
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')

    // เปิดแล้วกดปุ่มเดิมซ้ำก็ปิด
    await user.click(trigger())
    await user.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the hidden select in step for keyboard and screen reader users', () => {
    setup()
    fireEvent.change(document.getElementById('schedule-day')!, { target: { value: '3' } })
    expect(trigger()).toHaveTextContent('Every 3rd of the month')
  })

  it('pauses and resumes the schedule', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'Pause Schedule' }))
    expect(screen.getByText('Auto-Schedule is Paused')).toBeInTheDocument()
    expect(screen.getByText('No reminders are sent while the schedule is paused')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enable Schedule' }))
    expect(screen.getByText('Auto-Schedule is On')).toBeInTheDocument()
    expect(screen.getByText(/^Next run: /)).toBeInTheDocument()
  })

  it('refuses an empty send time before calling the server', async () => {
    const { user } = setup()

    fireEvent.change(screen.getByLabelText('Send Time'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Save Schedule' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Please choose the send time')
    expect(updateBillingSchedule).not.toHaveBeenCalled()
  })

  it('shows the server message and lets the user try again', async () => {
    updateBillingSchedule.mockRejectedValue(new ApiError(400, 'Billing day must be between 1 and 31'))
    const { user, onSaved } = setup()

    await user.click(screen.getByRole('button', { name: 'Save Schedule' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Billing day must be between 1 and 31')
    expect(screen.getByRole('button', { name: 'Save Schedule' })).toBeEnabled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('cannot be closed while saving', async () => {
    let finish: (value: BillingSchedule) => void = () => {}
    updateBillingSchedule.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { user, onClose } = setup()

    await user.click(screen.getByRole('button', { name: 'Save Schedule' }))
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    finish(schedule())
  })

  it.each([
    [null, 'No reminders have been sent yet.'],
    [
      { period: '2026-10', startedAt: '2026-10-25T02:00:00Z', finishedAt: null, sentCount: 0, skippedCount: 0, failedCount: 0, error: 'SMTP login failed' },
      /— failed: SMTP login failed$/,
    ],
    [
      { period: '2026-10', startedAt: '2026-10-25T02:00:00Z', finishedAt: '2026-10-25T02:01:00Z', sentCount: 5, skippedCount: 1, failedCount: 0, error: null },
      /— 5 sent, 1 skipped$/,
    ],
    [
      { period: '2026-10', startedAt: '2026-10-25T02:00:00Z', finishedAt: '2026-10-25T02:01:00Z', sentCount: 5, skippedCount: 1, failedCount: 2, error: null },
      /— 5 sent, 1 skipped, 2 not sent$/,
    ],
  ])('summarises the last run %#', (lastRun, expected) => {
    setup(schedule({ lastRun }))
    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
