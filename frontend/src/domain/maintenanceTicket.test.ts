import { describe, expect, it } from 'vitest'
import { NOTES_MAX_LENGTH, type CreateMaintenanceDraft, validateCreateMaintenance } from './maintenanceTicket'

function draft(overrides: Partial<CreateMaintenanceDraft> = {}): CreateMaintenanceDraft {
  return {
    roomNumber: '101',
    maintenanceType: 'Plumbing',
    availability: 'AVAILABLE',
    billToTenant: false,
    amount: 0,
    recurring: false,
    nextDate: '',
    repeatEvery: '',
    notes: '',
    ...overrides,
  }
}

describe('validateCreateMaintenance', () => {
  it('accepts a basic ticket without optional billing, recurrence, or notes', () => {
    expect(validateCreateMaintenance(draft())).toBeNull()
  })

  it('requires a room and maintenance type in that order', () => {
    expect(validateCreateMaintenance(draft({ roomNumber: '', maintenanceType: '' }))).toBe('Please select a room')
    expect(validateCreateMaintenance(draft({ maintenanceType: '' }))).toBe('Please choose what needs to be fixed')
  })

  it('requires a finite positive amount only when billing the tenant is selected', () => {
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateCreateMaintenance(draft({ billToTenant: true, amount }))).toBe(
        'The amount billed to the tenant must be greater than 0',
      )
    }
    expect(validateCreateMaintenance(draft({ billToTenant: true, amount: 250 }))).toBeNull()
    expect(validateCreateMaintenance(draft({ billToTenant: false, amount: 0 }))).toBeNull()
  })

  it('requires both the next date and interval when recurrence is selected', () => {
    expect(validateCreateMaintenance(draft({ recurring: true }))).toBe('Please choose the next maintenance date')
    expect(validateCreateMaintenance(draft({ recurring: true, nextDate: '2026-10-15' }))).toBe(
      'Please choose how often this repeats',
    )
    expect(validateCreateMaintenance(draft({ recurring: true, nextDate: '2026-10-15', repeatEvery: 'Monthly' }))).toBeNull()
  })

  it('accepts notes at the limit but rejects notes beyond it', () => {
    expect(validateCreateMaintenance(draft({ notes: 'x'.repeat(NOTES_MAX_LENGTH) }))).toBeNull()
    expect(validateCreateMaintenance(draft({ notes: 'x'.repeat(NOTES_MAX_LENGTH + 1) }))).toBe(
      `Notes cannot be longer than ${NOTES_MAX_LENGTH} characters`,
    )
  })
})
