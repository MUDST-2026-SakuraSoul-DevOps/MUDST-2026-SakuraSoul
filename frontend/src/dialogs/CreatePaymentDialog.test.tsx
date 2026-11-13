import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '../api/client'
import {
  createExtraCharge,
  createLease,
  createReceipt,
  fetchMeterReadings,
  fetchRooms,
  importMeterReadings,
  payReceipt,
} from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { Receipt } from '../api/types'
import { todayInBangkok } from '../format'
import { CreatePaymentDialog } from './CreatePaymentDialog'

/*
  ป็อปอัปออกบิลหนึ่งห้อง เรนเดอร์ตรง ๆ แล้วยิงผ่าน backend จำลอง ยอดทุกตัวคิดด้วยมือจากข้อมูลตั้งต้นของ mock
  สัญญาทุกใบล็อกอัตราไว้ที่ ไฟ 50 น้ำ 100 ค่าส่วนกลาง 300 อินเทอร์เน็ต 250

  ห้อง 207 Hiroshi Nakamura ค่าเช่า 3,500   120 หน่วยไฟ 33 หน่วยน้ำ
    3,500 + 300 + 250 + 120×50 (6,000) + 33×100 (3,300) = 13,350
  ห้อง 101 ว่างอยู่ เป็นห้องเดี่ยว สัญญาใหม่ได้ค่าเช่า 3,500   12 หน่วยไฟ 3 หน่วยน้ำ
    3,500 + 300 + 250 + 12×50 (600) + 3×100 (300) = 4,950
    + ที่จอดรถรายเดือน 500 + คีย์การ์ดครั้งเดียว 200 = 5,650 (บิลแรกของสัญญา)
    + ที่จอดรถรายเดือน 500 อย่างเดียว = 5,450 (คีย์การ์ดคิดไปแล้วในบิลเดือนก่อน)
    + ค่าน้ำดื่มรายเดือนชื่อ Water 150 = 5,100 แก้หน่วยไฟเป็น 20 (1,000) = 5,500

  ห้อง 201 Kenji Sato ค่าเช่า 3,500   100 หน่วยไฟ 10 หน่วยน้ำ
    3,500 + 300 + 250 + 100×50 (5,000) + 10×100 (1,000) = 10,050 ค่าใช้จ่ายของเดือนนี้
    บิลเดือนก่อน RC-2026-0002 ยังค้าง 9,700 server ยกมารวม บิลที่ออกจริงจึงเป็น 10,050 + 9,700 = 19,750

  หน่วยที่นำเข้าไว้ใน seed มีถึงเดือนที่แล้ว บิลของเดือนนี้จึงไม่มีหน่วยเติมให้ ช่องว่างจนกว่าจะกรอก
*/

const CARRY_NOTE_KENJI =
  'Unpaid ฿9,700.00 from earlier bills will be carried into this bill, plus any late interest, so the issued total will be higher.'

const TENANT_OF_ROOM: Record<string, string> = {
  '102': 'Yuki Tanaka',
  '110': 'Aiko Tanaka',
  '201': 'Kenji Sato',
  '207': 'Hiroshi Nakamura',
}

/** ทุกห้องของผังตั้งต้น 2 ชั้น ชั้นละ 12 ห้อง เรียงตามเลขห้อง ห้องที่มีสัญญา active ขึ้นชื่อผู้เช่า */
const ROOM_OPTIONS = [1, 2]
  .flatMap((floor) => Array.from({ length: 12 }, (_, i) => `${floor}${String(i + 1).padStart(2, '0')}`))
  .map((room) => `${room} · ${TENANT_OF_ROOM[room] ?? '(Vacant)'}`)

function thisMonth(): string {
  return todayInBangkok().slice(0, 7)
}

/** เดือน YYYY-MM ที่ห่างจาก month ไป by เดือน */
function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function renderDialog() {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(<CreatePaymentDialog onClose={onClose} onCreated={onCreated} />)
  return { onClose, onCreated }
}

