import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import * as clientModule from '../api/client'
import {
  createLease,
  createReceipt,
  fetchReceipts,
  fetchRooms,
  updateApartmentConfig,
  updateTenant,
} from '../api/client'
import { resetMockStore, setMockMailOutage } from '../api/mockApi'
import { displayDate, todayInBangkok } from '../format'
import PaymentsPage from './PaymentsPage'

/*
  ยอดทุกตัวในไฟล์นี้คิดด้วยมือจากข้อมูลตั้งต้นของ mock (SSK-128) ไม่ได้เอาตัวเลขที่หน้าจอโชว์มาเทียบกับตัวเอง
  Config ตั้งต้น: ไฟ 50 น้ำ 100 ค่าส่วนกลาง 300 อินเทอร์เน็ต 250 สัญญาตัวอย่างไม่ได้ล็อกอัตราไว้จึงใช้ชุดนี้

  RC-2026-0001 Yuki Tanaka ห้อง 102 (Paid)    4,500 + 300 + 250 + 180×50 + 12×100 = 15,250
  RC-2026-0002 Kenji Sato ห้อง 201 (Overdue)   3,500 + 300 + 250 +  95×50 +  9×100 =  9,700
  (ใบของ Kenji ครบกำหนดเจ็ดวันก่อนเสมอ จึงเลยกำหนดไม่ว่ารันเทสวันไหน SSK-16)
*/

async function renderPayments() {
  render(<PaymentsPage />)
  await screen.findByText('Yuki Tanaka')
}

async function openCreateBill(room: string, electric: string, water: string) {
  fireEvent.click(screen.getByRole('button', { name: 'New Invoice' }))
  // สัญญากับอัตราโหลดแบบ async ปุ่มจะกดได้ก็ต่อเมื่อโหลดเสร็จ
  const createBill = screen.getByRole('button', { name: 'Create Bill' })
  await waitFor(() => expect(createBill).toBeEnabled())
  fireEvent.change(screen.getByLabelText(/Room/i), { target: { value: room } })
  fireEvent.change(screen.getByLabelText(/Electric usage/i), { target: { value: electric } })
  fireEvent.change(screen.getByLabelText(/Water usage/i), { target: { value: water } })
  return createBill
}

beforeEach(() => {
  resetMockStore()
  vi.restoreAllMocks()
})

