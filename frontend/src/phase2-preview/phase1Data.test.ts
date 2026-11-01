import { describe, expect, it } from 'vitest'
import { contractStatus, initialContracts, initialRentals, rentalLinesForDraft } from './phase1Data'

describe('Phase 1 continuity in the Phase 2 preview', () => {
  it('includes active rentals, while excluding pending and returned requests', () => {
    expect(rentalLinesForDraft(initialRentals,'101','2026-12').map(r => r.id)).toEqual([1])
    expect(rentalLinesForDraft(initialRentals,'201','2026-12')).toEqual([])
    expect(rentalLinesForDraft(initialRentals,'102','2026-12')).toEqual([])
  })
  it('excludes a future rental until its start month', () => {
    const future = {...initialRentals[0],startDate:'2027-01-01'}
    expect(rentalLinesForDraft([future],'101','2026-12')).toEqual([])
    expect(rentalLinesForDraft([future],'101','2027-01')).toEqual([future])
  })
  it('keeps the agreed fee and does not include the security deposit in rent', () => {
    const lines = rentalLinesForDraft(initialRentals,'101','2026-12')
    expect(lines.reduce((n,r) => n+r.monthlyFee,0)).toBe(300)
    expect(lines[0].deposit).toBe(1000)
  })
  it('rejects invalid billing months and distinguishes ending-soon and future leases', () => {
    expect(rentalLinesForDraft(initialRentals,'101','2026-13')).toEqual([])
    expect(contractStatus(initialContracts[1])).toBe('Ending soon')
    expect(contractStatus({...initialContracts[0],start:'2026-12-01'})).toBe('Upcoming')
  })
})
