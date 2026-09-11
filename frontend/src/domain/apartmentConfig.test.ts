import { describe, expect, it } from 'vitest'
import type { ApartmentConfigRequest } from '../api/types'
import { validateApartmentConfig } from './apartmentConfig'

/**
 * US-16-S2 invalid rates must be rejected.
 *
 * These cases are intentionally detailed because invalid rates do not fail
 * immediately. They can leak into negative receipts sent to tenants before
 * anyone notices.
 */

function config(overrides: Partial<ApartmentConfigRequest> = {}): ApartmentConfigRequest {
  return {
    electricRatePerUnit: 8,
    waterRatePerUnit: 18,
    commonAreaFee: 300,
    internetFee: 250,
    ...overrides,
  }
}

describe('validateApartmentConfig', () => {
  it('passes when all values are filled and non-negative', () => {
    expect(validateApartmentConfig(config())).toBeNull()
  })

  it('allows zero because some apartments do not charge a common area fee', () => {
    expect(validateApartmentConfig(config({ commonAreaFee: 0 }))).toBeNull()
  })

  it('rejects negative electricity rates and names the invalid field', () => {
    expect(validateApartmentConfig(config({ electricRatePerUnit: -1 }))).toBe(
      'Electricity rate per unit cannot be negative',
    )
  })

  it('rejects negative water rates', () => {
    expect(validateApartmentConfig(config({ waterRatePerUnit: -0.5 }))).toBe(
      'Water rate per unit cannot be negative',
    )
  })

  it('rejects negative common area fees', () => {
    expect(validateApartmentConfig(config({ commonAreaFee: -100 }))).toBe(
      'Common area fee cannot be negative',
    )
  })

  it('rejects negative internet fees', () => {
    expect(validateApartmentConfig(config({ internetFee: -1 }))).toBe(
      'Internet fee cannot be negative',
    )
  })

  it('rejects NaN from empty number inputs', () => {
    // Empty input type="number" fields return NaN, not zero. Without this guard,
    // NaN could be saved.
    expect(validateApartmentConfig(config({ waterRatePerUnit: Number.NaN }))).toBe(
      'Water rate per unit must be a number',
    )
  })

  it('rejects infinite values', () => {
    expect(validateApartmentConfig(config({ internetFee: Number.POSITIVE_INFINITY }))).toBe(
      'Internet fee must be a number',
    )
  })

  it('reports the first invalid field when multiple fields are invalid', () => {
    const message = validateApartmentConfig(
      config({ electricRatePerUnit: -1, internetFee: -1 }),
    )
    expect(message).toBe('Electricity rate per unit cannot be negative')
  })
})

/**
 * QA found that the old validation only checked negative and non-numeric values.
 * A typo like 9999999 for the electricity rate would pass and inflate receipts
 * without warning.
 */
describe('rate upper bounds', () => {
  it('rejects seven-digit electricity rates', () => {
    expect(validateApartmentConfig(config({ electricRatePerUnit: 9_999_999 }))).toContain(
      'Electricity rate per unit',
    )
  })

  it('rejects water rates above one thousand per unit', () => {
    expect(validateApartmentConfig(config({ waterRatePerUnit: 1_001 }))).toContain('is too high')
  })

  it('allows values exactly at the ceiling', () => {
    expect(validateApartmentConfig(config({ electricRatePerUnit: 1_000 }))).toBeNull()
    expect(validateApartmentConfig(config({ commonAreaFee: 100_000 }))).toBeNull()
  })

  it('rejects monthly common area fees above one hundred thousand', () => {
    expect(validateApartmentConfig(config({ commonAreaFee: 100_001 }))).toContain('Common area fee')
  })

  it('allows realistic rates used by the building', () => {
    expect(
      validateApartmentConfig({
        electricRatePerUnit: 8,
        waterRatePerUnit: 18,
        commonAreaFee: 300,
        internetFee: 250,
      }),
    ).toBeNull()
  })
})
