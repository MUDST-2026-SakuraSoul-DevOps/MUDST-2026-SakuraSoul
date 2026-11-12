import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '../api/client'
import { fetchBillingSchedule } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { BillingSchedule } from '../api/types'
import { displayDateTime } from '../format'
import { ScheduledBillingDialog } from './ScheduledBillingDialog'

/*
  ป็อปอัปตั้งเวลาเตือนใบค้าง (SSK-143) เรนเดอร์ตรง ๆ ด้วยค่าที่ backend จำลองตอบ คือปิดอยู่ วันที่ 25 เวลา 09:00
  และบันทึกผ่าน PUT /api/billing-schedule ของ backend จำลอง

  backend จำลองไม่มีงานตั้งเวลา lastRun จึงเป็น null เสมอ เทสที่ต้องเห็นผลรอบล่าสุดใส่รอบเองตามรูปที่
  BillingScheduleService ฝั่ง backend เก็บ: รอบที่ส่งได้ตามปกติ error เป็น null, skippedCount นับใบที่ข้ามเพราะไม่มีอีเมล
  และ failedCount นับใบที่เมลเซิร์ฟเวอร์ปฏิเสธหลังจากใบก่อนหน้าออกไปแล้ว
*/

function renderSchedule(schedule: BillingSchedule) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<ScheduledBillingDialog schedule={schedule} onClose={onClose} onSaved={onSaved} />)
  return { onClose, onSaved }
}

beforeEach(() => {
  resetMockStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ScheduledBillingDialog', () => {
  it('says how many reminders the mail server refused in the last run', async () => {
    const schedule = await fetchBillingSchedule()
    renderSchedule({
      ...schedule,
      lastRun: {
        period: '2026-09',
        startedAt: '2026-09-25T02:00:00.000Z',
        finishedAt: '2026-09-25T02:00:09.000Z',
        sentCount: 3,
        skippedCount: 1,
        failedCount: 2,
        error: null,
      },
    })

    expect(
      screen.getByText(`Last run: ${displayDateTime('2026-09-25T02:00:00.000Z')} — 3 sent, 1 skipped, 2 not sent`),
    ).toBeInTheDocument()
  })

  it('picks the billing day from the quick choices or the day grid and saves it', async () => {
    const user = userEvent.setup()
    const save = vi.spyOn(api, 'updateBillingSchedule')
    const { onSaved } = renderSchedule(await fetchBillingSchedule())
    const dayOfMonth = screen.getByLabelText('Billing Day of Month')

    const trigger = screen.getByRole('button', { name: 'Every 25th of the month' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText("Months with fewer days (e.g. Feb) dispatch on month's last day.")).toBeInTheDocument()
    // วันที่ตั้งไว้ตอนนี้ถูกไฮไลต์ทั้งในปุ่มลัดและในตารางวัน
    expect(screen.getByRole('button', { name: '25th (Recommended)' })).toHaveClass('bg-brand')
    expect(screen.getByRole('button', { name: '25' })).toHaveClass('bg-brand')
    expect(screen.getByRole('button', { name: '1st' })).not.toHaveClass('bg-brand')
    expect(screen.getByRole('button', { name: '1' })).not.toHaveClass('bg-brand')

    await user.click(screen.getByRole('button', { name: '1st' }))
    expect(screen.getByRole('button', { name: 'Every 1st of the month' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Select Day:')).not.toBeInTheDocument()
    expect(dayOfMonth).toHaveValue('1')

    await user.click(screen.getByRole('button', { name: 'Every 1st of the month' }))
    await user.click(screen.getByRole('button', { name: '31' }))
    expect(screen.getByRole('button', { name: 'Every 31st of the month' })).toHaveAttribute('aria-expanded', 'false')
    expect(dayOfMonth).toHaveValue('31')

    // กดปุ่มเดิมซ้ำปิดกล่อง คลิกในกล่องกล่องยังเปิด คลิกที่อื่นในป็อปอัปกล่องปิดโดยวันที่ไม่เปลี่ยน
    const lastDay = screen.getByRole('button', { name: 'Every 31st of the month' })
    await user.click(lastDay)
    await user.click(lastDay)
    expect(screen.queryByText('Select Day:')).not.toBeInTheDocument()
    await user.click(lastDay)
    await user.click(screen.getByText('Select Day:'))
    expect(screen.getByText('Select Day:')).toBeInTheDocument()
    await user.click(screen.getByRole('heading', { name: 'Scheduled Bulk Billing' }))
    expect(screen.queryByText('Select Day:')).not.toBeInTheDocument()
    expect(lastDay).toHaveAttribute('aria-expanded', 'false')
    expect(dayOfMonth).toHaveValue('31')

    await user.click(screen.getByRole('button', { name: 'Save Schedule' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith({ enabled: false, dayOfMonth: 31, sendTime: '09:00' })
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, dayOfMonth: 31, sendTime: '09:00', nextRunAt: null, lastRun: null }),
    )
  })

  it('asks for the send time when it has been cleared and saves nothing', async () => {
    const save = vi.spyOn(api, 'updateBillingSchedule')
    const { onClose, onSaved } = renderSchedule(await fetchBillingSchedule())

    fireEvent.change(screen.getByLabelText('Send Time'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose the send time')
    expect(save).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save Schedule' })).toBeEnabled()
    expect(screen.getByRole('dialog', { name: 'Scheduled Bulk Billing' })).toBeInTheDocument()
    expect(await fetchBillingSchedule()).toMatchObject({ enabled: false, sendTime: '09:00' })
  })

  it('cannot be closed while saving, then hands back the schedule the server saved', async () => {
    const user = userEvent.setup()
    const realSave = api.updateBillingSchedule
    let finishSaving: () => void = () => {}
    const saving = new Promise<void>((resolve) => {
      finishSaving = resolve
    })
    const save = vi.spyOn(api, 'updateBillingSchedule').mockImplementation(async (body) => {
      await saving
      return realSave(body)
    })
    const { onClose, onSaved } = renderSchedule(await fetchBillingSchedule())

    await user.click(screen.getByRole('button', { name: 'Enable Schedule' }))
    await user.click(screen.getByRole('button', { name: 'Save Schedule' }))

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    // ระหว่างบันทึก Esc กับปุ่มกากบาทไม่ปิดป็อปอัป
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Scheduled Bulk Billing' })).toBeInTheDocument()

    finishSaving()

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith({ enabled: true, dayOfMonth: 25, sendTime: '09:00' })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, dayOfMonth: 25, sendTime: '09:00' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
