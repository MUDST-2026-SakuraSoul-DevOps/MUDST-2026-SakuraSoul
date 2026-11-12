import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { ReminderView } from '../domain/maintenanceBoard'
import { ReminderDialog } from './ReminderDialog'

/*
  ป็อปอัปเพิ่มและแก้รอบแจ้งเตือน (SSK-20) MaintenancePage.test.tsx เทสการบันทึกผ่านหน้าไปแล้ว
  ไฟล์นี้เทสค่าที่ป็อปอัปส่งให้ onSave ตรง ๆ กับข้อความตอนบันทึกไม่สำเร็จ ห้องมาจาก backend จำลอง
*/

const onClose = vi.fn()

beforeEach(() => {
  resetMockStore()
  onClose.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const existing: ReminderView = {
  id: 7,
  name: 'Water Tank Cleaning',
  frequency: 'Monthly',
  startDate: '2026-11-20',
  unit: '101',
  time: '09:00',
  priority: 'Medium',
  notes: 'Bring the long ladder',
  active: true,
  roomId: 1,
  nextDueDate: '2026-11-20',
  overdue: false,
  lastTriggeredAt: null,
}

async function fillNewReminder(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Reminder Name'), '  Elevator Check  ')
  await user.type(screen.getByLabelText('Start Date'), '2026-12-01')
  const unit = screen.getByLabelText('Assigned Unit')
  await within(unit).findByRole('option', { name: '101' })
  await user.selectOptions(unit, '101')
}

describe('ReminderDialog', () => {
  it('sends the frequency, time and priority that were picked, with the room of the chosen unit', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const room101 = (await fetchRooms()).find((room) => room.roomNumber === '101')!
    const user = userEvent.setup()
    render(<ReminderDialog onClose={onClose} onSave={onSave} />)

    await fillNewReminder(user)
    await user.selectOptions(screen.getByLabelText('Frequency'), 'Quarterly')
    await user.clear(screen.getByLabelText('Time'))
    await user.type(screen.getByLabelText('Time'), '14:30')
    await user.click(within(screen.getByRole('radiogroup', { name: 'Priority Level' })).getByRole('radio', { name: 'High' }))
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(
      {
        id: 0,
        name: 'Elevator Check',
        frequency: 'Quarterly',
        startDate: '2026-12-01',
        unit: '101',
        time: '14:30',
        priority: 'High',
        notes: '',
        active: true,
      },
      room101.id,
    )
  })

  it('keeps a new reminder open with a create message when saving fails without a reason from the API', async () => {
    const onSave = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<ReminderDialog onClose={onClose} onSave={onSave} />)

    await fillNewReminder(user)
    await user.click(screen.getByRole('button', { name: 'Save Reminder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the reminder')
    expect(screen.getByLabelText('Reminder Name')).toHaveValue('  Elevator Check  ')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps an edited reminder open with an edit message when saving fails without a reason from the API', async () => {
    const onSave = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<ReminderDialog mode="edit" reminder={existing} onClose={onClose} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the changes')
    // ห้องเดิมของรอบที่แก้ใช้ roomId เดิม ไม่ต้องรอรายการห้อง
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 7, unit: '101', priority: 'Medium' }), 1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
