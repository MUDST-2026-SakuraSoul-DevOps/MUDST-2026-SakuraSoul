export interface RoomSummary {
  id: number
  roomNumber: string
  floor: number
  baseRent: number
}

export interface RoomDetail {
  id: number
  roomNumber: string
  floor: number
  baseRent: number
  note: string | null
}

export interface Tenant {
  id: number
  fullName: string
  phone: string | null
  nationalId: string | null
}

export interface CreateTenantRequest {
  fullName: string
  phone?: string
  nationalId?: string
}
