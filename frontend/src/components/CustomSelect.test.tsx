import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CustomSelect } from './CustomSelect'

const options = [
  { value: 'one', label: 'Room one' },
  { value: 'two', label: 'Room two' },
]

describe('CustomSelect', () => {
  it('opens the list, selects a value, and closes it', async () => {
    // ตรวจทั้งค่าที่ส่งกลับและสถานะเมนู เพื่อไม่ให้หน้าจอค้างหลังเลือกห้อง
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CustomSelect value="one" onChange={onChange} options={options} />)

    await user.click(screen.getByRole('button', { name: 'Room one' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'Room one' })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Room two' }))

    expect(onChange).toHaveBeenCalledWith('two')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes with Escape or a click outside', async () => {
    // การปิดเมนูต้องไม่เปลี่ยนค่าที่เลือกไว้
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<><CustomSelect value="one" onChange={onChange} options={options} /><button>Outside</button></>)
    await user.click(screen.getByRole('button', { name: 'Room one' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Room one' }))
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps disabled selection unavailable', async () => {
    // ฟอร์มที่ล็อกไว้ต้องเปลี่ยนค่าไม่ได้ทั้งปุ่มและ native select
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CustomSelect value="one" onChange={onChange} options={options} disabled aria-label="Room" />)
    expect(screen.getByRole('combobox', { name: 'Room' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Room one' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('converts numeric native select values back to numbers', async () => {
    // native select ส่งค่าเป็น string เสมอ จึงต้องรักษาชนิด number ของฟอร์ม
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CustomSelect value={1} onChange={onChange} options={[{ value: 1, label: 'First' }, { value: 2, label: 'Second' }]} aria-label="Floor" />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Floor' }), '2')
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('opens with Enter and selects a focused option with Space', async () => {
    // ปุ่ม native ต้องใช้งานด้วยคีย์บอร์ดได้ แม้ไม่ใช้เมาส์
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CustomSelect value="one" onChange={onChange} options={options} />)
    screen.getByRole('button', { name: 'Room one' }).focus()
    await user.keyboard('{Enter}')
    const second = within(screen.getByRole('listbox')).getByRole('option', { name: 'Room two' })
    second.focus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith('two')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
