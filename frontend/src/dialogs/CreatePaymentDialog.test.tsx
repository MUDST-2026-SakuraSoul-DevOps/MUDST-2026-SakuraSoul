import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as client from '../api/client'
import { ApiError } from '../api/client'
import type { Lease, RoomSummary } from '../api/types'
import { resetMockStore } from '../api/mockApi'
import { CreatePaymentDialog } from './CreatePaymentDialog'

/*
  หน้าต่างออกบิลห้องเดียว (New Invoice) เทสของหน้า Payments ออกบิลทางหลักไปแล้ว
  ตรงนี้คุมช่องเลือกห้อง (รายการ ห้องว่าง ปิดเมื่อคลิกข้างนอก) ค่าใช้จ่ายพิเศษในตัวอย่างบิล
  และข้อความเตือนก่อนส่ง ใช้ backend จำลองจริง แทนเฉพาะตัวที่ต้องบังคับให้พังหรือส่งข้อมูลพิเศษ
*/

function setup() {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  const user = userEvent.setup()
  render(<CreatePaymentDialog onClose={onClose} onCreated={onCreated} />)
  return { user, onClose, onCreated }
}

const roomInput = () => screen.getByPlaceholderText('Select or enter a room...')

beforeEach(() => {
  resetMockStore()
  vi.restoreAllMocks()
})

describe('CreatePaymentDialog', () => {
  it('lists every room with its tenant or as vacant and picks one from the list', async () => {
    const { user } = setup()
    await waitFor(() => expect(roomInput()).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Toggle unit options' }))
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    expect(options.some((o) => /\(Vacant\)/.test(o.textContent ?? ''))).toBe(true)

    const kenji = options.find((o) => /201 · Kenji/.test(o.textContent ?? ''))!
    await user.click(kenji)
    expect(roomInput()).toHaveValue('201')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue(/Kenji/)).toBeInTheDocument()

    // เปิดใหม่แล้วตัวที่เลือกอยู่ถูกทำเครื่องหมาย
    await user.click(screen.getByRole('button', { name: 'Toggle unit options' }))
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('201')
  })

  it('opens the list on focus and closes it on a click outside', async () => {
    const { user } = setup()
    await waitFor(() => expect(roomInput()).toBeEnabled())

    await user.click(roomInput())
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('listbox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('builds the room list from contracts when the room list is empty', async () => {
    vi.spyOn(client, 'fetchRooms').mockResolvedValue([] as RoomSummary[])
    const { user } = setup()
    await waitFor(() => expect(roomInput()).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Toggle unit options' }))
    const labels = screen.getAllByRole('option').map((o) => o.textContent)
    expect(labels.every((l) => !/Vacant/.test(l ?? ''))).toBe(true)
    expect(labels).toEqual([...labels].sort())
  })

  it('asks for a room, then says a vacant room has no contract', async () => {
    const { user } = setup()
    await waitFor(() => expect(roomInput()).toBeEnabled())

    fireEvent.submit(roomInput().closest('form')!)
    expect(await screen.findByText('Please select a room')).toBeInTheDocument()

    await user.type(roomInput(), '101')
    expect(screen.getByDisplayValue('No active contract')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create Bill' }))
    expect(await screen.findAllByText('Room 101 has no active contract')).not.toHaveLength(0)
  })

  it('shows why the form is not ready when a lookup failed', async () => {
    vi.spyOn(client, 'fetchApartmentConfig').mockRejectedValue(new ApiError(500, 'Config is down'))
    setup()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Bill' })).toBeDisabled())
    fireEvent.submit(roomInput().closest('form')!)
    expect(await screen.findByText('Config is down')).toBeInTheDocument()
  })

  it('asks to wait while the contracts are still loading', async () => {
    vi.spyOn(client, 'fetchLeases').mockReturnValue(new Promise(() => {}))
    setup()

    fireEvent.submit(roomInput().closest('form')!)
    expect(await screen.findByText('The contracts and utility rates are still loading. Please try again in a moment.')).toBeInTheDocument()
  })

  it('lists the extra charges due this month in the bill preview and sends the due date', async () => {
    const leases = await client.fetchLeases({ status: 'ACTIVE' })
    const kenji = leases.find((l) => l.roomNumber === '201')!
    const withParking: Lease = {
      ...kenji,
      extraCharges: [{ chargeId: 91, label: 'Parking', amount: 500, recurrence: 'MONTHLY', startMonth: '2020-01', endMonth: null, active: true }],
    }
    vi.spyOn(client, 'fetchLeases').mockResolvedValue(leases.map((l) => (l.id === kenji.id ? withParking : l)))
    const create = vi.spyOn(client, 'createReceipt')
    const { user, onCreated, onClose } = setup()
    await waitFor(() => expect(roomInput()).toBeEnabled())

    await user.type(roomInput(), '201')
    expect(await screen.findByText('Parking · Monthly')).toBeInTheDocument()
    expect(screen.getAllByText('฿500.00').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText(/Due date/i), { target: { value: '2026-12-05' } })
    await user.clear(screen.getByLabelText(/Electric/i))
    await user.type(screen.getByLabelText(/Electric/i), '100')
    await user.clear(screen.getByLabelText(/Water/i))
    await user.type(screen.getByLabelText(/Water/i), '10')
    await user.click(screen.getByRole('button', { name: 'Create Bill' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ leaseId: kenji.id, dueDate: '2026-12-05' }))
    expect(onClose).toHaveBeenCalled()
  })
})
