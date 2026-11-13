import { describe, expect, it } from 'vitest'
import type { ApartmentConfig, Lease, LeaseExtraCharge } from '../api/types'
import { previewBill } from './billing'
import { billedChargeIds, dueExtraCharges } from './extraCharge'

/*
  PH2-06 / SSK-165 S2: a charge added to one unit must never show up on another
  unit's bill, and S4: several charges on one unit must all be billed.

  Where that is actually decided is worth writing down, because it is not in
  this module. `LeaseExtraCharge` is `Omit<RoomExtraCharge, 'id' | 'roomId'>`,
  so the copy a contract carries has no room identity left on it at all.
  dueExtraCharges can only bill what it is handed, and the room filter happens
  once, when a contract is signed and the room's active charges are copied onto
  it.

  So these cases prove the half that lives in the frontend: a bill is built
  from its own contract's list and from nothing else, and a list with several
  charges bills all of them. The other half — that the copy step picks the
  right room — sits in the backend that does not exist yet, and the mock does
  it with `filter((c) => c.roomId === room.id && c.active)`.
*/

const CONFIG: ApartmentConfig = {
  electricRatePerUnit: 8,
  waterRatePerUnit: 18,
  commonAreaFee: 300,
  internetFee: 200,
  updatedAt: '2026-01-01T00:00:00Z',
}

const ELECTRIC_UNITS = 100
const WATER_UNITS = 10
/** rent 5000 + common 300 + internet 200 + 100x8 + 10x18 */
const BASE_TOTAL = 6480

function charge(over: Partial<LeaseExtraCharge> = {}): LeaseExtraCharge {
  return {
    chargeId: 1,
    label: 'Parking',
    amount: 500,
    recurrence: 'MONTHLY',
    startMonth: '2026-01',
    endMonth: null,
    active: true,
    ...over,
  }
}

function lease(over: Partial<Lease> = {}): Lease {
  return {
    id: 1,
    roomId: 1,
    roomNumber: '101',
    tenantId: 1,
    tenantName: 'Kant S.',
    startDate: '2026-01-01',
    endDate: null,
    monthlyRent: 5000,
    billingCycle: 'MONTHLY',
    status: 'ACTIVE',
    ...over,
  }
}

/** The bill a room would get this month, the same way CreatePaymentDialog builds it. */
function billFor(l: Lease, month: string, earlierReceipts: { items: { chargeId?: number | null }[] }[] = []) {
  const extras = dueExtraCharges(l.extraCharges, month, billedChargeIds(earlierReceipts))
  return previewBill(l, CONFIG, ELECTRIC_UNITS, WATER_UNITS, extras)
}

function labels(bill: { lines: { item: string }[] }) {
  return bill.lines.map((line) => line.item)
}

describe('PH2-06 S2 · a charge stays on the unit it belongs to', () => {
  it('bills the neighbour nothing extra when only one unit has a charge', () => {
    const withCharge = lease({ id: 1, roomNumber: '101', extraCharges: [charge({ label: 'Parking bay 3' })] })
    const without = lease({ id: 2, roomId: 2, roomNumber: '102', tenantId: 2, extraCharges: [] })

    const a = billFor(withCharge, '2026-03')
    const b = billFor(without, '2026-03')

    expect(labels(a)).toContain('Parking bay 3')
    expect(labels(b)).not.toContain('Parking bay 3')
    expect(a.total).toBe(BASE_TOTAL + 500)
    expect(b.total).toBe(BASE_TOTAL)
  })

  it('keeps two units apart when each has its own charges in the same month', () => {
    const a = lease({ id: 1, roomNumber: '101', extraCharges: [charge({ chargeId: 11, label: 'Parking', amount: 500 })] })
    const b = lease({
      id: 2,
      roomId: 2,
      roomNumber: '102',
      tenantId: 2,
      extraCharges: [charge({ chargeId: 22, label: 'Furniture rental', amount: 800 })],
    })

    const billA = billFor(a, '2026-03')
    const billB = billFor(b, '2026-03')

    expect(labels(billA)).toContain('Parking')
    expect(labels(billA)).not.toContain('Furniture rental')
    expect(labels(billB)).toContain('Furniture rental')
    expect(labels(billB)).not.toContain('Parking')
    expect(billA.total).toBe(BASE_TOTAL + 500)
    expect(billB.total).toBe(BASE_TOTAL + 800)
  })

  it('bills nothing extra to a contract that carries no charges at all', () => {
    // extraCharges is optional on Lease, so an older contract arrives with the
    // field missing rather than empty. That must bill the same as empty.
    const missing = lease({ extraCharges: undefined })
    const empty = lease({ extraCharges: [] })

    expect(billFor(missing, '2026-03').total).toBe(BASE_TOTAL)
    expect(billFor(empty, '2026-03').total).toBe(BASE_TOTAL)
    expect(labels(billFor(missing, '2026-03'))).toHaveLength(5)
  })

  it('does not let a neighbour’s earlier bill cancel this unit’s one-time charge', () => {
    // A one-time charge is suppressed by chargeId. Ids are unique across the
    // whole building, so receipts from another contract must not match.
    const mine = lease({ extraCharges: [charge({ chargeId: 11, recurrence: 'ONE_TIME', label: 'Key deposit' })] })
    const neighbourReceipts = [{ items: [{ chargeId: 22 }, { chargeId: 33 }] }]

    const bill = billFor(mine, '2026-03', neighbourReceipts)

    expect(labels(bill)).toContain('Key deposit')
  })
})

