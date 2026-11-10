import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BILLING_SETTINGS,
  ROOM_CARRYOVERS,
  calculateInterest,
  computeInvoiceBalances,
  type BillingSettings,
  type PaymentRecord,
} from './paymentPhase2'

/*
  paymentPhase2.test.ts proves the happy path of the balance calculation. This
  file covers the edges that decide how much money the system says someone owes:
  overpayment, several payments on one invoice, interest that must stay off, and
  the status an invoice ends up in.

  computeInvoiceBalances takes `today` as an argument, so every case below pins
  a date instead of reading the clock.

  Two gaps found while writing this, neither of which a test can paper over:

  1. PH2-05 S1/S2 ask that the carried balance be last month's unpaid amount.
     It is not computed at all: ROOM_CARRYOVERS is a hard-coded map holding two
     rooms. The cases below pin what that constant does today, not that the
     requirement is met.
  2. PH2-05 S6 asks that an already-issued bill keep the interest it was issued
     with. lateInterest is recalculated from the current settings every time
     this function runs, so changing the rate changes bills that went out
     already. No test here asserts that behaviour is correct, because it is not.
*/

function receipt(over: Partial<Parameters<typeof computeInvoiceBalances>[0]> = {}) {
  // 103 is deliberately a room with no carryover, so most cases start clean.
  return {
    id: 1,
    totalAmount: 10000,
    status: 'PENDING' as const,
    dueDate: '2026-11-30',
    roomNumber: '103',
    ...over,
  }
}

function payment(over: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'p1',
    receiptId: 1,
    receiptNo: 'RC-2026-0001',
    roomNumber: '103',
    tenantName: 'Kant S.',
    amount: 1000,
    date: '2026-11-05',
    method: 'Cash',
    ...over,
  }
}

function settings(over: Partial<BillingSettings> = {}): BillingSettings {
  return { ...DEFAULT_BILLING_SETTINGS, ...over }
}

const BEFORE_DUE = '2026-11-10'
const AFTER_DUE = '2026-12-01'

describe('calculateInterest', () => {
  it('refuses to charge interest on nothing or on a rate that is not positive', () => {
    // PH2-05 S7: a negative rate must not turn into a credit.
    expect(calculateInterest(2000, 0)).toBe(0)
    expect(calculateInterest(2000, -1)).toBe(0)
    expect(calculateInterest(0, 5)).toBe(0)
    expect(calculateInterest(-500, 5)).toBe(0)
  })

  it('rounds to satang rather than leaving a long float', () => {
    expect(calculateInterest(1500, 1.5)).toBe(22.5)
    expect(calculateInterest(3333, 1)).toBe(33.33)
    // 1234.56 * 1.25% = 15.432, which must not reach a bill as 15.432000000001
    expect(calculateInterest(1234.56, 1.25)).toBe(15.43)
  })
})

describe('computeInvoiceBalances · what is owed', () => {
  it('owes only the current charges for a room with no carried balance', () => {
    const b = computeInvoiceBalances(receipt(), [], settings(), BEFORE_DUE)

    expect(b.carriedBalance).toBe(0)
    expect(b.lateInterest).toBe(0)
    expect(b.totalDue).toBe(10000)
    expect(b.outstanding).toBe(10000)
    expect(b.status).toBe('Pending')
  })

  it('adds the carried balance and its interest for a room that has one', () => {
    // PH2-05 S3: 2000 carried at 1% a month is 20, so 10000 + 2000 + 20.
    expect(ROOM_CARRYOVERS['101']).toBe(2000)

    const b = computeInvoiceBalances(receipt({ roomNumber: '101' }), [], settings(), BEFORE_DUE)

    expect(b.carriedBalance).toBe(2000)
    expect(b.lateInterest).toBe(20)
    expect(b.totalDue).toBe(12020)
  })

  it('keeps interest off the bill when the setting is off', () => {
    // PH2-05 S4: with interest disabled the carried amount still carries, but
    // nothing is added on top of it.
    const b = computeInvoiceBalances(
      receipt({ roomNumber: '101' }),
      [],
      settings({ interestEnabled: false }),
      BEFORE_DUE,
    )

    expect(b.carriedBalance).toBe(2000)
    expect(b.lateInterest).toBe(0)
    expect(b.totalDue).toBe(12000)
  })

  it('charges no interest when the rate is zero even with interest enabled', () => {
    const b = computeInvoiceBalances(
      receipt({ roomNumber: '202' }),
      [],
      settings({ interestRate: 0 }),
      BEFORE_DUE,
    )

    expect(b.carriedBalance).toBe(1500)
    expect(b.lateInterest).toBe(0)
    expect(b.totalDue).toBe(11500)
  })
})

