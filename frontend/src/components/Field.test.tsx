import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberField } from './Field'

/**
 * เทสชุดนี้มาจากบั๊กที่ QA เจอ (SSK-90) NumberField ฮาร์ดโค้ด step="0.01" ไว้
 * ทั้งที่เป็น component กลาง กดลูกศรที่ช่อง Min Stock ทีเดียวจึงได้ 49.98
 * แทนที่จะเป็น 49 และช่องค่าเช่าในป็อปอัปเช็คอินก็เจอแบบเดียวกัน (SSK-103)
 *
 * เทสที่จุดนี้เพราะเป็นต้นเหตุร่วมของทุกช่องตัวเลขในแอป ถ้าใครเผลอใส่ 0.01
 * กลับเข้ามาอีกจะแดงทันที ไม่ต้องรอ QA มาเจอเองรอบสอง
 */
describe('NumberField', () => {
  it('ตั้งต้น step เป็น 1 ไม่ใช่ 0.01', () => {
    render(<NumberField label="Min Stock" value={50} onChange={() => {}} />)
    expect(screen.getByLabelText('Min Stock')).toHaveAttribute('step', '1')
  })

  it('ส่ง step มาเองได้ เผื่อวันหลังมีช่องที่ต้องใช้ทศนิยมจริง ๆ', () => {
    render(<NumberField label="Rate" value={1} onChange={() => {}} step={0.5} />)
    expect(screen.getByLabelText('Rate')).toHaveAttribute('step', '0.5')
  })

  it('ยังคง min ตามที่ส่งมา', () => {
    render(<NumberField label="Amount to add" value={1} onChange={() => {}} min={1} />)
    expect(screen.getByLabelText('Amount to add')).toHaveAttribute('min', '1')
  })
})
