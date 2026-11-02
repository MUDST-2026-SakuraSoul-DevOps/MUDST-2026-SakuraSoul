import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LAYOUT,
  getApartmentLayout,
  saveApartmentLayout,
  getRoomRates,
  addRoomRate,
  resetRoomRates,
  getExtraCharges,
  addExtraCharge,
  deleteExtraCharge,
  resetExtraCharges,
  parseUsageCsv,
  sampleUsageCsv,
  getImportedUsage,
  saveImportedUsage,
  resetImportedUsage,
} from './unitsPhase2'

describe('Units Phase 2 domain (SSK-160, 162, 165, 166, 167)', () => {
  beforeEach(() => {
    resetRoomRates()
    resetExtraCharges()
    resetImportedUsage()
  })

  // SSK-160: Configurable Apartment Layout
  describe('SSK-160: Apartment Layout Config', () => {
    it('returns default layout initially', () => {
      expect(getApartmentLayout()).toEqual(DEFAULT_LAYOUT)
    })

    it('saves and calculates total units accurately', () => {
      const saved = saveApartmentLayout(3, 10)
      expect(saved.floors).toBe(3)
      expect(saved.roomsPerFloor).toBe(10)
      expect(saved.totalRooms).toBe(30)
      expect(getApartmentLayout().totalRooms).toBe(30)
    })
  })

  // SSK-162: Room Rate History
  describe('SSK-162: Room Rate History', () => {
    it('returns initial rates and filters by room', () => {
      const allRates = getRoomRates()
      expect(allRates.length).toBeGreaterThan(0)

      const room101Rates = getRoomRates('101')
      expect(room101Rates.every(r => r.roomNumber === '101')).toBe(true)
      expect(room101Rates.length).toBeGreaterThanOrEqual(2)
    })

    it('schedules a new rate and sorts chronologically', () => {
      const newRate = addRoomRate({
        roomNumber: '101',
        effectiveDate: '2026-12-01',
        monthlyRent: 4800,
        waterRate: 18,
        electricityRate: 5,
        note: 'Scheduled 2027 increase',
      })
      expect(newRate.id).toBeDefined()
      const room101 = getRoomRates('101')
      expect(room101[0].monthlyRent).toBe(4800)
      expect(room101[0].effectiveDate).toBe('2026-12-01')
    })
  })

  // SSK-165: Room Extra Charges
  describe('SSK-165: Room Extra Charges', () => {
    it('lists initial extra charges', () => {
      const charges = getExtraCharges()
      expect(charges.length).toBeGreaterThanOrEqual(3)
      expect(charges.some(c => c.name === 'Parking space')).toBe(true)
    })

    it('adds and deletes extra charges for a unit', () => {
      const added = addExtraCharge({
        roomNumber: '101',
        name: 'Storage Locker',
        amount: 250,
        cycle: 'Monthly',
        status: 'Active',
      })
      expect(added.id).toBeDefined()
      expect(getExtraCharges('101').some(c => c.name === 'Storage Locker')).toBe(true)

      const deleted = deleteExtraCharge(added.id)
      expect(deleted).toBe(true)
      expect(getExtraCharges('101').some(c => c.name === 'Storage Locker')).toBe(false)
    })
  })

  // SSK-166 & SSK-167: CSV Utilities Import & Validation
  describe('SSK-166 & SSK-167: CSV Utilities Import', () => {
    it('parses valid CSV template successfully', () => {
      const rows = parseUsageCsv(sampleUsageCsv)
      expect(rows).toHaveLength(4)
      expect(rows[0]).toEqual({ room: '101', month: '2026-11', water: 10, electricity: 124 })
    })

    it('handles quotes, BOM and decimal numbers', () => {
      const csv = '\uFEFFroom,billing_month,water_m3,electricity_kwh\r\n"101","2026-11","10.5",120.25\n'
      const rows = parseUsageCsv(csv)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toEqual({ room: '101', month: '2026-11', water: 10.5, electricity: 120.25 })
    })

    it('rejects duplicate room and billing month', () => {
      const dupCsv = sampleUsageCsv + '101,2026-11,8,110\n'
      expect(() => parseUsageCsv(dupCsv)).toThrow(/duplicate room and billing month/)
    })

    it('rejects invalid headers or unknown rooms', () => {
      expect(() => parseUsageCsv('room,month,water,elec\n101,2026-11,10,120')).toThrow(/Use the four columns/)
      expect(() => parseUsageCsv('room,billing_month,water_m3,electricity_kwh\n999,2026-11,10,120')).toThrow(/unknown room/)
      expect(() => parseUsageCsv('room,billing_month,water_m3,electricity_kwh\n101,2027-01,10,120')).toThrow(/within the year 2026/)
      expect(() => parseUsageCsv('room,billing_month,water_m3,electricity_kwh\n101,2026-11,-10,120')).toThrow(/non-negative number/)
    })

    it('saves and retrieves imported usage records', () => {
      saveImportedUsage([{ room: '101', month: '2026-11', water: 15, electricity: 140 }])
      const retrieved = getImportedUsage()
      expect(retrieved).toHaveLength(1)
      expect(retrieved[0].water).toBe(15)
    })
  })
})
