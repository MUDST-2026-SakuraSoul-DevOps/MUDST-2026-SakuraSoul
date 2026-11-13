import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as clientModule from '../api/client'
import { fetchLeases, fetchRooms, fetchTenants } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { Lease, RoomSummary, Tenant } from '../api/types'
import { bahtAmount, displayDate, todayInBangkok } from '../format'
import { RoomDialog } from './RoomDialog'

/*
  ป็อปอัปของการ์ดห้องบน Dashboard (US-09) ต่างกันตามสถานะห้อง
  DashboardPage.test.tsx เปิดป็อปอัปและเทสการ check in ที่ชนสัญญาเดิมไปแล้ว ไฟล์นี้เทสส่วนที่หน้านั้นไม่ได้เดิน
  - ห้องมีคนเช่า: check out จริง, check out ไม่สำเร็จ, ยกเลิก, แท็บข้อมูลสัญญา, ห้องที่ข้อมูลไม่ตรงกัน
  - ห้องว่าง: ยังไม่มีผู้เช่า, ค่าที่ส่งไปสร้างสัญญา, check in ไม่สำเร็จ, ยกเลิก
  - ห้องกำลังซ่อม: ปล่อยห้อง, ปล่อยไม่สำเร็จ, โหลดใบแจ้งซ่อมไม่ได้, ไม่มีใบแจ้งซ่อม
  ข้อมูลห้อง สัญญา และผู้เช่ามาจาก backend จำลอง ส่วนคำขอที่เปลี่ยนข้อมูลจดไว้ด้วย spy
*/

const onClose = vi.fn()
const onChanged = vi.fn()
let rooms: RoomSummary[]
let leases: Lease[]
let tenants: Tenant[]

/** ห้องใน seed ของ backend จำลอง: 102 มีคนเช่า (Yuki Tanaka), 101 ว่าง, 106 กำลังซ่อม */
function room(roomNumber: string, status: RoomSummary['status']): RoomSummary {
  const found = rooms.find((r) => r.roomNumber === roomNumber)
  if (!found || found.status !== status) {
    throw new Error(`Unit ${roomNumber} is not ${status} in the mock seed`)
  }
  return found
}

function leaseOf(r: RoomSummary): Lease {
  return leases.find((l) => l.id === r.currentLease?.id)!
}

function renderRoom(r: RoomSummary, props: { leases?: Lease[]; tenants?: Tenant[] } = {}) {
  return render(
    <RoomDialog
      room={r}
      leases={props.leases ?? leases}
      tenants={props.tenants ?? tenants}
      onClose={onClose}
      onChanged={onChanged}
    />,
  )
}

function confirmCheckOut() {
  return screen.getByRole('dialog', { name: 'Confirm Check Out' })
}