describe('computeInvoiceBalances · what has been paid', () => {
  it('marks an invoice paid once the full amount is in', () => {
    const b = computeInvoiceBalances(receipt(), [payment({ amount: 10000 })], settings(), BEFORE_DUE)

    expect(b.totalPaid).toBe(10000)
    expect(b.outstanding).toBe(0)
    expect(b.status).toBe('Paid')
  })

  it('leaves the remainder outstanding after a part payment', () => {
    // PH2-04 S2.
    const b = computeInvoiceBalances(receipt(), [payment({ amount: 4300 })], settings(), BEFORE_DUE)

    expect(b.totalPaid).toBe(4300)
    expect(b.outstanding).toBe(5700)
    expect(b.status).toBe('Partially paid')
  })

  it('adds up several payments on the same invoice', () => {
    // PH2-04 S3.
    const b = computeInvoiceBalances(
      receipt(),
      [payment({ id: 'a', amount: 3000 }), payment({ id: 'b', amount: 2500 })],
      settings(),
      BEFORE_DUE,
    )

    expect(b.totalPaid).toBe(5500)
    expect(b.outstanding).toBe(4500)
    expect(b.status).toBe('Partially paid')
  })

  it('ignores payments recorded against a different invoice', () => {
    // Money paid on someone else's bill must never reduce this one.
    const b = computeInvoiceBalances(
      receipt({ id: 7 }),
      [payment({ id: 'other', receiptId: 99, amount: 9999 })],
      settings(),
      BEFORE_DUE,
    )

    expect(b.totalPaid).toBe(0)
    expect(b.outstanding).toBe(10000)
  })

  it('never reports a negative amount owed when someone pays too much', () => {
    // PH2-04 S4. An overpayment is clamped at zero, so it cannot flow into the
    // next month as a negative charge.
    const b = computeInvoiceBalances(receipt(), [payment({ amount: 12500 })], settings(), BEFORE_DUE)

    expect(b.totalPaid).toBe(12500)
    expect(b.outstanding).toBe(0)
    expect(b.outstanding).not.toBeLessThan(0)
    expect(b.status).toBe('Paid')
  })

  it('treats a receipt the backend already marked paid as settled in full', () => {
    const b = computeInvoiceBalances(receipt({ status: 'PAID' }), [], settings(), BEFORE_DUE)

    expect(b.totalPaid).toBe(10000)
    expect(b.outstanding).toBe(0)
    expect(b.status).toBe('Paid')
  })

  it('prefers the recorded payments over the paid flag once any exist', () => {
    // A PAID receipt that also carries a part payment must not be counted
    // twice, and must not be reported as settled when the record says it isn't.
    const b = computeInvoiceBalances(
      receipt({ status: 'PAID' }),
      [payment({ amount: 2000 })],
      settings(),
      BEFORE_DUE,
    )

    expect(b.totalPaid).toBe(2000)
    expect(b.outstanding).toBe(8000)
    expect(b.status).toBe('Partially paid')
  })
})

describe('computeInvoiceBalances · status', () => {
  it('is overdue once the due date has passed with nothing paid', () => {
    const b = computeInvoiceBalances(receipt(), [], settings(), AFTER_DUE)

    expect(b.status).toBe('Overdue')
  })

  it('stays partially paid rather than overdue when something was paid', () => {
    // Someone who has paid part of a late bill is in a different situation from
    // someone who has paid nothing, and the badge has to say so.
    const b = computeInvoiceBalances(receipt(), [payment({ amount: 1 })], settings(), AFTER_DUE)

    expect(b.status).toBe('Partially paid')
  })

  it('is still pending on the due date itself', () => {
    // The comparison is a plain string compare on YYYY-MM-DD, so the boundary
    // day belongs to the tenant, not to the landlord.
    const b = computeInvoiceBalances(receipt({ dueDate: '2026-11-30' }), [], settings(), '2026-11-30')

    expect(b.status).toBe('Pending')
  })
})
