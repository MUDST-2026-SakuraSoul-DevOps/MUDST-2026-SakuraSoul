import { describe, expect, it } from 'vitest'
import { paginate } from './pagination'

const items = Array.from({ length: 23 }, (_, i) => i + 1)

describe('paginate', () => {
  it('จำนวนหน้าคิดจากรายการจริง ไม่ใช่ตายตัวสามหน้า', () => {
    expect(paginate(items, 1, 10).totalPages).toBe(3)
    expect(paginate(items.slice(0, 6), 1, 10).totalPages).toBe(1)
    expect(paginate(items.slice(0, 40), 1, 5).totalPages).toBe(5)
  })

  it('ไม่มีรายการยังนับเป็นหนึ่งหน้า และบอกช่วงเป็น 0', () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1, total: 0, from: 0, to: 0 })
  })

  it('หน้าสุดท้ายได้เฉพาะรายการที่เหลือ และบอกช่วงถูก', () => {
    const last = paginate(items, 3, 10)
    expect(last.items).toEqual([21, 22, 23])
    expect(last.from).toBe(21)
    expect(last.to).toBe(23)
  })

  it('ขอหน้าที่เกินจำนวนหน้า ได้หน้าสุดท้ายแทนหน้าว่าง', () => {
    const page = paginate(items.slice(0, 6), 3, 10)
    expect(page.page).toBe(1)
    expect(page.items).toHaveLength(6)
  })

  it('ขอหน้าศูนย์หรือติดลบ ได้หน้าแรก', () => {
    expect(paginate(items, 0, 10).page).toBe(1)
    expect(paginate(items, -2, 10).page).toBe(1)
  })
})