/** สัญญา ห้อง และอัตราโหลดครบเมื่อไหร่ ปุ่ม Create Bill ถึงกดได้ */
async function waitUntilReady() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create Bill' })).toBeEnabled())
}

function fillBill(room: string, electric: string, water: string) {
  fireEvent.change(screen.getByLabelText(/^Room/), { target: { value: room } })
  fireEvent.change(screen.getByLabelText(/^Electric usage/), { target: { value: electric } })
  fireEvent.change(screen.getByLabelText(/^Water usage/), { target: { value: water } })
}

/** แถวในกล่อง BILL PREVIEW ตามลำดับที่เห็น ชื่อบรรทัดติดกับยอด เช่น "Room rent฿3,500.00" */
function previewRows(): string[] {
  const box = screen.getByRole('heading', { name: 'BILL PREVIEW' }).nextElementSibling as HTMLElement
  return Array.from(box.children, (row) => row.textContent ?? '')
}

beforeEach(() => {
  resetMockStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CreatePaymentDialog', () => {
  it('lists every room with its tenant, fills the tenant from the picked room, and closes the list on a click outside', async () => {
    const user = userEvent.setup()
    renderDialog()
    await waitUntilReady()
    const room = screen.getByLabelText(/^Room/)

    // แค่คลิกช่องห้องรายการก็เปิด
    await user.click(room)
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(ROOM_OPTIONS)

    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: '207 · Hiroshi Nakamura' }))
    expect(room).toHaveValue('207')
    expect(screen.getByLabelText('Tenant')).toHaveValue('Hiroshi Nakamura')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    // เปิดรายการอีกรอบ ห้องที่เลือกไว้ถูกทำเครื่องหมาย ห้องอื่นไม่
    const toggle = screen.getByRole('button', { name: 'Toggle unit options' })
    await user.click(toggle)
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('option', { name: '207 · Hiroshi Nakamura' })).toHaveAttribute('aria-selected', 'true')
    expect(within(list).getByRole('option', { name: '201 · Kenji Sato' })).toHaveAttribute('aria-selected', 'false')

    // คลิกในช่องห้องที่โฟกัสอยู่แล้วรายการยังเปิดอยู่ (คลิกครั้งแรกย้ายโฟกัสมา ซึ่งสั่งเปิดรายการเองอยู่แล้ว
    // ครั้งที่สองจึงพิสูจน์ว่าการคลิกข้างในไม่ปิดรายการ) คลิกที่อื่นในป็อปอัปรายการปิด ห้องที่เลือกไม่เปลี่ยน
    await user.click(room)
    await user.click(room)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.click(screen.getByRole('heading', { name: 'Create Payment' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(room).toHaveValue('207')
  })

  it('keeps the room picker and Create Bill locked until the rooms arrive', async () => {
    const realFetchRooms = api.fetchRooms
    let roomsArrive: () => void = () => {}
    const roomsGate = new Promise<void>((resolve) => {
      roomsArrive = resolve
    })
    vi.spyOn(api, 'fetchRooms').mockImplementation(async () => {
      await roomsGate
      return realFetchRooms()
    })
    const leases = vi.spyOn(api, 'fetchLeases')
    const create = vi.spyOn(api, 'createReceipt')
    renderDialog()

    // สัญญามาถึงก่อน ห้องยังไม่มา ฟอร์มยังต้องล็อกอยู่
    expect(leases).toHaveBeenCalledWith({ status: 'ACTIVE' })
    await act(async () => {
      await leases.mock.results[0].value
    })
    expect(screen.getByText('Loading rooms & contracts...')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Room/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Toggle unit options' })).toBeDisabled()
    expect(screen.getByText('Select a room with an active contract to see the bill.')).toBeInTheDocument()
    const createBill = screen.getByRole('button', { name: 'Create Bill' })
    expect(createBill).toBeDisabled()
    fireEvent.click(createBill)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()

    roomsArrive()
    await waitUntilReady()
    expect(screen.getByText('Select an occupied room with an active contract')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Room/)).toBeEnabled()
  })

  it('asks for a room before anything is sent', async () => {
    const create = vi.spyOn(api, 'createReceipt')
    const { onClose, onCreated } = renderDialog()
    await waitUntilReady()

    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please select a room')

    // พิมพ์ตัวโอแทนเลขศูนย์ ไม่ใช่เลขห้อง ก็ยังถือว่ายังไม่ได้เลือกห้อง
    fireEvent.change(screen.getByLabelText(/^Room/), { target: { value: '1O1' } })
    expect(screen.getByLabelText('Tenant')).toHaveValue('No active contract')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please select a room')

    expect(create).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Create Payment' })).toBeInTheDocument()
  })

  it('asks for the billing month when it has been cleared', async () => {
    const create = vi.spyOn(api, 'createReceipt')
    const { onClose, onCreated } = renderDialog()
    await waitUntilReady()
    fillBill('207', '120', '33')

    fireEvent.change(screen.getByLabelText(/^Billing Month/), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Select Month from Calendar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose the billing month')
    expect(create).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Create Payment' })).toBeInTheDocument()
  })

  it('sends the chosen due date with the units and hands the created bill back', async () => {
    const month = thisMonth()
    const dueDate = `${shiftMonth(month, 1)}-20`
    const create = vi.spyOn(api, 'createReceipt')
    const { onClose, onCreated } = renderDialog()
    await waitUntilReady()
    fillBill('207', '120', '33')

    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: dueDate } })
    expect(screen.getByLabelText('Due Date')).toHaveValue(dueDate)
    expect(screen.getByTestId('bill-total')).toHaveTextContent('฿13,350.00')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({ leaseId: 3, billingMonth: month, electricUnits: 120, waterUnits: 33, dueDate })
    expect(onCreated.mock.calls[0][0]).toMatchObject({
      roomNumber: '207',
      tenantName: 'Hiroshi Nakamura',
      billingMonth: month,
      dueDate,
      status: 'PENDING',
      totalAmount: 13350,
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('says why the rates could not be loaded and reloads only them on Retry', async () => {
    const config = vi.spyOn(api, 'fetchApartmentConfig').mockRejectedValueOnce(new api.ApiError(500, 'Server error'))
    const leases = vi.spyOn(api, 'fetchLeases')
    const rooms = vi.spyOn(api, 'fetchRooms')
    const create = vi.spyOn(api, 'createReceipt')
    const { onClose, onCreated } = renderDialog()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Server error')
    expect(screen.getByText('Could not load rooms & contracts')).toBeInTheDocument()
    expect(screen.queryByText('Loading rooms & contracts...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Bill' })).toBeDisabled()
    expect(screen.getByLabelText(/^Room/)).toBeDisabled()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    await waitUntilReady()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Select an occupied room with an active contract')).toBeInTheDocument()
    // โหลดใหม่เฉพาะตัวที่พัง สัญญากับห้องโหลดผ่านตั้งแต่แรกแล้ว
    expect(config).toHaveBeenCalledTimes(2)
    expect(leases).toHaveBeenCalledTimes(1)
    expect(rooms).toHaveBeenCalledTimes(1)
    fillBill('207', '120', '33')
    expect(screen.getByTestId('bill-total')).toHaveTextContent('฿13,350.00')
    expect(create).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says why the earlier bills of the contract could not be loaded, and shows the carry warning after Retry', async () => {
    const bills = vi.spyOn(api, 'fetchReceipts').mockRejectedValueOnce(new api.ApiError(503, 'Receipts are unavailable'))
    renderDialog()
    await waitUntilReady()

    fillBill('201', '100', '10')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Receipts are unavailable')
    // ห้องกับสัญญาโหลดผ่าน คำใต้ช่องห้องจึงไม่บอกว่าโหลดห้องไม่ได้ และยังออกบิลได้ เพราะ server คิดยอดเองทั้งหมด
    expect(screen.getByText('Select an occupied room with an active contract')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Bill' })).toBeEnabled()
    expect(screen.queryByText(CARRY_NOTE_KENJI)).not.toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(CARRY_NOTE_KENJI)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(bills).toHaveBeenCalledTimes(2)
    expect(bills).toHaveBeenLastCalledWith({ leaseId: 2 })
  })

  it('says why the meter readings could not be loaded, and fills in the imported units after Retry', async () => {
    const month = thisMonth()
    await importMeterReadings(
      new File([`room_number,month,electric_units,water_units\n207,${month},120.5,7\n`], 'usage.csv'),
      false,
    )
    const readings = vi
      .spyOn(api, 'fetchMeterReadings')
      .mockRejectedValueOnce(new api.ApiError(503, 'Meter readings are unavailable'))
    renderDialog()
    await waitUntilReady()

    fireEvent.change(screen.getByLabelText(/^Room/), { target: { value: '207' } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Meter readings are unavailable')
    expect(screen.getByText('Select an occupied room with an active contract')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Electric usage/)).toHaveValue(null)
    expect(screen.queryByText(/Filled from the imported meter reading/)).not.toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByLabelText(/^Electric usage/)).toHaveValue(120.5))
    expect(screen.getByLabelText(/^Water usage/)).toHaveValue(7)
    expect(screen.getByText('Filled from the imported meter reading for this month. You can still change it.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readings).toHaveBeenCalledTimes(2)
    expect(readings).toHaveBeenLastCalledWith(month)
  })

  it('warns that earlier unpaid bills are carried in, while the preview total stays at the charges for this month', async () => {
    const month = thisMonth()
    const create = vi.spyOn(api, 'createReceipt')
    const { onCreated } = renderDialog()
    await waitUntilReady()

    fillBill('201', '100', '10')

    expect(await screen.findByText(CARRY_NOTE_KENJI)).toBeInTheDocument()
    expect(screen.getByTestId('bill-total')).toHaveTextContent('฿10,050.00')
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    // หน้าเว็บไม่ได้ส่งยอดยกมาไปเอง server คิดเองแล้วออกบิลที่สูงกว่าตัวอย่างตามที่เตือนไว้
    expect(create).toHaveBeenCalledWith({ leaseId: 2, billingMonth: month, electricUnits: 100, waterUnits: 10, dueDate: null })
    expect((onCreated.mock.calls[0][0] as Receipt).totalAmount).toBe(19750)
  })

  it('shows no carry warning for a contract that owes nothing, even right after leaving one that does', async () => {
    const bills = vi.spyOn(api, 'fetchReceipts')
    renderDialog()
    await waitUntilReady()
    fillBill('201', '100', '10')
    expect(await screen.findByText(CARRY_NOTE_KENJI)).toBeInTheDocument()

    // ห้อง 102 บิลล่าสุดจ่ายครบแล้ว ระหว่างที่บิลของห้องนี้ยังโหลดไม่เสร็จก็ต้องไม่เห็นยอดค้างของห้องก่อน
    fireEvent.change(screen.getByLabelText(/^Room/), { target: { value: '102' } })
    expect(screen.queryByText(/from earlier bills will be carried into this bill/)).not.toBeInTheDocument()
    expect(bills).toHaveBeenLastCalledWith({ leaseId: 1 })
    await act(async () => {
      await bills.mock.results[bills.mock.results.length - 1].value
    })
    expect(screen.getByLabelText('Tenant')).toHaveValue('Yuki Tanaka')
    expect(screen.queryByText(/from earlier bills will be carried into this bill/)).not.toBeInTheDocument()
  })

  it('neither looks up nor fills in meter readings while no billing month is chosen', async () => {
    const lastMonth = shiftMonth(thisMonth(), -1)
    const imported = (await fetchMeterReadings(lastMonth)).find((r) => r.roomNumber === '207')!
    const readings = vi.spyOn(api, 'fetchMeterReadings')
    renderDialog()
    await waitUntilReady()
    fireEvent.change(screen.getByLabelText(/^Room/), { target: { value: '207' } })
    expect(screen.getByLabelText(/^Electric usage/)).toHaveValue(null)

    fireEvent.change(screen.getByLabelText(/^Billing Month/), { target: { value: '' } })
    await act(async () => {
      await Promise.all(readings.mock.results.map((result) => result.value))
    })

    expect(readings).not.toHaveBeenCalledWith('')
    expect(readings).not.toHaveBeenCalledWith(undefined)
    expect(screen.getByLabelText(/^Electric usage/)).toHaveValue(null)
    expect(screen.getByLabelText(/^Water usage/)).toHaveValue(null)
    expect(screen.queryByText(/Filled from the imported meter reading/)).not.toBeInTheDocument()

    // เลือกเดือนที่แล้วซึ่งมีหน่วยนำเข้าไว้ ช่องเติมจากแถวของเดือนนั้นตามปกติ
    fireEvent.change(screen.getByLabelText(/^Billing Month/), { target: { value: lastMonth } })
    await waitFor(() => expect(screen.getByLabelText(/^Electric usage/)).toHaveValue(imported.electricUnits))
    expect(screen.getByLabelText(/^Water usage/)).toHaveValue(imported.waterUnits)
    expect(screen.getByText('Filled from the imported meter reading for this month. You can still change it.')).toBeInTheDocument()
    expect(readings).toHaveBeenLastCalledWith(lastMonth)
  })
})

describe('CreatePaymentDialog extra charges agreed in the contract (SSK-165)', () => {
  /** ตั้งที่จอดรถรายเดือนกับคีย์การ์ดครั้งเดียวให้ห้อง 101 แล้วทำสัญญา สัญญาคัดลอกสองรายการนี้ไปตอนเซ็น */
  async function leaseRoom101WithCharges(fromMonth: string) {
    const room101 = (await fetchRooms()).find((r) => r.roomNumber === '101')!
    const parking = await createExtraCharge(room101.id, {
      label: 'Parking',
      amount: 500,
      recurrence: 'MONTHLY',
      startMonth: fromMonth,
      endMonth: null,
      active: true,
    })
    const keyCard = await createExtraCharge(room101.id, {
      label: 'Key card',
      amount: 200,
      recurrence: 'ONE_TIME',
      startMonth: fromMonth,
      endMonth: null,
      active: true,
    })
    const lease = await createLease({
      roomId: room101.id,
      tenantId: 6,
      startDate: `${fromMonth}-01`,
      endDate: null,
      billingCycle: 'MONTHLY',
    })
    return { lease, parking, keyCard }
  }

  function extraChargeRows(): string[] {
    return within(screen.getByRole('list')).getAllByRole('listitem').map((row) => row.textContent ?? '')
  }

  it('lists the charges due this month and the server bills exactly what the preview shows', async () => {
    const month = thisMonth()
    const { lease, parking, keyCard } = await leaseRoom101WithCharges(month)
    const create = vi.spyOn(api, 'createReceipt')
    const { onCreated } = renderDialog()
    await waitUntilReady()
    expect(screen.getByText('Extra charges agreed in the contract appear here once a room is selected.')).toBeInTheDocument()

    fillBill('101', '12', '3')

    expect(screen.getByLabelText('Tenant')).toHaveValue('Haruto Watanabe')
    expect(extraChargeRows()).toEqual(['Parking · Monthly฿500.00', 'Key card · One-time฿200.00'])
    expect(previewRows()).toEqual([
      'Room rent฿3,500.00',
      'Common area fee฿300.00',
      'Internet฿250.00',
      'Electricity฿600.00',
      'Water฿300.00',
      'Parking฿500.00',
      'Key card฿200.00',
      'Total฿5,650.00',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    // รายการพิเศษไม่ได้ไปกับคำขอ server คิดเองจากสัญญา หน้าเว็บแค่โชว์ให้ตรงกับที่ server จะคิด
    expect(create).toHaveBeenCalledWith({ leaseId: lease.id, billingMonth: month, electricUnits: 12, waterUnits: 3, dueDate: null })
    const saved = onCreated.mock.calls[0][0] as Receipt
    expect(saved.totalAmount).toBe(5650)
    expect(saved.items.filter((row) => row.chargeId != null).map((row) => [row.item, row.amount, row.chargeId])).toEqual([
      ['Parking', 500, parking.id],
      ['Key card', 200, keyCard.id],
    ])
  })

  it('shows an extra charge that shares its name with a standard line as a row of its own', async () => {
    const month = thisMonth()
    const room101 = (await fetchRooms()).find((r) => r.roomNumber === '101')!
    // ค่าน้ำดื่มที่แอดมินตั้งชื่อว่า Water ซ้ำกับบรรทัดค่าน้ำประปา ชื่อรายการพิเศษตั้งได้อิสระ
    await createExtraCharge(room101.id, {
      label: 'Water',
      amount: 150,
      recurrence: 'MONTHLY',
      startMonth: month,
      endMonth: null,
      active: true,
    })
    await createLease({ roomId: room101.id, tenantId: 6, startDate: `${month}-01`, endDate: null, billingCycle: 'MONTHLY' })
    const consoleError = vi.spyOn(console, 'error')
    const { onCreated } = renderDialog()
    await waitUntilReady()

    fillBill('101', '12', '3')
    expect(previewRows()).toEqual([
      'Room rent฿3,500.00',
      'Common area fee฿300.00',
      'Internet฿250.00',
      'Electricity฿600.00',
      'Water฿300.00',
      'Water฿150.00',
      'Total฿5,100.00',
    ])
    // แก้หน่วยหลังวาดแล้ว แถวที่ชื่อซ้ำกันต้องยังอยู่ครบและยอดถูกบรรทัด
    fireEvent.change(screen.getByLabelText(/^Electric usage/), { target: { value: '20' } })
    expect(previewRows()).toEqual([
      'Room rent฿3,500.00',
      'Common area fee฿300.00',
      'Internet฿250.00',
      'Electricity฿1,000.00',
      'Water฿300.00',
      'Water฿150.00',
      'Total฿5,500.00',
    ])
    const keyWarnings = consoleError.mock.calls.map((args) => args.map(String).join(' ')).filter((m) => m.includes('same key'))
    expect(keyWarnings).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect((onCreated.mock.calls[0][0] as Receipt).totalAmount).toBe(5500)
  })

  it('leaves out a one-time charge that an earlier bill of the contract already charged', async () => {
    const month = thisMonth()
    const lastMonth = shiftMonth(month, -1)
    const { lease } = await leaseRoom101WithCharges(lastMonth)
    // บิลเดือนที่แล้วคิดคีย์การ์ดไปแล้วและผู้เช่าจ่ายครบ บิลเดือนนี้จึงไม่มียอดยกมาปน
    const earlier = await createReceipt({ leaseId: lease.id, billingMonth: lastMonth, electricUnits: 10, waterUnits: 2 })
    expect(earlier.items.map((row) => row.item)).toContain('Key card')
    await payReceipt(earlier.id)
    const { onCreated } = renderDialog()
    await waitUntilReady()

    fillBill('101', '12', '3')

    // บิลเก่าของสัญญาโหลดตามหลังการเลือกห้อง มาถึงแล้วคีย์การ์ดต้องหายจากตัวอย่าง
    await waitFor(() =>
      expect(previewRows()).toEqual([
        'Room rent฿3,500.00',
        'Common area fee฿300.00',
        'Internet฿250.00',
        'Electricity฿600.00',
        'Water฿300.00',
        'Parking฿500.00',
        'Total฿5,450.00',
      ]),
    )
    expect(extraChargeRows()).toEqual(['Parking · Monthly฿500.00'])
    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    const saved = onCreated.mock.calls[0][0] as Receipt
    expect(saved.totalAmount).toBe(5450)
    expect(saved.items.filter((row) => row.chargeId != null).map((row) => row.item)).toEqual(['Parking'])
  })
})
