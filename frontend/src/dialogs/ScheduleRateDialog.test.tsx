import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoomRate, fetchRoomRates, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import { ScheduleRateDialog } from './ScheduleRateDialog'

const rate = {
  effectiveFrom: '2099-12',
  monthlyRent: 5000,
  electricRatePerUnit: 9,
  waterRatePerUnit: 20,
  commonAreaFee: 350,
  internetFee: 300,
}

beforeEach(() => resetMockStore())

describe('ScheduleRateDialog PH2-03 S4', () => {
  it('shows the duplicate-month reason, preserves the saved rate, then accepts a different month', async () => {
    // ใช้ client กับ API จำลองจริง เพื่อให้ข้อความผิดพลาดและข้อมูลที่อ่านกลับผ่านเส้นทางเดียวกับหน้าเว็บ
    const rooms = await fetchRooms()
    const roomId = rooms[0].id
    const original = await createRoomRate(roomId, rate)
    const onClose = vi.fn()
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<ScheduleRateDialog rooms={rooms} roomId={roomId} defaults={rate} onClose={onClose} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/Effective from/), { target: { value: '2099-12' } })
    await user.click(screen.getByRole('button', { name: 'Schedule rate' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A rate starting 2099-12 already exists for this unit')
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(await fetchRoomRates(roomId)).toEqual([original])

    // แก้เฉพาะเดือนเริ่มเป็นเดือนอื่นแล้วบันทึกได้ โดยอัตราเดิมยังอยู่ครบ
    fireEvent.change(screen.getByLabelText(/Effective from/), { target: { value: '2099-11' } })
    await user.click(screen.getByRole('button', { name: 'Schedule rate' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(roomId))
    expect(onClose).toHaveBeenCalledOnce()
    const saved = await fetchRoomRates(roomId)
    expect(saved).toHaveLength(2)
    expect(saved).toContainEqual(original)
    expect(saved[1]).toMatchObject({ effectiveFrom: '2099-11', monthlyRent: 5000 })
  })
})

describe('ScheduleRateDialog checks before saving', () => {
  it('refuses a negative rent and schedules for the unit picked in the list', async () => {
    const rooms = await fetchRooms()
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<ScheduleRateDialog rooms={rooms} roomId={rooms[0].id} defaults={rate} onClose={vi.fn()} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/Monthly rent/), { target: { value: '-1' } })
    await user.click(screen.getByRole('button', { name: 'Schedule rate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Monthly rent cannot be negative')

    fireEvent.change(screen.getByLabelText(/Monthly rent/), { target: { value: '4800' } })
    await user.selectOptions(screen.getByLabelText('Unit'), String(rooms[1].id))
    await user.click(screen.getByRole('button', { name: 'Schedule rate' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(rooms[1].id))
    expect((await fetchRoomRates(rooms[1].id)).some((r) => r.monthlyRent === 4800)).toBe(true)
  })
})