describe('PaymentsPage list from /api/receipts', () => {
  it('renders receipts from the API with room type, amount, and billing month', async () => {
    await renderPayments()

    expect(screen.getByText('Payment Management')).toBeInTheDocument()
    const yuki = screen.getByRole('row', { name: /Yuki Tanaka/ })
    expect(yuki).toHaveTextContent('Unit 102')
    expect(yuki).toHaveTextContent('15,250.00')
    expect(yuki).toHaveTextContent('RC-2026-0001')
    expect(yuki).toHaveTextContent('Paid')
    const kenji = screen.getByRole('row', { name: /Kenji Sato/ })
    expect(kenji).toHaveTextContent('9,700.00')
    // SSK-16 ยังไม่จ่ายและเลยวันครบกำหนดแล้ว ขึ้น Overdue ไม่ใช่ Pending
    expect(kenji).toHaveTextContent('Overdue')
    expect(screen.getByText('Showing 2 of 2 entries')).toBeInTheDocument()
  })

  it('computes the pending and renewal cards from the loaded data instead of fixed numbers', async () => {
    await renderPayments()

    const pending = screen.getByText('PENDING COLLECTIONS').closest('div')!.parentElement!
    expect(pending).toHaveTextContent('9,700.00')
    expect(pending).toHaveTextContent('1 Invoices Awaiting Payment')

    // สัญญาห้อง 102 หมดในอีก 12 วัน เป็นใบเดียวที่อยู่ในช่วง 30 วัน
    const renewals = screen.getByText('UPCOMING RENEWALS (30D)').closest('div')!.parentElement!
    expect(renewals).toHaveTextContent('1 Units')
    expect(renewals).toHaveTextContent('฿4,500.00')
  })

  it('filters invoices by All Status, Paid, Pending, and Overdue', async () => {
    await renderPayments()

    fireEvent.click(screen.getByRole('button', { name: 'Paid' }))
    expect(screen.getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()

    // SSK-16 ใบที่เลยกำหนดอยู่ในปุ่ม Overdue ไม่ปนกับ Pending
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(screen.queryByText('Kenji Sato')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }))
    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
    expect(screen.queryByText('Yuki Tanaka')).not.toBeInTheDocument()
  })

  it('SSK-16 shows a new receipt as Pending until its due date passes', async () => {
    await renderPayments()
    const createBill = await openCreateBill('207', '100', '10')
    fireEvent.click(createBill)

    const hiroshi = await screen.findByRole('row', { name: /Hiroshi Nakamura/ })
    expect(hiroshi).toHaveTextContent('Pending')
  })

  it('does not display individual send invoice button in action column (SSK-130)', async () => {
    await renderPayments()
    expect(screen.queryByRole('button', { name: /Send invoice for/i })).not.toBeInTheDocument()
  })

  it('does not display individual download invoice button in action column (SSK-130)', async () => {
    await renderPayments()
    expect(screen.queryByRole('button', { name: /Download invoice for/i })).not.toBeInTheDocument()
  })

  it('allows selecting individual or all invoices to bulk send (SSK-130)', async () => {
    await renderPayments()

    const selectAllCheckbox = screen.getByLabelText('Select all invoices')
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /Select invoice for/i })

    expect(selectAllCheckbox).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Send All Invoices' })).toBeInTheDocument()

    fireEvent.click(rowCheckboxes[0])
    expect(rowCheckboxes[0]).toBeChecked()
    expect(screen.getByRole('button', { name: 'Send Invoices (1)' })).toBeInTheDocument()

    fireEvent.click(selectAllCheckbox)
    rowCheckboxes.forEach((cb) => expect(cb).toBeChecked())
    expect(screen.getByRole('button', { name: `Send Invoices (${rowCheckboxes.length})` })).toBeInTheDocument()
  })

  it('opens scheduled auto-billing dialog and saves settings (SSK-130)', async () => {
    await renderPayments()

    // Open Schedule Auto-Billing
    fireEvent.click(screen.getByRole('button', { name: /Schedule Auto-Billing/i }))

    const scheduleDialog = screen.getByRole('dialog', { name: 'Scheduled Bulk Billing' })
    expect(scheduleDialog).toBeInTheDocument()
    expect(within(scheduleDialog).getByText('Scheduled Bulk Billing')).toBeInTheDocument()

    // Save schedule
    fireEvent.click(within(scheduleDialog).getByRole('button', { name: /Save Schedule/i }))
    expect(await within(scheduleDialog).findByText(/Saved!/i)).toBeInTheDocument()
  })
})

