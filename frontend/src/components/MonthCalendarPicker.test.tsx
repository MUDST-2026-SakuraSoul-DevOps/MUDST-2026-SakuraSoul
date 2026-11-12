import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MonthCalendarPicker } from './MonthCalendarPicker'

/*
  ช่องเลือกเดือนของฟอร์มออกบิลกับแก้บิล (SSK-155) สองฟอร์มนั้นส่ง maxMonth เป็นเดือนปัจจุบัน
  เดือนหลังจากนั้นต้องกดไม่ได้ ห่อด้วย state แบบเดียวกับฟอร์มจริง (value + onChange={setBillingMonth})
  ปุ่มจะได้โชว์เดือนที่เพิ่งเลือก ส่วน label ผูกกับ id แบบเดียวกับ CreatePaymentDialog
*/
function BillingMonthField({
  initial,
  maxMonth,
  onChange,
}: {
  initial: string
  maxMonth?: string
  onChange: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <div>
      <label htmlFor="billing-month">Billing Month</label>
      <MonthCalendarPicker
        id="billing-month"
        value={value}
        maxMonth={maxMonth}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
      />
      <p>Due Date</p>
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthButton(name: string) {
  return screen.getByRole('button', { name })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('MonthCalendarPicker', () => {
  it('opens on the year of the chosen month, picks a month and closes', () => {
    const onChange = vi.fn()
    render(<BillingMonthField initial="2026-03" maxMonth="2026-11" onChange={onChange} />)

    const toggle = screen.getByRole('button', { name: 'March 2026' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('2026', { exact: true })).toBeInTheDocument()
    fireEvent.click(monthButton('May'))

    expect(onChange.mock.calls).toEqual([['2026-05']])
    // เลือกแล้วปิดเอง ปุ่มเปลี่ยนเป็นเดือนที่เพิ่งเลือก
    expect(screen.queryByRole('button', { name: 'Previous year' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'May 2026' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('locks the months after the ceiling and keeps the year from moving past it', () => {
    const onChange = vi.fn()
    render(<BillingMonthField initial="2026-03" maxMonth="2026-11" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'March 2026' }))

    // ธ.ค. 2026 อยู่หลังเดือนเพดาน (พ.ย. 2026) จึงกดไม่ได้ ส่วน พ.ย. เองยังเลือกได้
    expect(monthButton('Dec')).toBeDisabled()
    expect(monthButton('Nov')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled()
    fireEvent.click(monthButton('Dec'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'March 2026' })).toHaveAttribute('aria-expanded', 'true')

    // ปีก่อนหน้าอยู่ก่อนเพดานทั้งปี ทุกเดือนเลือกได้ และกลับไปปีถัดไปได้
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(screen.getByText('2025', { exact: true })).toBeInTheDocument()
    expect(MONTHS.filter((month) => monthButton(month).hasAttribute('disabled'))).toEqual([])
    expect(screen.getByRole('button', { name: 'Next year' })).toBeEnabled()
    fireEvent.click(monthButton('Dec'))

    expect(onChange.mock.calls).toEqual([['2025-12']])
    expect(screen.getByRole('button', { name: 'December 2025' })).toBeInTheDocument()
  })

  it('lets the user move to any later year when there is no ceiling', () => {
    const onChange = vi.fn()
    render(<BillingMonthField initial="2026-03" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'March 2026' }))

    fireEvent.click(screen.getByRole('button', { name: 'Next year' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }))
    expect(screen.getByText('2028', { exact: true })).toBeInTheDocument()
    expect(MONTHS.filter((month) => monthButton(month).hasAttribute('disabled'))).toEqual([])
    fireEvent.click(monthButton('Dec'))

    expect(onChange.mock.calls).toEqual([['2028-12']])
    expect(screen.getByRole('button', { name: 'December 2028' })).toBeInTheDocument()
  })

  it('asks for a month and opens on the current year when none is chosen yet', () => {
    // ปีที่เปิดมาจากนาฬิกาเครื่อง ตรึงไว้ที่ปีที่ไม่ใช่ปีที่รันเทส จะได้รู้ว่าอ่านจากนาฬิกาจริง
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2031-06-15T05:00:00Z') })
    const onChange = vi.fn()
    render(<BillingMonthField initial="" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Select Month from Calendar' }))
    expect(screen.getByText('2031', { exact: true })).toBeInTheDocument()
    fireEvent.click(monthButton('Feb'))

    expect(onChange.mock.calls).toEqual([['2031-02']])
    expect(screen.getByRole('button', { name: 'February 2031' })).toBeInTheDocument()
  })

  it('closes on a click outside the picker or on its button, but not on a click inside it', () => {
    const onChange = vi.fn()
    render(<BillingMonthField initial="2026-03" maxMonth="2026-11" onChange={onChange} />)
    const toggle = screen.getByRole('button', { name: 'March 2026' })
    fireEvent.click(toggle)

    fireEvent.mouseDown(screen.getByText('2026', { exact: true }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.mouseDown(screen.getByText('Due Date'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Jan' })).not.toBeInTheDocument()

    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Jan' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('also takes a month typed into the labelled native month field', () => {
    const onChange = vi.fn()
    render(<BillingMonthField initial="2026-03" maxMonth="2026-11" onChange={onChange} />)

    // ช่อง month ของเบราว์เซอร์ซ่อนไว้ให้คีย์บอร์ดกับโปรแกรมอ่านหน้าจอ label ของฟอร์มชี้มาที่ช่องนี้
    const native = screen.getByLabelText('Billing Month')
    expect(native).toHaveAttribute('type', 'month')
    expect(native).toHaveAttribute('max', '2026-11')
    fireEvent.change(native, { target: { value: '2026-07' } })
    expect(screen.getByRole('button', { name: 'July 2026' })).toBeInTheDocument()

    fireEvent.change(native, { target: { value: '' } })
    expect(onChange.mock.calls).toEqual([['2026-07'], ['']])
    expect(screen.getByRole('button', { name: 'Select Month from Calendar' })).toBeInTheDocument()
  })
})