describe('PH2-06 S4 · several charges on one unit', () => {
  it('bills every charge the contract carries and adds them all to the total', () => {
    const l = lease({
      extraCharges: [
        charge({ chargeId: 11, label: 'Parking', amount: 500 }),
        charge({ chargeId: 12, label: 'Furniture rental', amount: 800 }),
        charge({ chargeId: 13, label: 'Pet fee', amount: 250 }),
      ],
    })

    const bill = billFor(l, '2026-03')

    expect(labels(bill).slice(5)).toEqual(['Parking', 'Furniture rental', 'Pet fee'])
    expect(bill.total).toBe(BASE_TOTAL + 500 + 800 + 250)
  })

  it('bills a monthly and a one-time charge together the first month, then only the monthly', () => {
    const l = lease({
      extraCharges: [
        charge({ chargeId: 11, label: 'Parking', amount: 500 }),
        charge({ chargeId: 12, label: 'Key deposit', amount: 1000, recurrence: 'ONE_TIME' }),
      ],
    })

    const first = billFor(l, '2026-03')
    expect(labels(first).slice(5)).toEqual(['Parking', 'Key deposit'])
    expect(first.total).toBe(BASE_TOTAL + 1500)

    // The second month is billed with the first month's receipt in hand.
    const second = billFor(l, '2026-04', [{ items: [{ chargeId: 12 }] }])
    expect(labels(second).slice(5)).toEqual(['Parking'])
    expect(second.total).toBe(BASE_TOTAL + 500)
  })

  it('drops only the charge that was switched off and keeps the rest', () => {
    // PH2-06 S3 from the other side: deactivating one must not disturb the
    // others on the same unit.
    const l = lease({
      extraCharges: [
        charge({ chargeId: 11, label: 'Parking', amount: 500 }),
        charge({ chargeId: 12, label: 'Furniture rental', amount: 800, active: false }),
      ],
    })

    const bill = billFor(l, '2026-03')

    expect(labels(bill)).toContain('Parking')
    expect(labels(bill)).not.toContain('Furniture rental')
    expect(bill.total).toBe(BASE_TOTAL + 500)
  })
})

describe('dueExtraCharges · which months a charge belongs to', () => {
  it('waits until the month it starts', () => {
    const c = charge({ startMonth: '2026-05' })

    expect(dueExtraCharges([c], '2026-04', new Set())).toHaveLength(0)
    expect(dueExtraCharges([c], '2026-05', new Set())).toHaveLength(1)
  })

  it('still bills in its last month and stops after it', () => {
    // endMonth is inclusive, so the boundary month belongs to the landlord.
    const c = charge({ startMonth: '2026-01', endMonth: '2026-06' })

    expect(dueExtraCharges([c], '2026-06', new Set())).toHaveLength(1)
    expect(dueExtraCharges([c], '2026-07', new Set())).toHaveLength(0)
  })

  it('bills a monthly charge with no end month for as long as the contract runs', () => {
    const c = charge({ startMonth: '2026-01', endMonth: null })

    expect(dueExtraCharges([c], '2027-11', new Set())).toHaveLength(1)
  })

  it('ignores an end month on a one-time charge and relies on the billed ids', () => {
    // A one-time charge takes the ONE_TIME branch before endMonth is read, so
    // an end month in the past must not quietly cancel it.
    const c = charge({ chargeId: 11, recurrence: 'ONE_TIME', startMonth: '2026-01', endMonth: '2026-02' })

    expect(dueExtraCharges([c], '2026-09', new Set())).toHaveLength(1)
    expect(dueExtraCharges([c], '2026-09', new Set([11]))).toHaveLength(0)
  })
})
