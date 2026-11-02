import { useState, useEffect } from 'react'
import { todayInBangkok } from '../format'

// ----------------------------------------------------
// SSK-160: Configurable Apartment Layout
// ----------------------------------------------------
export interface ApartmentLayoutConfig {
  floors: number
  roomsPerFloor: number
  totalRooms: number
}

export const DEFAULT_LAYOUT: ApartmentLayoutConfig = {
  floors: 2,
  roomsPerFloor: 12,
  totalRooms: 24,
}

const LAYOUT_KEY = 'sakura_apartment_layout'
const LAYOUT_EVENT = 'sakura_layout_updated'

export function getApartmentLayout(): ApartmentLayoutConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_LAYOUT }
  }
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT }
    const parsed = JSON.parse(raw)
    return {
      floors: Number(parsed.floors) || DEFAULT_LAYOUT.floors,
      roomsPerFloor: Number(parsed.roomsPerFloor) || DEFAULT_LAYOUT.roomsPerFloor,
      totalRooms: (Number(parsed.floors) || DEFAULT_LAYOUT.floors) * (Number(parsed.roomsPerFloor) || DEFAULT_LAYOUT.roomsPerFloor),
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function saveApartmentLayout(floors: number, roomsPerFloor: number): ApartmentLayoutConfig {
  const config: ApartmentLayoutConfig = {
    floors,
    roomsPerFloor,
    totalRooms: floors * roomsPerFloor,
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(config))
      window.dispatchEvent(new Event(LAYOUT_EVENT))
    } catch {
      // ignore
    }
  }
  return config
}

export function resetApartmentLayout(): ApartmentLayoutConfig {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(LAYOUT_KEY)
      window.dispatchEvent(new Event(LAYOUT_EVENT))
    } catch {
      // ignore
    }
  }
  return { ...DEFAULT_LAYOUT }
}

// ----------------------------------------------------
// SSK-162: Room Rate History
// ----------------------------------------------------
export interface RoomRateRecord {
  id: string
  roomNumber: string
  effectiveDate: string
  monthlyRent: number
  waterRate: number
  electricityRate: number
  note: string
}

export const INITIAL_ROOM_RATES: RoomRateRecord[] = [
  { id: 'RR-101-2', roomNumber: '101', effectiveDate: '2026-11-01', monthlyRent: 4500, waterRate: 18, electricityRate: 5, note: 'New monthly rate' },
  { id: 'RR-101-1', roomNumber: '101', effectiveDate: '2026-01-01', monthlyRent: 4000, waterRate: 18, electricityRate: 5, note: 'Original contract rate' },
  { id: 'RR-102-1', roomNumber: '102', effectiveDate: '2026-02-01', monthlyRent: 4700, waterRate: 18, electricityRate: 5, note: 'Contract renewal rate' },
  { id: 'RR-201-1', roomNumber: '201', effectiveDate: '2026-05-01', monthlyRent: 4800, waterRate: 18, electricityRate: 5, note: 'Standard single rate' },
  { id: 'RR-202-1', roomNumber: '202', effectiveDate: '2026-03-01', monthlyRent: 5000, waterRate: 18, electricityRate: 5, note: 'Standard double rate' },
]

const RATES_KEY = 'sakura_room_rates'
const RATES_EVENT = 'sakura_rates_updated'

export function getRoomRates(roomNumber?: string): RoomRateRecord[] {
  let list = INITIAL_ROOM_RATES
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(RATES_KEY)
      if (raw) list = JSON.parse(raw)
    } catch {
      list = INITIAL_ROOM_RATES
    }
  }
  if (roomNumber && roomNumber !== 'ALL') {
    return list.filter(r => r.roomNumber === roomNumber)
  }
  return list
}

export function addRoomRate(rate: Omit<RoomRateRecord, 'id'>): RoomRateRecord {
  const current = getRoomRates()
  const newRate: RoomRateRecord = {
    ...rate,
    id: `RR-${rate.roomNumber}-${Date.now()}`,
  }
  const updated = [newRate, ...current].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(RATES_KEY, JSON.stringify(updated))
      window.dispatchEvent(new Event(RATES_EVENT))
    } catch {
      // ignore
    }
  }
  return newRate
}

export function resetRoomRates(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(RATES_KEY)
    window.dispatchEvent(new Event(RATES_EVENT))
  }
}

// ----------------------------------------------------
// SSK-165: Room Extra Charges
// ----------------------------------------------------
export interface ExtraChargeRecord {
  id: string
  roomNumber: string
  name: string
  amount: number
  cycle: 'One-time' | 'Monthly'
  status: 'Active' | 'Inactive'
  date: string
}

export const INITIAL_EXTRA_CHARGES: ExtraChargeRecord[] = [
  { id: 'EC-1', roomNumber: '101', name: 'Parking space', amount: 300, cycle: 'Monthly', status: 'Active', date: '2026-11-01' },
  { id: 'EC-2', roomNumber: '102', name: 'Pet fee', amount: 500, cycle: 'Monthly', status: 'Active', date: '2026-11-01' },
  { id: 'EC-3', roomNumber: '201', name: 'Replacement key card', amount: 200, cycle: 'One-time', status: 'Active', date: '2026-10-15' },
]

const CHARGES_KEY = 'sakura_extra_charges'
const CHARGES_EVENT = 'sakura_charges_updated'

