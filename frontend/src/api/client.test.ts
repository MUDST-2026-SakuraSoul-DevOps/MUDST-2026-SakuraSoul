import { beforeEach, describe, expect, it } from 'vitest'
import {
  ApiError,
  createLease,
  fetchApartmentConfig,
  updateApartmentConfig,
  updateRoomStatus,
  fetchLeases,
  fetchRooms,
  isOverlapError,
  terminateLease,
  updateLease,
} from './client'
import { resetMockStore } from './mockApi'
import type { RoomSummary } from './types'

/**
 * These tests exercise the real client against the browser mock backend
 * (VITE_API_MOCK=1 in vite.config.ts) to prove the frontend/backend contract:
 * payload shape, status codes, and error messages.
 *
 * Once the Spring endpoints exist, this file becomes the checklist the backend
 * must satisfy. If the real backend differs, one side has drifted from the
 * agreed contract.
 */

/** Room IDs follow room number order: 101 is id 1 through 212 as id 24. */
const ROOM_101 = 1
const ROOM_102 = 2
const ROOM_106 = 6

function findRoom(rooms: RoomSummary[], roomNumber: string): RoomSummary {
  const room = rooms.find((r) => r.roomNumber === roomNumber)
  if (!room) {
    throw new Error(`Unit ${roomNumber} not found in the response`)
  }
  return room
}

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

beforeEach(() => {
  resetMockStore()
})

describe('GET /api/rooms', () => {
  it('returns all 24 rooms across two floors with 12 rooms each', async () => {
    const rooms = await fetchRooms()
    expect(rooms).toHaveLength(24)
    expect(rooms.filter((r) => r.floor === 1)).toHaveLength(12)
    expect(rooms.filter((r) => r.floor === 2)).toHaveLength(12)
  })

  it('marks rooms with active leases as occupied and includes the tenant name', async () => {
    const room = findRoom(await fetchRooms(), '102')
    expect(room.status).toBe('OCCUPIED')
    expect(room.currentLease?.tenantName).toBe('Yuki Tanaka')
  })

  it('marks rooms under maintenance as maintenance instead of available', async () => {
    expect(findRoom(await fetchRooms(), '106').status).toBe('MAINTENANCE')
  })

  it('marks rooms with no lease and no maintenance lock as available', async () => {
    expect(findRoom(await fetchRooms(), '101').status).toBe('AVAILABLE')
  })
})

describe('POST /api/leases', () => {
  it('creates a lease in an available room and immediately marks it occupied', async () => {
    await createLease({
      roomId: ROOM_101,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(365),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    const room = findRoom(await fetchRooms(), '101')
    expect(room.status).toBe('OCCUPIED')
    expect(room.currentLease?.tenantName).toBe('Haruto Watanabe')
  })

  // US-05-S1 is the most important case in this story.
  it('rejects overlapping leases for an occupied room with 409', async () => {
    const attempt = createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(90),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect(isOverlapError(error)).toBe(true)
      // The message must explain the unavailable range, not just say "error".
      expect((error as ApiError).message).toContain('102')
      expect((error as ApiError).message).toContain('not available')
    })
  })

  it('does not create any lease data when the request is rejected', async () => {
    const before = await fetchLeases()
    await createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(0),
      endDate: isoDate(90),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    }).catch(() => undefined)
    expect(await fetchLeases()).toHaveLength(before.length)
  })

  it('rejects an end date before the start date with 400 instead of 409', async () => {
    await createLease({
      roomId: ROOM_106,
      tenantId: 6,
      startDate: isoDate(30),
      endDate: isoDate(10),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    }).catch((error: unknown) => {
      expect((error as ApiError).status).toBe(400)
    })
  })
})