/*
  SSK-143 ปุ่มส่งใบแจ้งหนี้ส่งอีเมลจริงผ่าน POST /api/receipts/send แล้ว
  mock ตั้งต้นมีใบค้างใบเดียวคือของ Kenji Sato (Overdue) ส่วนใบของ Yuki Tanaka จ่ายแล้ว
  ผู้เช่าทุกคนใน mock มีอีเมล เคสไม่มีอีเมลจึงต้องลบอีเมลของ Kenji ผ่าน updateTenant ก่อน
*/
describe('SSK-143 Send Invoices emails the invoices for real', () => {
  const KENJI = { fullName: 'Kenji Sato', phone: '082-345-6789', nationalId: '1100400234561' }

  async function openSendDialog(buttonName: string) {
    fireEvent.click(screen.getByRole('button', { name: buttonName }))
    return screen.getByRole('dialog', { name: 'Send Invoices' })
  }

  it('sends only the unpaid invoices by default, reports the result, and records it on the row', async () => {
    await renderPayments()

    const dialog = await openSendDialog('Send All Invoices')
    // ใบของ Yuki จ่ายแล้ว ปุ่ม Send All ต้องไม่ส่งใบที่จ่ายแล้ว ผู้เช่าจะนึกว่าโดนเก็บซ้ำ
    expect(within(dialog).queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Kenji Sato')).toBeInTheDocument()
    expect(within(dialog).getByText('To kenji.s@example.com')).toBeInTheDocument()
    expect(within(dialog).getByText('Overdue')).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent(/Simulation|Demo/)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Send 1 Invoice' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Sent 1 of 1')
    expect(within(dialog).getByText('Sent to kenji.s@example.com')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Send Invoices' })).not.toBeInTheDocument()
    expect(screen.getByText('Sent 1 of 1 invoice by email')).toBeInTheDocument()

    // ตารางโหลดใหม่ ใบที่ส่งแล้วบอกจำนวนครั้งกับวันที่ส่ง backend จำลองนับไว้จริง
    const kenji = await screen.findByRole('row', { name: /Kenji Sato/ })
    await waitFor(() => expect(kenji).toHaveTextContent(`Emailed ×1 · ${displayDate(todayInBangkok())}`))
    const saved = await fetchReceipts()
    expect(saved.find((r) => r.receiptNo === 'RC-2026-0002')?.sentCount).toBe(1)
    expect(saved.find((r) => r.receiptNo === 'RC-2026-0001')?.sentCount).toBe(0)
  })

  it('sends a paid invoice as a copy only when it is picked by hand', async () => {
    await renderPayments()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select invoice for Yuki Tanaka' }))
    const dialog = await openSendDialog('Send Invoices (1)')
    expect(within(dialog).getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(within(dialog).queryByText('Kenji Sato')).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Send 1 Invoice' }))
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Sent 1 of 1')
  })

  it('warns before sending that a tenant without email will be skipped, then reports why', async () => {
    await updateTenant(2, { ...KENJI, email: null })
    // ใบค้างของ Yuki อีกใบ ผู้เช่าที่มีอีเมล คำขอเดียวจึงมีทั้งใบที่ส่งและใบที่ถูกข้าม
    await createReceipt({ leaseId: 1, billingMonth: todayInBangkok().slice(0, 7), electricUnits: 10, waterUnits: 1 })
    render(<PaymentsPage />)
    // Yuki มีสองแถวแล้ว (ใบที่จ่ายแล้วกับใบใหม่) renderPayments ใช้ findByText ซึ่งเจอหลายแถวแล้วจะพัง
    await screen.findAllByText('Yuki Tanaka')

    const dialog = await openSendDialog('Send All Invoices')
    expect(within(dialog).getByText('No email on file — will be skipped')).toBeInTheDocument()
    expect(within(dialog).getByText('1 tenant has no email on file and will be skipped.')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Send 1 Invoice' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Sent 1 of 2 · 1 skipped')
    expect(within(dialog).getByText('No email address on file')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Sent 1 of 2 invoices by email (1 skipped)')).toBeInTheDocument()
  })

  it('cannot send when none of the picked tenants has an email', async () => {
    await updateTenant(2, { ...KENJI, email: null })
    await renderPayments()

    const dialog = await openSendDialog('Send All Invoices')
    expect(within(dialog).getByRole('button', { name: 'Send 0 Invoices' })).toBeDisabled()
  })

  it('shows the mail server error from the API and stays open so the admin can try again', async () => {
    setMockMailOutage(true)
    await renderPayments()

    const dialog = await openSendDialog('Send All Invoices')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send 1 Invoice' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The mail server is not reachable. Please try again later',
    )
    expect(screen.getByRole('dialog', { name: 'Send Invoices' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Send 1 Invoice' })).toBeEnabled()
    expect((await fetchReceipts()).find((r) => r.receiptNo === 'RC-2026-0002')?.sentCount).toBe(0)
  })

  it('reports an invoice the mail server refused after others went out', async () => {
    vi.spyOn(clientModule, 'sendReceipts').mockResolvedValueOnce({
      sent: [],
      skipped: [{ receiptId: 2, receiptNo: 'RC-2026-0002', tenantName: 'Kenji Sato', reason: 'SEND_FAILED' }],
    })
    await renderPayments()

    const dialog = await openSendDialog('Send All Invoices')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send 1 Invoice' }))

    expect(await within(dialog).findByText('Could not be sent — try again later')).toBeInTheDocument()
    expect(within(dialog).getByRole('status')).toHaveTextContent('Sent 0 of 1 · 1 skipped')
  })

  it('does not send a picked invoice that the filter now hides', async () => {
    await renderPayments()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select invoice for Yuki Tanaka' }))
    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }))

    // ใบของ Yuki ถูกกรองออกไปแล้ว ปุ่มต้องกลับเป็น Send All และส่งเฉพาะใบค้างที่เห็น
    const dialog = await openSendDialog('Send All Invoices')
    expect(within(dialog).queryByText('Yuki Tanaka')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Recipients (1)')).toBeInTheDocument()
  })

  it('turns Send All off when no unpaid invoice is visible', async () => {
    await renderPayments()

    fireEvent.click(screen.getByRole('button', { name: 'Paid' }))

    const sendAll = screen.getByRole('button', { name: 'Send All Invoices' })
    expect(sendAll).toBeDisabled()
    expect(sendAll).toHaveAttribute('title', 'No unpaid invoices to send')
  })
})

/*
  SSK-141 ตั้งเวลาออกบิลยังเป็นแบบจำลอง (ย้ายไปเก็บฝั่ง backend ใน PR ถัดไปของ SSK-143)
  หน้าจอต้องไม่บอกว่ากำลังทำงานจริง เปิดครั้งแรกต้องขึ้น Paused และทุกจุดต้องบอกว่าเป็นแบบจำลอง
*/
describe('SSK-141 billing automation says it is a simulation', () => {
  const SCHEDULE_KEY = 'sakura_scheduled_billing_config'

  beforeEach(() => {
    localStorage.removeItem(SCHEDULE_KEY)
  })

  it('shows the schedule as paused on a fresh browser because nothing runs', async () => {
    await renderPayments()

    expect(screen.getByText('Auto-Billing Paused (simulation)')).toBeInTheDocument()
    expect(screen.queryByText(/Auto-Billing Active/)).not.toBeInTheDocument()
  })

  it('does not trust an enabled schedule left over in this browser', async () => {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify({ enabled: true, dayOfMonth: 22, dispatchTime: '10:30' }))
    await renderPayments()

    expect(screen.getByText('Auto-Billing Paused (simulation)')).toBeInTheDocument()
  })

  it('labels the schedule dialog as a simulation and writes the day as 22nd, not 22th', async () => {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify({ enabled: false, dayOfMonth: 22, dispatchTime: '10:30' }))
    await renderPayments()

    fireEvent.click(screen.getByRole('button', { name: /Schedule Auto-Billing/i }))
    const dialog = screen.getByRole('dialog', { name: 'Scheduled Bulk Billing' })
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'Simulation only. Saving keeps these settings in this browser; no invoices are generated or sent yet.',
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'Enable Schedule' }))
    expect(within(dialog).getByText('Preview: would dispatch every 22nd of the month at 10:30')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Save Schedule/i }))

    const pill = await screen.findByText(/Auto-Billing \(simulation\): Every/)
    expect(pill).toHaveTextContent('Auto-Billing (simulation): Every 22nd at 10:30 — nothing is sent yet')
    expect(screen.queryByText(/22th/)).not.toBeInTheDocument()
  })
})