export function getExtraCharges(roomNumber?: string): ExtraChargeRecord[] {
  let list = INITIAL_EXTRA_CHARGES
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(CHARGES_KEY)
      if (raw) list = JSON.parse(raw)
    } catch {
      list = INITIAL_EXTRA_CHARGES
    }
  }
  if (roomNumber && roomNumber !== 'ALL') {
    return list.filter(c => c.roomNumber === roomNumber)
  }
  return list
}

export function addExtraCharge(charge: Omit<ExtraChargeRecord, 'id' | 'date'>): ExtraChargeRecord {
  const current = getExtraCharges()
  const newCharge: ExtraChargeRecord = {
    ...charge,
    id: `EC-${Date.now()}`,
    date: todayInBangkok(),
  }
  const updated = [newCharge, ...current]
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CHARGES_KEY, JSON.stringify(updated))
      window.dispatchEvent(new Event(CHARGES_EVENT))
    } catch {
      // ignore
    }
  }
  return newCharge
}

export function deleteExtraCharge(id: string): boolean {
  const current = getExtraCharges()
  const filtered = current.filter(c => c.id !== id)
  if (filtered.length === current.length) return false
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CHARGES_KEY, JSON.stringify(filtered))
      window.dispatchEvent(new Event(CHARGES_EVENT))
    } catch {
      // ignore
    }
  }
  return true
}

export function resetExtraCharges(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(CHARGES_KEY)
    window.dispatchEvent(new Event(CHARGES_EVENT))
  }
}

// ----------------------------------------------------
// SSK-166 & SSK-167: CSV Water & Electricity Import & Graphs
// ----------------------------------------------------
export interface UsageRow {
  room: string
  month: string // YYYY-MM
  water: number // m³
  electricity: number // kWh
}

export const sampleUsageCsv = `room,billing_month,water_m3,electricity_kwh
101,2026-11,10,124
102,2026-11,12,138
201,2026-11,9,116
202,2026-11,11,130
`

/**
 * Parses and validates CSV string according to SSK-166 rules:
 * - Four columns: room,billing_month,water_m3,electricity_kwh
 * - Handles quotes, BOM, Windows \r\n
 * - Validates room numbers
 * - Validates billing_month format (YYYY-MM)
 * - Rejects negative values or non-numbers
 * - Rejects duplicate room + month entries
 */
export function parseUsageCsv(text: string): UsageRow[] {
  const records: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell.trim())
      cell = ''
      if (c === '\n') {
        if (row.some(Boolean)) records.push(row)
        row = []
      }
    } else {
      cell += c
    }
  }
  if (quoted) throw new Error('Unclosed quote in CSV. Check the selected file.')
  row.push(cell.trim())
  if (row.some(Boolean)) records.push(row)

  const header = records.shift()?.join(',')
  if (header !== 'room,billing_month,water_m3,electricity_kwh') {
    throw new Error('Use the four columns in the downloadable template, in the same order.')
  }
  if (!records.length) {
    throw new Error('The file contains no usage rows.')
  }

  const seen = new Set<string>()
  const validRooms = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112',
                      '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212']

  return records.map((r, i) => {
    const line = i + 2
    if (r.length !== 4 || !validRooms.includes(r[0])) {
      throw new Error(`Row ${line}: unknown room or incorrect column count. Valid rooms: 101–112, 201–212.`)
    }
    if (!/^2026-(0[1-9]|1[0-2])$/.test(r[1])) {
      throw new Error(`Row ${line}: billing month must be YYYY-MM within the year 2026.`)
    }
    if (r.slice(2).some(v => !/^\d+(\.\d{1,2})?$/.test(v) || !Number.isFinite(Number(v)))) {
      throw new Error(`Row ${line}: usage must be a non-negative number with at most two decimal places.`)
    }
    const key = `${r[0]}-${r[1]}`
    if (seen.has(key)) {
      throw new Error(`Row ${line}: duplicate room and billing month. Nothing has been imported.`)
    }
    seen.add(key)
    return {
      room: r[0],
      month: r[1],
      water: Number(r[2]),
      electricity: Number(r[3]),
    }
  })
}

export function downloadCsvFile(filename: string, content: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.click()
  URL.revokeObjectURL(url)
}

// Stored Imported Usage
const USAGE_KEY = 'sakura_utility_usage'
const USAGE_EVENT = 'sakura_usage_updated'

export function getImportedUsage(): UsageRow[] {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(USAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as UsageRow[]
  } catch {
    return []
  }
}

export function saveImportedUsage(rows: UsageRow[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(rows))
    window.dispatchEvent(new Event(USAGE_EVENT))
  } catch {
    // ignore
  }
}

export function resetImportedUsage(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(USAGE_KEY)
    window.dispatchEvent(new Event(USAGE_EVENT))
  }
}

export function useApartmentLayout(): [ApartmentLayoutConfig, (floors: number, rooms: number) => void] {
  const [layout, setLayout] = useState<ApartmentLayoutConfig>(getApartmentLayout)
  useEffect(() => {
    function update() { setLayout(getApartmentLayout()) }
    window.addEventListener(LAYOUT_EVENT, update)
    return () => window.removeEventListener(LAYOUT_EVENT, update)
  }, [])
  return [layout, (f, r) => setLayout(saveApartmentLayout(f, r))]
}
