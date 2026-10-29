import type { CatalogItem, RentalRequest } from '../domain/appliance'

export type PreviewContract = { id: string; room: string; tenant: string; start: string; end: string; rent: number; deposit: number }
export type PreviewDocument = { id: number; name: string; category: string; unit: string; tenant: string; date: string; file?: File }
export const initialContracts: PreviewContract[] = [
  { id: 'LS-101', room: '101', tenant: 'Kant S.', start: '2026-01-01', end: '2027-01-31', rent: 4500, deposit: 9000 },
  { id: 'LS-102', room: '102', tenant: 'Mali P.', start: '2026-02-01', end: '2026-11-30', rent: 4700, deposit: 9400 },
  { id: 'LS-201', room: '201', tenant: 'Narin K.', start: '2026-05-01', end: '2027-04-30', rent: 4800, deposit: 9600 },
  { id: 'LS-202', room: '202', tenant: 'Pim W.', start: '2026-03-01', end: '2027-02-28', rent: 5000, deposit: 10000 },
]
export const initialDocuments: PreviewDocument[] = [
  { id: 1, name: 'Lease agreement · Kant S.', category: 'Contract', unit: '101', tenant: 'Kant S.', date: '01 Jan 2026' },
  { id: 2, name: 'Air conditioner service report', category: 'Maintenance report', unit: '101', tenant: 'Kant S.', date: '09 Aug 2026' },
  { id: 3, name: 'Payment receipt · November', category: 'Receipt', unit: '102', tenant: 'Mali P.', date: '04 Nov 2026' },
]
export const initialCatalog: CatalogItem[] = [
  { id: 1, name: 'Refrigerator 5.9 cu.ft', sku: 'AP-001', category: 'Kitchen', monthlyFee: 300, deposit: 1000, owned: 7, lowStockAt: 2 },
  { id: 2, name: 'Washing Machine 7 kg', sku: 'AP-004', category: 'Laundry', monthlyFee: 450, deposit: 1500, owned: 2, lowStockAt: 1 },
  { id: 3, name: 'Microwave Oven 20 L', sku: 'AP-007', category: 'Kitchen', monthlyFee: 150, deposit: 500, owned: 9, lowStockAt: 2 },
]
export const initialRentals: RentalRequest[] = [
  { id: 1, room: '101', sku: 'AP-001', monthlyFee: 300, deposit: 1000, startDate: '2026-11-06', status: 'Active' },
  { id: 2, room: '201', sku: 'AP-004', monthlyFee: 450, deposit: 1500, startDate: '2026-12-01', status: 'Pending' },
  { id: 3, room: '102', sku: 'AP-007', monthlyFee: 150, deposit: 500, startDate: '2026-08-01', status: 'Returned' },
]
export const previewRoomNumbers = Array.from({ length: 24 }, (_, i) => `${Math.floor(i / 12) + 1}${String(i % 12 + 1).padStart(2, '0')}`)

export function contractStatus(c: PreviewContract) {
  const today = '2026-11-01'
  if (c.end && c.end < today) return 'Ended'
  if (c.start > today) return 'Upcoming'
  if (c.end && (Date.parse(c.end) - Date.parse(today)) / 86400000 <= 30) return 'Ending soon'
  return 'Active'
}

/** Future draft only: active rentals use the fee agreed in the rental, not today's catalog price. */
export function rentalLinesForDraft(rentals: RentalRequest[], room: string, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return []
  const [year, number] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10)
  return rentals.filter(r => r.room === room && r.status === 'Active' && r.startDate <= lastDay)
}