describe('Generate Receipt from the API receipt', () => {
  it('shows every line and the total exactly as calculated by hand', async () => {
    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Generate Receipt' })).toBeInTheDocument()
    expect(within(dialog).getByText('RC-2026-0001')).toBeInTheDocument()
    expect(within(dialog).getByText('180 units')).toBeInTheDocument()
    expect(within(dialog).getByText('12 units')).toBeInTheDocument()
    expect(within(dialog).getAllByTestId('receipt-item-amount').map((el) => el.textContent)).toEqual([
      '฿4,500.00',
      '฿300.00',
      '฿250.00',
      '฿9,000.00',
      '฿1,200.00',
    ])
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿15,250.00')
    expect(within(dialog).getByText('Paid')).toBeInTheDocument()
  })

  // SSK-114 ใบเสร็จดาวน์โหลดเป็น PDF เท่านั้น ตอนนี้เป็นไฟล์จาก backend ตาม docs/api-contract-billing.md
  /*
    SSK-16 ในโหมด backend จำลอง ลิงก์ PDF ของ backend ใช้ไม่ได้ (เบราว์เซอร์โหลดเองไม่ผ่าน mock)
    ปุ่ม Download จึงสร้าง PDF ในเบราว์เซอร์แทน ส่วนลิงก์ของ backend จริงเทสอยู่ใน
    GenerateReceiptModal.realBackend.test.tsx
  */
  it('builds the PDF in the browser in mock mode instead of linking to a backend it does not have', async () => {
    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Kenji Sato' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /^download/i })).toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: /^download/i })).not.toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿9,700.00')
    // ป็อปอัปใช้ป้ายเดียวกับตาราง
    expect(within(dialog).getByText('Overdue')).toBeInTheDocument()
  })

  it('opens the print page from the Print button in Generate Receipt (SSK-114)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: { write: vi.fn(), close: vi.fn() },
    } as unknown as Window)

    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /print/i }))

    expect(openSpy).toHaveBeenCalled()
  })

  it('marks a pending receipt as paid through the API and updates the list', async () => {
    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Kenji Sato' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as Paid' }))

    await waitFor(() => expect(within(dialog).getByText('Paid')).toBeInTheDocument())
    expect(within(dialog).queryByRole('button', { name: 'Mark as Paid' })).not.toBeInTheDocument()
    const kenji = (await fetchReceipts()).find((r) => r.tenantName === 'Kenji Sato')!
    expect(kenji.status).toBe('PAID')
  })

  it('does not offer Mark as Paid on a receipt that is already paid', async () => {
    await renderPayments()
    fireEvent.click(screen.getByRole('button', { name: 'View receipt for Yuki Tanaka' }))

    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Mark as Paid' })).not.toBeInTheDocument()
  })
})

