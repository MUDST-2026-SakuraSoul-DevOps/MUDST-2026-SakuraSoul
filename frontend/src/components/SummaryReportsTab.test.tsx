import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportRow } from '../domain/paymentPhase2'
import { SummaryReportsTab } from './SummaryReportsTab'

/*
  SSK-170 ยอดคงเหลือ (closing balance) เป็น snapshot ของแต่ละเดือน บวกข้ามเดือนแล้วได้ตัวเลขผิด
  เช่นหนี้ 2,000 ที่ค้างตั้งแต่ตุลาแล้วยกไปพฤศจิกา จะถูกนับสองครั้ง

  ตัวกันนี้เคยมีอยู่แล้วและหลุดไปใน cf81c1c ตอนรายงานเปลี่ยนมาอ่านใบแจ้งหนี้จริง
  E2E-PAYMENT-006 จับได้ ไฟล์นี้คุมไว้อีกชั้นในระดับ component
*/

const TWO_MONTHS: ReportRow[] = [
  { unit: '101', tenant: 'Kant S.', month: 'Nov 2026', charges: 5000, collected: 3000, balance: 4000 },
  { unit: '102', tenant: 'Mali P.', month: 'Nov 2026', charges: 4000, collected: 4000, balance: 0 },
  { unit: '101', tenant: 'Kant S.', month: 'Oct 2026', charges: 4500, collected: 2500, balance: 2000 },
]

const ONE_MONTH = TWO_MONTHS.filter((r) => r.month === 'Nov 2026')

/** การ์ดสรุปด้านบน คำว่า CLOSING BALANCE ขึ้นที่หัวตารางด้วย จึงเลือกตัวที่เป็นป้ายบนการ์ด */
function balanceCard() {
  const label = screen.getAllByText('CLOSING BALANCE').find((el) => el.tagName === 'P') as HTMLElement
  return label.parentElement as HTMLElement
}

function selectPeriod(value: string) {
  fireEvent.change(document.getElementById('report-period') as HTMLSelectElement, { target: { value } })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SummaryReportsTab · closing balance across months (SSK-170)', () => {
  it('refuses to add closing balances together when the rows span more than one month', () => {
    render(<SummaryReportsTab reportData={TWO_MONTHS} />)

    // ค่าตั้งต้นคือ All months ซึ่งตรงนี้มีทั้ง Oct และ Nov
    expect(within(balanceCard()).getByText('By period below')).toBeInTheDocument()
    // 4,000 + 0 + 2,000 = 6,000 คือตัวเลขผิดที่ต้องไม่ขึ้น
    expect(screen.queryByText('฿6,000.00')).not.toBeInTheDocument()
    expect(screen.getAllByText('Select one month')).toHaveLength(2)

    // ยอดที่บวกข้ามเดือนได้ยังแสดงตามปกติ (13,500 คือค่าใช้จ่ายรวม 9,500 คือเงินที่รับรวม)
    const received = screen.getAllByText('PAYMENTS RECEIVED').find((el) => el.tagName === 'P') as HTMLElement
    expect(screen.getByText('฿13,500.00')).toBeInTheDocument()
    expect(within(received.parentElement as HTMLElement).getByText('฿9,500.00')).toBeInTheDocument()
  })

  it('shows each month its own balance when grouped by month', () => {
    render(<SummaryReportsTab reportData={TWO_MONTHS} />)

    fireEvent.click(screen.getByRole('button', { name: 'Group by Month' }))

    const table = screen.getByRole('table')
    expect(within(table).queryByText('Select one month')).not.toBeInTheDocument()
    expect(within(within(table).getByText('Nov 2026').closest('tr') as HTMLElement).getByText('฿4,000.00')).toBeInTheDocument()
    expect(within(within(table).getByText('Oct 2026').closest('tr') as HTMLElement).getByText('฿2,000.00')).toBeInTheDocument()
    // การ์ดรวมยังรวมสองเดือนอยู่ จึงยังไม่บวกให้
    expect(within(balanceCard()).getByText('By period below')).toBeInTheDocument()
  })

  it('shows the balance again once a single month is selected', () => {
    render(<SummaryReportsTab reportData={TWO_MONTHS} />)

    selectPeriod('Oct 2026')

    expect(within(balanceCard()).getByText('฿2,000.00')).toBeInTheDocument()
    expect(screen.queryByText('Select one month')).not.toBeInTheDocument()
  })

  it('still shows the balance under All months when the data has only one month', () => {
    // ค่าตั้งต้นเป็น All months แล้ว ถ้ากันทุกครั้งผู้ใช้จะไม่เห็นยอดคงเหลือเลยตั้งแต่เปิดแท็บ
    render(<SummaryReportsTab reportData={ONE_MONTH} />)

    expect(within(balanceCard()).getByText('฿4,000.00')).toBeInTheDocument()
    expect(screen.queryByText('By period below')).not.toBeInTheDocument()
    expect(screen.queryByText('Select one month')).not.toBeInTheDocument()
  })

  it('leaves the balance column empty in the CSV exactly when the screen hides it', async () => {
    const blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blobs.push(b as Blob)
      return 'blob:report'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<SummaryReportsTab reportData={TWO_MONTHS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export report' }))
    selectPeriod('Nov 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Export report' }))

    const [acrossMonths, oneMonth] = await Promise.all(blobs.map((b) => b.text()))
    expect(acrossMonths.split('\n')[1]).toBe('101,9500,5500,')
    expect(oneMonth.split('\n')[1]).toBe('101,5000,3000,4000')
  })
})