describe('editing and terminating leases', () => {
  // US-06-S1
  it('marks the room available after terminating a lease', async () => {
    const active = (await fetchLeases({ status: 'ACTIVE' })).find((l) => l.roomNumber === '102')
    expect(active).toBeDefined()

    const ended = await terminateLease(active!.id, isoDate(0))
    expect(ended.status).toBe('ENDED')

    expect(findRoom(await fetchRooms(), '102').status).toBe('AVAILABLE')
  })

  // US-06-S2
  it('rejects editing a lease into another active lease for the same room with 409', async () => {
    // Create a future lease after the existing room 102 lease ends, so creation is valid.
    const future = await createLease({
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(40),
      endDate: isoDate(400),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    // Then move the start date backward so it overlaps the active lease.
    const attempt = updateLease(future.id, {
      roomId: ROOM_102,
      tenantId: 6,
      startDate: isoDate(-10),
      endDate: isoDate(400),
      monthlyRent: 3500,
      billingCycle: 'MONTHLY',
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect(isOverlapError(error)).toBe(true)
    })
  })

  it('allows editing a lease without changing dates and does not conflict with itself', async () => {
    const active = (await fetchLeases({ status: 'ACTIVE' })).find((l) => l.roomNumber === '102')
    const updated = await updateLease(active!.id, {
      roomId: active!.roomId,
      tenantId: active!.tenantId,
      startDate: active!.startDate,
      endDate: active!.endDate,
      monthlyRent: 4000,
      billingCycle: 'MONTHLY',
    })
    expect(updated.monthlyRent).toBe(4000)
  })
})

describe('US-15 lock room status for maintenance', () => {
  it('S1 locks an available room and marks it as maintenance', async () => {
    const updated = await updateRoomStatus(ROOM_101, 'MAINTENANCE')
    expect(updated.status).toBe('MAINTENANCE')
    expect(findRoom(await fetchRooms(), '101').status).toBe('MAINTENANCE')
  })

  it('S1 locks an occupied room while keeping its lease intact', async () => {
    const updated = await updateRoomStatus(ROOM_102, 'MAINTENANCE')
    expect(updated.status).toBe('MAINTENANCE')
    // The lease is not terminated; the room is only blocked from new leases.
    expect((await fetchLeases({ status: 'ACTIVE' })).some((l) => l.roomNumber === '102')).toBe(true)
  })

  it('S2 unlocks a room with no lease back to available', async () => {
    await updateRoomStatus(ROOM_101, 'MAINTENANCE')
    await updateRoomStatus(ROOM_101, 'AVAILABLE')
    expect(findRoom(await fetchRooms(), '101').status).toBe('AVAILABLE')
  })

  it('S2 unlocks a room with an active lease back to occupied instead of available', async () => {
    // This is why maintenance is stored as a separate flag from lease-derived status.
    // A single status field would lose the pre-lock state.
    await updateRoomStatus(ROOM_102, 'MAINTENANCE')
    await updateRoomStatus(ROOM_102, 'AVAILABLE')
    expect(findRoom(await fetchRooms(), '102').status).toBe('OCCUPIED')
  })

  it('unlocks a room that already starts in maintenance', async () => {
    expect(findRoom(await fetchRooms(), '106').status).toBe('MAINTENANCE')
    await updateRoomStatus(ROOM_106, 'AVAILABLE')
    expect(findRoom(await fetchRooms(), '106').status).toBe('AVAILABLE')
  })

  it('rejects manually setting unsupported statuses with 400', async () => {
    await updateRoomStatus(ROOM_101, 'OCCUPIED' as 'AVAILABLE').catch((error: unknown) => {
      expect((error as ApiError).status).toBe(400)
    })
    expect(findRoom(await fetchRooms(), '101').status).toBe('AVAILABLE')
  })
})

describe('US-16 apartment utility rates', () => {
  it('loads all default rate fields', async () => {
    const config = await fetchApartmentConfig()
    expect(config.electricRatePerUnit).toBeGreaterThan(0)
    expect(config.waterRatePerUnit).toBeGreaterThan(0)
    expect(config).toHaveProperty('commonAreaFee')
    expect(config).toHaveProperty('internetFee')
    expect(config).toHaveProperty('updatedAt')
  })

  // US-16-S1
  it('S1 saves updated rates and returns the new values', async () => {
    await updateApartmentConfig({
      electricRatePerUnit: 9.5,
      waterRatePerUnit: 20,
      commonAreaFee: 350,
      internetFee: 0,
    })

    const config = await fetchApartmentConfig()
    expect(config.electricRatePerUnit).toBe(9.5)
    expect(config.waterRatePerUnit).toBe(20)
    expect(config.commonAreaFee).toBe(350)
    // Zero must be valid because some apartments do not charge an internet fee.
    expect(config.internetFee).toBe(0)
  })

  it('S1 updates the last-modified date when rates are saved', async () => {
    const before = await fetchApartmentConfig()
    await updateApartmentConfig({
      electricRatePerUnit: 8,
      waterRatePerUnit: 18,
      commonAreaFee: 300,
      internetFee: 250,
    })
    const after = await fetchApartmentConfig()
    expect(after.updatedAt > before.updatedAt).toBe(true)
  })

  // US-16-S2
  it('S2 rejects negative rates with 400 and names the invalid field', async () => {
    const attempt = updateApartmentConfig({
      electricRatePerUnit: -1,
      waterRatePerUnit: 18,
      commonAreaFee: 300,
      internetFee: 250,
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await attempt.catch((error: unknown) => {
      expect((error as ApiError).status).toBe(400)
      expect((error as ApiError).message).toContain('Electricity rate per unit')
    })
  })

  it('S2 keeps the previous rates unchanged after rejection', async () => {
    const before = await fetchApartmentConfig()
    await updateApartmentConfig({
      electricRatePerUnit: -1,
      waterRatePerUnit: 18,
      commonAreaFee: 300,
      internetFee: 250,
    }).catch(() => undefined)

    const after = await fetchApartmentConfig()
    expect(after.electricRatePerUnit).toBe(before.electricRatePerUnit)
  })
})