describe('Create Payment through POST /api/receipts', () => {
  it('previews the same total as the saved receipt and keeps it after reloading', async () => {
    await renderPayments()
    const createBill = await openCreateBill('207', '120', '33')

    expect(screen.getByLabelText('Tenant')).toHaveValue('Hiroshi Nakamura')
    // 3,500 + 300 + 250 + 120×50 (6,000) + 33×100 (3,300) = 13,350
    expect(screen.getByTestId('bill-total')).toHaveTextContent('฿13,350.00')
    fireEvent.click(createBill)

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Payment' })).not.toBeInTheDocument())
    fireEvent.click(await screen.findByRole('button', { name: 'View receipt for Hiroshi Nakamura' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('120 units')).toBeInTheDocument()
    expect(within(dialog).getByText('33 units')).toBeInTheDocument()
    expect(within(dialog).getByTestId('receipt-total-amount')).toHaveTextContent('฿13,350.00')

    // บิลอยู่ที่ API ไม่ใช่แค่ใน state ของหน้า
    const saved = (await fetchReceipts()).find((r) => r.tenantName === 'Hiroshi Nakamura')!
    expect(saved).toMatchObject({ roomNumber: '207', billingMonth: todayInBangkok().slice(0, 7), totalAmount: 13350 })
  })

  it('shows the 409 from the API and stays open when the month is already billed', async () => {
    await renderPayments()
    const lastMonth = (await fetchReceipts()).find((r) => r.tenantName === 'Yuki Tanaka')!.billingMonth
    const createBill = await openCreateBill('102', '100', '10')
    fireEvent.change(screen.getByLabelText(/Billing Month/i), { target: { value: lastMonth } })
    fireEvent.click(createBill)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A receipt for this month has already been issued for this lease',
    )
    expect(screen.getByRole('heading', { name: 'Create Payment' })).toBeInTheDocument()
  })

  it('rejects negative units without sending anything to the API', async () => {
    await renderPayments()
    const createBill = await openCreateBill('207', '-5', '10')

    expect(screen.getByText('Electricity units cannot be negative')).toBeInTheDocument()
    expect(screen.getByTestId('bill-total')).toHaveTextContent('—')
    fireEvent.click(createBill)

    expect(await screen.findByRole('alert')).toHaveTextContent('Electricity units cannot be negative')
    expect(await fetchReceipts()).toHaveLength(2)
  })

  it('requires both meter readings instead of billing them as zero', async () => {
    await renderPayments()
    const createBill = await openCreateBill('207', '120', '')
    fireEvent.click(createBill)

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the water units')
    expect(await fetchReceipts()).toHaveLength(2)
  })

  it('refuses a room without an active contract', async () => {
    await renderPayments()
    const createBill = await openCreateBill('101', '120', '10')
    fireEvent.click(createBill)

    expect(await screen.findByRole('alert')).toHaveTextContent('Room 101 has no active contract')
  })

  /*
    QA: Config ตอนเซ็นเป็น 77 สร้างสัญญา เปลี่ยน Config เป็น 99 แล้วออกบิลของสัญญาเดิม ต้องเห็น 77
    ห้ามเปลี่ยน expected เป็น 99 เพื่อให้เทสผ่าน
  */
  it('bills with the rate locked on the contract, not the rate changed in Config later', async () => {
    const base = { waterRatePerUnit: 100, commonAreaFee: 300, internetFee: 250 }
    await updateApartmentConfig({ ...base, electricRatePerUnit: 77 })
    const room101 = (await fetchRooms()).find((r) => r.roomNumber === '101')!
    await createLease({
      roomId: room101.id,
      tenantId: 6,
      startDate: `${todayInBangkok().slice(0, 7)}-01`,
      endDate: null,
      billingCycle: 'MONTHLY',
    })
    await updateApartmentConfig({ ...base, electricRatePerUnit: 99 })

    await renderPayments()
    const createBill = await openCreateBill('101', '10', '0')
    expect(screen.getByText(/× 77\.00 \/ unit/)).toBeInTheDocument()
    fireEvent.click(createBill)

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Payment' })).not.toBeInTheDocument())
    const saved = (await fetchReceipts()).find((r) => r.roomNumber === '101')!
    expect(saved.items.find((row) => row.item === 'Electricity')).toMatchObject({ rate: 77, amount: 770 })
  })
})
