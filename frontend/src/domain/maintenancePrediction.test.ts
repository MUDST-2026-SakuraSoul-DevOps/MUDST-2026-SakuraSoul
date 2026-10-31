import { describe, expect, it } from 'vitest'
import { confidenceOf, median, predictAll, predictNext, suggestedFrequency } from './maintenancePrediction'

describe('predictNext', () => {
  // AC 1: four jobs 30, 31, 29 days apart → last + 30 days, high confidence
  it('adds the median gap to the last job', () => {
    expect(predictNext(['2026-01-01', '2026-01-31', '2026-03-03', '2026-04-01'])).toEqual({
      lastDate: '2026-04-01',
      medianIntervalDays: 30,
      predictedDate: '2026-05-01',
      confidence: 'HIGH',
      sampleSize: 4,
    })
  })

  // AC 2: fewer than 3 jobs → no prediction
  it('does not guess from fewer than three jobs', () => {
    expect(predictNext(['2026-01-01', '2026-02-01'])).toBeNull()
    // two jobs on the same day count once
    expect(predictNext(['2026-01-01', '2026-01-01T10:00:00Z', '2026-02-01'])).toBeNull()
  })

  // AC 3: gaps that swing a lot (10, 90, 15) → low confidence
  it('marks irregular gaps as low confidence', () => {
    const result = predictNext(['2026-01-01', '2026-01-11', '2026-04-11', '2026-04-26'])
    expect(result).toMatchObject({ medianIntervalDays: 15, predictedDate: '2026-05-11', confidence: 'LOW' })
  })

  it('crosses month and year boundaries', () => {
    expect(predictNext(['2025-10-01', '2025-11-30', '2026-01-29'])?.predictedDate).toBe('2026-03-30')
  })

  // AC 4: the same data always gives the same answer, whatever the input order
  it('is deterministic', () => {
    const dates = ['2026-04-01', '2026-01-01', '2026-03-03', '2026-01-31']
    expect(predictNext(dates)).toEqual(predictNext([...dates].reverse()))
  })
})

describe('helpers', () => {
  it('median and confidence bands', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(confidenceOf([90, 91, 89])).toBe('HIGH')
    expect(confidenceOf([30, 40, 30, 22])).toBe('MEDIUM')
    expect(confidenceOf([10, 90, 15])).toBe('LOW')
  })

  it('groups by unit and job type and sorts by the next date', () => {
    const jobs = [
      ...['2026-01-01', '2026-02-01', '2026-03-01'].map((date) => ({ roomId: 1, roomNumber: '101', maintenanceType: 'Plumbing', date })),
      ...['2026-01-01', '2026-01-11', '2026-01-21'].map((date) => ({ roomId: 2, roomNumber: '102', maintenanceType: 'Plumbing', date })),
      { roomId: 1, roomNumber: '101', maintenanceType: 'Electrical', date: '2026-01-05' },
    ]
    expect(predictAll(jobs).map((p) => `${p.roomNumber} ${p.maintenanceType} ${p.predictedDate}`)).toEqual([
      '102 Plumbing 2026-01-31',
      '101 Plumbing 2026-03-31',
    ])
  })

  it('picks the closest reminder frequency', () => {
    expect(suggestedFrequency(30)).toBe('Monthly')
    expect(suggestedFrequency(90)).toBe('Quarterly')
    expect(suggestedFrequency(365)).toBe('Annual')
  })
})