beforeEach(async () => {
  // วันนี้ตายตัว ป็อปอัปกับการตรวจผลอ่าน todayInBangkok() คนละครั้ง ถ้ารันคร่อมเที่ยงคืนจะได้คนละวัน
  // ปลอมเฉพาะ Date นาฬิกาจริงยังเดิน userEvent กับ waitFor จึงทำงานตามปกติ
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-13T05:00:00Z') })
  resetMockStore()
  onClose.mockReset()
  onChanged.mockReset()
  ;[rooms, leases, tenants] = await Promise.all([fetchRooms(), fetchLeases(), fetchTenants()])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('RoomDialog for an occupied room (check out)', () => {
  it('ends the lease today and tells the dashboard to refresh', async () => {
    const terminate = vi.spyOn(clientModule, 'terminateLease')
    const occupied = room('102', 'OCCUPIED')
    const lease = leaseOf(occupied)
    renderRoom(occupied)

    await userEvent.click(screen.getByRole('button', { name: 'Check Out' }))
    expect(confirmCheckOut()).toHaveTextContent(
      `Are you sure you want to check out ${lease.tenantName} from Room ${occupied.roomNumber}?`,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Check Out' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(terminate).toHaveBeenCalledWith(lease.id, todayInBangkok())
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('keeps the confirmation open with the reason from the API when the check-out fails', async () => {
    const terminate = vi
      .spyOn(clientModule, 'terminateLease')
      .mockRejectedValueOnce(new clientModule.ApiError(409, 'This lease has already ended'))
    renderRoom(room('102', 'OCCUPIED'))
    await userEvent.click(screen.getByRole('button', { name: 'Check Out' }))

    await userEvent.click(screen.getByRole('button', { name: 'Confirm Check Out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This lease has already ended')
    expect(confirmCheckOut()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Check Out' })).toBeEnabled()
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(onChanged).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says the check-out failed in plain words when the error is not from the API, and lets it be retried', async () => {
    const occupied = room('102', 'OCCUPIED')
    const lease = leaseOf(occupied)
    const terminate = vi
      .spyOn(clientModule, 'terminateLease')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderRoom(occupied)
    await userEvent.click(screen.getByRole('button', { name: 'Check Out' }))

    await userEvent.click(screen.getByRole('button', { name: 'Confirm Check Out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Check out failed. Please try again.')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Check Out' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(terminate).toHaveBeenNthCalledWith(2, lease.id, todayInBangkok())
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('goes back to the room without ending the lease when the check-out is cancelled', async () => {
    const terminate = vi.spyOn(clientModule, 'terminateLease')
    renderRoom(room('102', 'OCCUPIED'))

    await userEvent.click(screen.getByRole('button', { name: 'Check Out' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Confirm Check Out' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Room 102' })).toBeInTheDocument()
    expect(terminate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the lease dates, rent and deposit, with a dash for a lease without an end date', async () => {
    const occupied = room('102', 'OCCUPIED')
    const lease = { ...leaseOf(occupied), endDate: null, monthlyRent: 4200, securityDeposit: 8400 }
    renderRoom(occupied, { leases: leases.map((l) => (l.id === lease.id ? lease : l)) })

    await userEvent.click(screen.getByRole('button', { name: 'Lease Information' }))

    // แถวในแท็บไม่ได้ผูก label กับค่า จึงอ่านค่าจากช่องข้างหัวข้อ
    const value = (label: string) => screen.getByText(label).nextElementSibling
    expect(value('Check In Date')).toHaveTextContent(displayDate(lease.startDate))
    expect(value('Check Out Date')).toHaveTextContent('—')
    expect(value('Rent Amount')).toHaveTextContent(bahtAmount(4200))
    expect(value('Security Deposit')).toHaveTextContent(bahtAmount(8400))
    expect(screen.queryByText('Tenant Name')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Tenant Information' }))
    expect(value('Tenant Name')).toHaveTextContent(lease.tenantName)
  })

  // ข้อแรกเป็นตัวกันที่โค้ดเขียนไว้ตรง ๆ ข้อสองเกิดได้จริงตอนรายการสัญญายังโหลดไม่ครบ
  it.each([
    ['the room has no current lease', (r: RoomSummary) => ({ ...r, currentLease: null }), undefined],
    ['the lease of the room is not in the list', (r: RoomSummary) => r, [] as Lease[]],
  ])('says the data does not add up when %s, instead of offering a check-out', (_case, change, list) => {
    renderRoom(change(room('102', 'OCCUPIED')), { leases: list })

    expect(screen.getByText('Room status is occupied but no active lease found.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check Out' })).not.toBeInTheDocument()
  })
})

describe('RoomDialog for an available room (check in)', () => {
  it('refuses to check in before any tenant exists', async () => {
    const create = vi.spyOn(clientModule, 'createLease')
    renderRoom(room('101', 'AVAILABLE'), { tenants: [] })

    await userEvent.click(screen.getByRole('button', { name: 'Check In' }))

    expect(screen.getByRole('alert')).toHaveTextContent('No tenants available in the system. Please add a tenant first.')
    expect(screen.queryByRole('dialog', { name: 'Confirm Check In' })).not.toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('creates a monthly lease from today with the deposit the admin typed', async () => {
    const create = vi.spyOn(clientModule, 'createLease')
    const available = room('101', 'AVAILABLE')
    renderRoom(available)

    await userEvent.click(screen.getByRole('button', { name: 'Lease Information' }))
    expect(screen.getByLabelText('Security Deposit')).toHaveValue(available.baseRent * 2)
    fireEvent.change(screen.getByLabelText('Security Deposit'), { target: { value: '5000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Check In' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Check In' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      roomId: available.id,
      tenantId: tenants[0].id,
      startDate: todayInBangkok(),
      endDate: null,
      billingCycle: 'MONTHLY',
      securityDeposit: 5000,
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  // ต่างจาก check out ที่ค้างป็อปอัปยืนยันไว้ check in พาไปที่ฟอร์มเพื่อให้แก้ค่าที่ทำให้พังได้
  it('returns to the filled form with the reason when the check-in fails', async () => {
    vi.spyOn(clientModule, 'createLease').mockRejectedValueOnce(
      new clientModule.ApiError(409, 'This room already has a lease in that period'),
    )
    renderRoom(room('101', 'AVAILABLE'))
    await userEvent.click(screen.getByRole('button', { name: 'Lease Information' }))
    fireEvent.change(screen.getByLabelText('Security Deposit'), { target: { value: '6000' } })

    await userEvent.click(screen.getByRole('button', { name: 'Check In' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Check In' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This room already has a lease in that period')
    expect(screen.queryByRole('dialog', { name: 'Confirm Check In' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Security Deposit')).toHaveValue(6000)
    expect(onChanged).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('goes back to the form without creating a lease when the check-in is cancelled', async () => {
    const create = vi.spyOn(clientModule, 'createLease')
    renderRoom(room('101', 'AVAILABLE'))

    await userEvent.click(screen.getByRole('button', { name: 'Check In' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Confirm Check In' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check In' })).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('RoomDialog for a room under maintenance', () => {
  it('lists the tickets of the room and releases it back to available', async () => {
    const tickets = vi.spyOn(clientModule, 'fetchRoomMaintenance')
    const release = vi.spyOn(clientModule, 'updateRoomStatus')
    const underRepair = room('106', 'MAINTENANCE')
    renderRoom(underRepair)

    expect(await screen.findByText(/Reported/)).toBeInTheDocument()
    expect(tickets).toHaveBeenCalledWith(underRepair.id)
    await userEvent.click(screen.getByRole('button', { name: 'Release Room' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(release).toHaveBeenCalledWith(underRepair.id, 'AVAILABLE')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('keeps the room under maintenance and shows that the release failed', async () => {
    const release = vi.spyOn(clientModule, 'updateRoomStatus').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const underRepair = room('106', 'MAINTENANCE')
    renderRoom(underRepair)

    await userEvent.click(screen.getByRole('button', { name: 'Release Room' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to release room')
    expect(release).toHaveBeenCalledWith(underRepair.id, 'AVAILABLE')
    expect(screen.getByRole('button', { name: 'Release Room' })).toBeEnabled()
    expect(onChanged).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says when the maintenance records cannot be loaded', async () => {
    vi.spyOn(clientModule, 'fetchRoomMaintenance').mockRejectedValue(new clientModule.ApiError(503, 'Maintenance is offline'))
    renderRoom(room('106', 'MAINTENANCE'))

    expect(await screen.findByText('Maintenance is offline')).toBeInTheDocument()
  })

  it('says when a room under maintenance has no tickets logged', async () => {
    vi.spyOn(clientModule, 'fetchRoomMaintenance').mockResolvedValue([])
    renderRoom(room('106', 'MAINTENANCE'))

    expect(await screen.findByText('No maintenance tickets')).toBeInTheDocument()
    expect(screen.getByText('This room is under maintenance but no tickets have been logged.')).toBeInTheDocument()
  })
})
