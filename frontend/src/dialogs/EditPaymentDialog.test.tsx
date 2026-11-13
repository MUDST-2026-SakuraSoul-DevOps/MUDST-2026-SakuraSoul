import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as api from '../api/client'
import { createExtraCharge, createLease, createReceipt, fetchReceipts, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { Receipt } from '../api/types'
import { todayInBangkok } from '../format'
import { EditPaymentDialog } from './EditPaymentDialog'

/*
  ป็อปอัปแก้ใบแจ้งหนี้ (SSK-155) เรนเดอร์ตรง ๆ ด้วยใบจริงจาก backend จำลอง ยอดคิดด้วยมือ

  RC-2026-0002 Kenji Sato ห้อง 201 ยังไม่จ่าย (PENDING) ของเดือนที่แล้ว อัตราที่ snapshot ไว้ในใบ ไฟ 50 น้ำ 100
    เดิม  3,500 + 300 + 250 + 95×50 (4,750) + 9×100 (900) = 9,700
    แก้เป็น 100.5 หน่วยไฟ 10 หน่วยน้ำ  3,500 + 300 + 250 + 100.5×50 (5,025) + 10×100 (1,000) = 10,075
    หน่วยไฟว่าง หน่วยน้ำ 9  ค่าน้ำยังคิดได้ 9×100 = 900 แต่ยอดรวมยังคิดไม่ได้
    หน่วยไฟ 95 หน่วยน้ำ -1  ค่าไฟยังคิดได้ 95×50 = 4,750 แต่ยอดรวมยังคิดไม่ได้
  RC-2026-0001 Yuki Tanaka ห้อง 102 จ่ายแล้ว (PAID)

  บิลเดือนนี้ของ Kenji (100 หน่วยไฟ 10 หน่วยน้ำ) ยกยอดค้าง 9,700 ของ RC-2026-0002 มาเป็นบรรทัด Previous balance
    3,500 + 300 + 250 + 5,000 + 1,000 + 9,700 = 19,750 แก้ได้เพราะเป็นบิลล่าสุดที่ยังไม่มีการชำระ
  ห้อง 101 สัญญาตั้งแต่เดือนที่แล้ว มีที่จอดรถรายเดือน 500
    บิลเดือนที่แล้ว 10 หน่วยไฟ 2 หน่วยน้ำ  3,500 + 300 + 250 + 500 + 200 + 500 = 5,250 ยังไม่จ่าย
    บิลเดือนนี้ 12 หน่วยไฟ 3 หน่วยน้ำ  3,500 + 300 + 250 + 600 + 300 + 500 + ยกมา 5,250 = 10,700
    แก้หน่วยไฟเป็น 20  3,500 + 300 + 250 + 1,000 + 300 + 500 + 5,250 = 11,100

  สัญญาของ Kenji เริ่มราว 150 วันก่อน เดือนที่ย้อนไป 12 เดือนจึงอยู่นอกช่วงสัญญาเสมอไม่ว่ารันวันไหน
*/

async function receiptNo(no: string): Promise<Receipt> {
  return (await fetchReceipts()).find((r) => r.receiptNo === no)!
}

/** เดือน YYYY-MM ที่ห่างจากเดือนนี้ตามเวลาไทยไป by เดือน */
function monthFromNow(by: number): string {
  const [year, month] = todayInBangkok().split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function renderEdit(receipt: Receipt) {
  const onClose = vi.fn()
  const onUpdated = vi.fn()
  render(<EditPaymentDialog receipt={receipt} onClose={onClose} onUpdated={onUpdated} />)
  return { onClose, onUpdated }
}

function setUnits(electric: string, water: string) {
  fireEvent.change(screen.getByLabelText(/^Electric usage/), { target: { value: electric } })
  fireEvent.change(screen.getByLabelText(/^Water usage/), { target: { value: water } })
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
}

/** แถวในกล่อง RECALCULATED BILL ตามลำดับที่เห็น ชื่อบรรทัดติดกับยอด เช่น "Room rent฿3,500.00" */
function recalculatedRows(): string[] {
  const box = screen.getByRole('heading', { name: 'RECALCULATED BILL' }).nextElementSibling as HTMLElement
  return Array.from(box.children, (row) => row.textContent ?? '')
}

/** ป็อปอัปยังเปิดอยู่ ไม่มีอะไรออกไปจากป็อปอัป */
function expectNothingSent(update: ReturnType<typeof vi.spyOn>, onClose: () => void, onUpdated: () => void) {
  expect(update).not.toHaveBeenCalled()
  expect(onUpdated).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Edit Payment' })).toBeInTheDocument()
}

beforeEach(() => {
  resetMockStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EditPaymentDialog', () => {
  it('recalculates with the rates locked on the receipt and sends only the units and month', async () => {
    const kenji = await receiptNo('RC-2026-0002')
    const update = vi.spyOn(api, 'updateReceipt')
    const { onClose, onUpdated } = renderEdit(kenji)
    expect(
      screen.getByText('Rates are locked from the original receipt snapshot (50.00/unit electricity, 100.00/unit water).'),
    ).toBeInTheDocument()

    setUnits('100.5', '10')

    expect(screen.getByText('× 50.00 / unit = ฿5,025.00')).toBeInTheDocument()
    expect(screen.getByText('× 100.00 / unit = ฿1,000.00')).toBeInTheDocument()
    expect(recalculatedRows()).toEqual([
      'Room rent฿3,500.00',
      'Common area fee฿300.00',
      'Internet฿250.00',
      'Electricity (100.5 units)฿5,025.00',
      'Water (10 units)฿1,000.00',
      'Total฿10,075.00',
    ])
    save()

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(kenji.id, { billingMonth: kenji.billingMonth, electricUnits: 100.5, waterUnits: 10 })
    expect(onUpdated.mock.calls[0][0]).toMatchObject({ id: kenji.id, receiptNo: 'RC-2026-0002', totalAmount: 10075 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('refuses a paid receipt without calling the API', async () => {
    const yuki = await receiptNo('RC-2026-0001')
    const update = vi.spyOn(api, 'updateReceipt')
    const { onClose, onUpdated } = renderEdit(yuki)

    save()

    expect(await screen.findByRole('alert')).toHaveTextContent('Paid receipts cannot be edited')
    expectNothingSent(update, onClose, onUpdated)
  })

  it('asks for the billing month when it has been cleared', async () => {
    const update = vi.spyOn(api, 'updateReceipt')
    const { onClose, onUpdated } = renderEdit(await receiptNo('RC-2026-0002'))

    fireEvent.change(screen.getByLabelText(/^Billing Month/), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Select Month from Calendar' })).toBeInTheDocument()
    save()

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose the billing month')
    expectNothingSent(update, onClose, onUpdated)
  })

  it('prices the water from its own units while the electricity units are blank, and does not save', async () => {
    const update = vi.spyOn(api, 'updateReceipt')
    const { onClose, onUpdated } = renderEdit(await receiptNo('RC-2026-0002'))

    setUnits('', '9')

    // ช่องที่ว่างยังไม่ขึ้นคำเตือน บอกแค่อัตรา ช่องน้ำที่ถูกต้องยังบอกยอดของตัวเอง ยอดรวมรอจนกรอกครบ
    expect(screen.getByText('× 50.00 / unit')).toBeInTheDocument()
    expect(screen.getByText('× 100.00 / unit = ฿900.00')).toBeInTheDocument()
    expect(recalculatedRows()).toEqual([
      'Room rent฿3,500.00',
      'Common area fee฿300.00',
      'Internet฿250.00',
      'Electricity (— units)—',
      'Water (9 units)฿900.00',
      'Total—',
    ])
    save()

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the electricity units')
    expectNothingSent(update, onClose, onUpdated)
  })

  it('prices the electricity from its own units while the water units are negative, and does not save', async () => {
    const update = vi.spyOn(api, 'updateReceipt')
    const { onClose, onUpdated } = renderEdit(await receiptNo('RC-2026-0002'))

    setUnits('95', '-1')

    const water = screen.getByLabelText(/^Water usage/)
    expect(water).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Water units cannot be negative')).toBeInTheDocument()
    expect(screen.getByText('× 50.00 / unit = ฿4,750.00')).toBeInTheDocument()
    expect(recalculatedRows()).toEqual([
      'Room rent฿3,500.00',
      'Common area fee฿300.00',
      'Internet฿250.00',
      'Electricity (95 units)฿4,750.00',
      'Water (— units)—',
      'Total—',
    ])
    save()

    expect(await screen.findByRole('alert')).toHaveTextContent('Water units cannot be negative')
    expectNothingSent(update, onClose, onUpdated)
  })

  it('keeps the carried balance in the recalculated total, the same total the server saves', async () => {
    const bill = await createReceipt({ leaseId: 2, billingMonth: todayInBangkok().slice(0, 7), electricUnits: 100, waterUnits: 10 })
    const update = vi.spyOn(api, 'updateReceipt')
    const { onUpdated } = renderEdit(bill)

    expect(recalculatedRows()).toEqual([
      'Room rent฿3,500.00',
      'Common area fee฿300.00',
      'Internet฿250.00',
      'Electricity (100 units)฿5,000.00',
      'Water (10 units)฿1,000.00',
      'Previous balance฿9,700.00',
      'Total฿19,750.00',
    ])
    save()

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(bill.id, { billingMonth: bill.billingMonth, electricUnits: 100, waterUnits: 10 })
    expect((onUpdated.mock.calls[0][0] as Receipt).totalAmount).toBe(19750)
  })

  it('lists every issued line in the order of the bill and recalculates only the meters', async () => {
    const month = todayInBangkok().slice(0, 7)
    const lastMonth = monthFromNow(-1)
    const room101 = (await fetchRooms()).find((r) => r.roomNumber === '101')!
    await createExtraCharge(room101.id, {
      label: 'Parking',
      amount: 500,
      recurrence: 'MONTHLY',
      startMonth: lastMonth,
      endMonth: null,
      active: true,
    })
    const lease = await createLease({
      roomId: room101.id,
      tenantId: 6,
      startDate: `${lastMonth}-01`,
      endDate: null,
      billingCycle: 'MONTHLY',
    })
    await createReceipt({ leaseId: lease.id, billingMonth: lastMonth, electricUnits: 10, waterUnits: 2 })
    const bill = await createReceipt({ leaseId: lease.id, billingMonth: month, electricUnits: 12, waterUnits: 3 })
    const update = vi.spyOn(api, 'updateReceipt')
    const { onUpdated } = renderEdit(bill)

    setUnits('20', '3')

    expect(recalculatedRows()).toEqual([
      'Room rent฿3,500.00',
      'Common area fee฿300.00',
      'Internet฿250.00',
      'Electricity (20 units)฿1,000.00',
      'Water (3 units)฿300.00',
      'Parking฿500.00',
      'Previous balance฿5,250.00',
      'Total฿11,100.00',
    ])
    save()

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(bill.id, { billingMonth: month, electricUnits: 20, waterUnits: 3 })
    const saved = onUpdated.mock.calls[0][0] as Receipt
    expect(saved.totalAmount).toBe(11100)
    expect(saved.items.map((row) => [row.item, row.amount])).toEqual([
      ['Room rent', 3500],
      ['Common area fee', 300],
      ['Internet', 250],
      ['Electricity', 1000],
      ['Water', 300],
      ['Parking', 500],
      ['Previous balance', 5250],
    ])
  })

  it('shows why the server refused and stays open with the bill unchanged', async () => {
    const kenji = await receiptNo('RC-2026-0002')
    const { onClose, onUpdated } = renderEdit(kenji)

    fireEvent.change(screen.getByLabelText(/^Billing Month/), { target: { value: monthFromNow(-12) } })
    save()

    expect(await screen.findByRole('alert')).toHaveTextContent('The billing month is outside the lease period')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled())
    expect(onUpdated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Edit Payment' })).toBeInTheDocument()
    expect(await receiptNo('RC-2026-0002')).toMatchObject({ billingMonth: kenji.billingMonth, totalAmount: 9700 })
  })

  it('says the bill could not be updated when the server cannot be reached', async () => {
    vi.spyOn(api, 'updateReceipt').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { onClose, onUpdated } = renderEdit(await receiptNo('RC-2026-0002'))

    save()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update the bill')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled())
    expect(onUpdated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Edit Payment' })).toBeInTheDocument()
  })
})
