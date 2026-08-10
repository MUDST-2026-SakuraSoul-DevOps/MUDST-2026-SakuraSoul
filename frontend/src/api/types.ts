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
