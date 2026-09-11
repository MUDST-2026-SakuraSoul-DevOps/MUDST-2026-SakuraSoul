import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchRoom, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { RoomSummary } from '../api/types'
import { RoomStatusDialog } from './RoomStatusDialog'

/**
 * These tests cover two QA requests from the SSK-21 review.
 *
 * First: verify that Finish Maintenance does not turn an occupied room into an
 * available room. If it did, the system could double-book a room, breaking the
 * critical US-05 requirement.
 *
 * Second: this dialog had no tests even though it has two logic paths and
 * affects US-05.
 *
 * The mock is a good fit here because it stores underMaintenance as a separate
 * flag instead of overwriting lease-derived status. This matches the backend
 * contract in docs/api-contract-lease.md, where under_maintenance must be a
 * separate column rather than a single status field.
 */

async function roomByNumber(roomNumber: string): Promise<RoomSummary> {
  const rooms = await fetchRooms()
  const room = rooms.find((r) => r.roomNumber === roomNumber)
  if (!room) {
    throw new Error(`Unit ${roomNumber} not found in the mock`)
  }
  return room
}

function noop() {}

beforeEach(() => {
  resetMockStore()
})

describe('lock room for maintenance (US-15-S1)', () => {
  it('changes an available room to maintenance when Set to Maintenance is clicked', async () => {
    const user = userEvent.setup()
    const room = await roomByNumber('101')
    expect(room.status).toBe('AVAILABLE')

    render(<RoomStatusDialog room={room} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: 'Set to Maintenance' }))

    expect((await fetchRoom(room.id)).status).toBe('MAINTENANCE')
  })

  it('allows locking an occupied room as required by the story', async () => {
    const user = userEvent.setup()
    const room = await roomByNumber('102')
    expect(room.status).toBe('OCCUPIED')

    render(<RoomStatusDialog room={room} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: 'Set to Maintenance' }))

    expect((await fetchRoom(room.id)).status).toBe('MAINTENANCE')
  })
})

describe('Finish Maintenance (US-15-S2)', () => {
  it('returns a room without a lease to available', async () => {
    const user = userEvent.setup()
    const locked = await roomByNumber('106')
    expect(locked.status).toBe('MAINTENANCE')

    render(<RoomStatusDialog room={locked} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: /Finish Maintenance/ }))

    expect((await fetchRoom(locked.id)).status).toBe('AVAILABLE')
  })

  it('returns a room with an active lease to occupied instead of available', async () => {
    const user = userEvent.setup()

    // Lock a room with an active lease first, then unlock it as QA requested.
    const occupied = await roomByNumber('102')
    const first = render(<RoomStatusDialog room={occupied} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: 'Set to Maintenance' }))
    // Unmount the first dialog so duplicate buttons with the same label do not remain.
    first.unmount()

    const locked = await fetchRoom(occupied.id)
    expect(locked.status).toBe('MAINTENANCE')

    render(<RoomStatusDialog room={locked} onClose={noop} onChanged={noop} />)
    await user.click(screen.getByRole('button', { name: /Finish Maintenance/ }))

    const after = await fetchRoom(occupied.id)
    expect(after.status).toBe('OCCUPIED')
    expect(after.currentLease?.tenantName).toBe('Yuki Tanaka')
  })
})
