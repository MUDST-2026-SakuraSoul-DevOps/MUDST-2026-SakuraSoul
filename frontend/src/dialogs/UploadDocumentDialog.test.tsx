import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as clientModule from '../api/client'
import { createLease, fetchLeases, fetchReceipts, fetchRoomMaintenance, fetchRooms } from '../api/client'
import { resetMockStore } from '../api/mockApi'
import type { Lease, RoomSummary } from '../api/types'
import { displayDate, todayInBangkok } from '../format'
import * as fileSignatureModule from '../lib/fileSignature'
import { pdfFile } from '../test/files'
import { UploadDocumentDialog } from './UploadDocumentDialog'

/*
  DocumentsPage.test.tsx drives this dialog end to end from the page. This file works the dialog on
  its own and asserts the request it sends with uploadDocument, because that request is the whole
  contract between this dialog and the archive: whatever is wrong in it is wrong in the stored document.

  Since SSK-161/172 the dialog uploads the real file itself (multipart POST /api/documents) and the
  owner is a lease, maintenance ticket or receipt picked from the chosen unit. The old free-text tenant
  field, the title that copied the file name and the OCR prices are gone, so the cases that tested
  them now test what replaced them. Requests go to the in-browser mock backend, which follows the
  same rules as the Spring one.

  Dates come from todayInBangkok() rather than a literal, so these cases do not start failing on
  their own tomorrow.
*/

const onUploaded = vi.fn()
const onClose = vi.fn()
let rooms: RoomSummary[]
let uploadSpy: MockInstance<typeof clientModule.uploadDocument>

function roomId(roomNumber: string): number {
  const room = rooms.find((r) => r.roomNumber === roomNumber)
  if (!room) {
    throw new Error(`No unit ${roomNumber} in the mock`)
  }
  return room.id
}

function renderDialog(props: Partial<Parameters<typeof UploadDocumentDialog>[0]> = {}) {
  return render(
    <UploadDocumentDialog
      rooms={rooms}
      roomsError={null}
      initialType="CONTRACT_SCAN"
      initialRoomId={null}
      onClose={onClose}
      onUploaded={onUploaded}
      {...props}
    />,
  )
}

function chooseFile(file: File | null) {
  fireEvent.change(screen.getByLabelText('Document file'), { target: { files: file ? [file] : [] } })
}

/** เลือกตัวเลือกของ CustomSelect ผ่าน select ที่ซ่อนไว้ ด้วยข้อความที่ผู้ใช้เห็น */
function choose(label: string, optionText: string | RegExp) {
  const select = screen.getByLabelText(label)
  const option = within(select).getByRole('option', { name: optionText }) as HTMLOptionElement
  fireEvent.change(select, { target: { value: option.value } })
}

function descriptionInput() {
  return screen.getByLabelText(/Description/)
}

async function openOnUnit102() {
  renderDialog({ initialRoomId: roomId('102') })
  await screen.findByRole('option', { name: /Yuki Tanaka/ })
}

function sentUpload() {
  expect(uploadSpy).toHaveBeenCalledTimes(1)
  return uploadSpy.mock.calls[0][0]
}

/** ตัวเลือกของช่องเจ้าของเอกสารตามลำดับที่ผู้ใช้เห็น ไม่นับตัวเลือกว่างที่ CustomSelect ใส่ไว้บนสุด */
function ownerOptionTexts(label: string): string[] {
  return within(screen.getByLabelText(label))
    .getAllByRole<HTMLOptionElement>('option')
    .filter((option) => option.value !== '')
    .map((option) => option.textContent ?? '')
}

function daysFromToday(days: number): string {
  const date = new Date(`${todayInBangkok()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

beforeEach(async () => {
  resetMockStore()
  onUploaded.mockReset()
  onClose.mockReset()
  rooms = await fetchRooms()
  // ไม่แทนที่ของจริง คำขอยังไปถึง backend จำลอง แค่จดไว้ว่าส่งอะไร
  uploadSpy = vi.spyOn(clientModule, 'uploadDocument')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UploadDocumentDialog', () => {
  it('starts on the type and unit it was opened for, with today as the scan date', async () => {
    renderDialog({ initialType: 'RECEIPT_SCAN', initialRoomId: roomId('102') })

    expect(screen.getByLabelText('Document type')).toHaveValue('RECEIPT_SCAN')
    expect(screen.getByRole('option', { name: 'Unit 102', selected: true })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: /^RC-2026-0001/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Scan date')).toHaveValue(todayInBangkok())
  })

  it('refuses to submit without a file and never uploads', async () => {
    await openOnUnit102()

    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Please choose a file')
    expect(uploadSpy).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('shows the chosen file with its size', async () => {
    await openOnUnit102()

    chooseFile(pdfFile('signed-lease.pdf', 2048))

    expect(await screen.findByText('signed-lease.pdf')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
  })

  it('goes back to the empty state when the file picker is cleared', async () => {
    await openOnUnit102()
    chooseFile(pdfFile('signed-lease.pdf'))
    await screen.findByText('signed-lease.pdf')

    chooseFile(null)

    await waitFor(() => expect(screen.queryByText('signed-lease.pdf')).not.toBeInTheDocument())
    expect(screen.getByText('Click or drag a file to upload')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please choose a file')
  })

  it('keeps the description the uploader typed when a file is chosen afterwards', async () => {
    await openOnUnit102()
    await userEvent.type(descriptionInput(), 'Renewal signed in person')

    chooseFile(pdfFile('scan-0042.pdf'))
    await screen.findByText('scan-0042.pdf')
    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(sentUpload().description).toBe('Renewal signed in person')
    expect(onUploaded.mock.calls[0][0]).toMatchObject({ description: 'Renewal signed in person', fileName: 'scan-0042.pdf' })
  })

  it('stores no description when it is left blank or spaces, so the archive shows the file name', async () => {
    await openOnUnit102()
    chooseFile(pdfFile('scan-0043.pdf'))
    await screen.findByText('scan-0043.pdf')
    await userEvent.type(descriptionInput(), '   ')

    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(onUploaded.mock.calls[0][0]).toMatchObject({ description: null, fileName: 'scan-0043.pdf' })
  })

  it('offers the leases of the unit that was picked', async () => {
    renderDialog()
    expect(await screen.findByText('Choose a unit first.')).toBeInTheDocument()

    choose('Linked unit', 'Unit 201')

    const lease = await screen.findByRole('option', { name: /Kenji Sato/ })
    expect(lease).toHaveProperty('selected', true)
  })

  it('says when a unit has nothing to attach to and keeps the button disabled', async () => {
    renderDialog({ initialRoomId: roomId('101') })

    expect(await screen.findByText('This unit has no leases yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to library' })).toBeDisabled()
  })

  it('only offers OCR for contracts', async () => {
    await openOnUnit102()
    expect(screen.getByRole('button', { name: 'Preview extraction' })).toBeInTheDocument()

    choose('Document type', 'Receipt')

    await screen.findByRole('option', { name: /^RC-2026-0001/ })
    expect(screen.queryByRole('button', { name: 'Preview extraction' })).not.toBeInTheDocument()
  })

  it('still fills the OCR panel when asked to extract before a file is chosen', async () => {
    await openOnUnit102()

    await userEvent.click(screen.getByRole('button', { name: 'Preview extraction' }))

    expect(screen.getByText('Needs manual review')).toBeInTheDocument()
    expect(screen.getByLabelText('Tenant name')).toHaveValue('Yuki Tanaka')
    expect(screen.queryByText(/National ID/i)).not.toBeInTheDocument()
  })

  it('sends no description when the extraction was never used', async () => {
    await openOnUnit102()
    await userEvent.click(screen.getByRole('button', { name: 'Preview extraction' }))
    chooseFile(pdfFile('lease.pdf'))
    await screen.findByText('lease.pdf')

    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(sentUpload().description).toBe('')
  })

  it('carries corrections made to the extracted values into the description', async () => {
    await openOnUnit102()
    await userEvent.click(screen.getByRole('button', { name: 'Preview extraction' }))
    const tenant = screen.getByLabelText('Tenant name')
    await userEvent.clear(tenant)
    await userEvent.type(tenant, 'Yuki T.')
    const start = (screen.getByLabelText('Lease start') as HTMLInputElement).value

    await userEvent.click(screen.getByRole('button', { name: 'Use as description' }))
    chooseFile(pdfFile('lease.pdf'))
    await screen.findByText('lease.pdf')
    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(sentUpload().description).toBe(`Lease agreement · Yuki T. · from ${start}`)
  })

  it('sends the chosen owner and scan date, and nothing read by OCR besides the description', async () => {
    await openOnUnit102()
    await userEvent.click(screen.getByRole('button', { name: 'Preview extraction' }))
    chooseFile(pdfFile('lease.pdf'))
    await screen.findByText('lease.pdf')

    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    const sent = sentUpload()
    expect(sent).toMatchObject({ type: 'CONTRACT_SCAN', scanDate: todayInBangkok(), owner: { kind: 'LEASE', id: 1 } })
    expect(Object.keys(sent).sort()).toEqual(['description', 'file', 'owner', 'scanDate', 'type'])
  })

  it('keeps the form and shows the server message when the upload is refused', async () => {
    uploadSpy.mockRejectedValueOnce(new clientModule.ApiError(400, 'The scan date cannot be in the future'))
    await openOnUnit102()
    chooseFile(pdfFile('lease.pdf'))
    await screen.findByText('lease.pdf')

    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The scan date cannot be in the future')
    expect(screen.getByText('lease.pdf')).toBeInTheDocument()
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('closes from Cancel without uploading anything', async () => {
    await openOnUnit102()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(uploadSpy).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
  })
})

describe('UploadDocumentDialog owner lists and corrections', () => {
  it('puts the lease running today first, then the newest start, and names ended leases with their end date', async () => {
    const [base] = await fetchLeases()
    const leases: Lease[] = [
      { ...base, id: 71, tenantName: 'Ann Ended', startDate: '2024-01-01', endDate: '2024-12-31', status: 'ENDED' },
      { ...base, id: 72, tenantName: 'Ben Running', startDate: '2025-03-01', endDate: null, status: 'ACTIVE' },
      { ...base, id: 73, tenantName: 'Cai Next', startDate: daysFromToday(30), endDate: null, status: 'ACTIVE' },
      // เริ่มวันเดียวกับ Ann จึงเรียงด้วย id ใหม่สุดก่อน
      { ...base, id: 74, tenantName: 'Dee Ended', startDate: '2024-01-01', endDate: '2024-06-30', status: 'ENDED' },
    ]
    vi.spyOn(clientModule, 'fetchLeases').mockResolvedValue(leases)

    renderDialog({ initialRoomId: roomId('102') })

    await screen.findByRole('option', { name: /Ben Running/ })
    expect(ownerOptionTexts('Lease')).toEqual([
      `Ben Running · ${displayDate('2025-03-01')} – Indefinite`,
      `Cai Next · ${displayDate(daysFromToday(30))} – Indefinite`,
      `Dee Ended · ${displayDate('2024-01-01')} – ${displayDate('2024-06-30')} (ended)`,
      `Ann Ended · ${displayDate('2024-01-01')} – ${displayDate('2024-12-31')} (ended)`,
    ])
    expect(screen.getByRole('option', { name: /Ben Running/, selected: true })).toBeInTheDocument()
  })

  it('lists the maintenance tickets of the unit newest first with their status', async () => {
    const [base] = await fetchRoomMaintenance(roomId('106'))
    vi.spyOn(clientModule, 'fetchRoomMaintenance').mockResolvedValue([
      { ...base, id: 81, title: 'Old leak', status: 'DONE', reportedAt: '2026-01-05T09:00:00Z' },
      { ...base, id: 82, title: 'Broken light', status: 'OPEN', reportedAt: '2026-10-01T09:00:00Z' },
      { ...base, id: 83, title: 'Door sticks', status: 'IN_PROGRESS', reportedAt: '2026-10-01T09:00:00Z' },
    ])

    renderDialog({ initialType: 'MAINTENANCE_REPORT', initialRoomId: roomId('106') })

    await screen.findByRole('option', { name: /#83/ })
    expect(ownerOptionTexts('Maintenance ticket')).toEqual([
      '#83 Door sticks · In progress',
      '#82 Broken light · Open',
      '#81 Old leak · Done',
    ])
  })

  it('lists the receipts of every lease in the unit, newest billing month first', async () => {
    const [lease] = await fetchLeases()
    const [receipt] = await fetchReceipts()
    vi.spyOn(clientModule, 'fetchLeases').mockResolvedValue([
      { ...lease, id: 61 },
      { ...lease, id: 62 },
    ])
    const receiptsSpy = vi.spyOn(clientModule, 'fetchReceipts').mockImplementation(async (query) =>
      query?.leaseId === 61
        ? [{ ...receipt, id: 91, receiptNo: 'RC-2026-0091', billingMonth: '2026-03', tenantName: 'First Tenant' }]
        : [
            { ...receipt, id: 92, receiptNo: 'RC-2026-0092', billingMonth: '2026-09', tenantName: 'Second Tenant' },
            { ...receipt, id: 93, receiptNo: 'RC-2026-0093', billingMonth: '2026-09', tenantName: 'Second Tenant' },
          ],
    )

    renderDialog({ initialType: 'RECEIPT_SCAN', initialRoomId: roomId('102') })

    await screen.findByRole('option', { name: /^RC-2026-0091/ })
    expect(ownerOptionTexts('Receipt')).toEqual([
      'RC-2026-0093 · 2026-09 · Second Tenant',
      'RC-2026-0092 · 2026-09 · Second Tenant',
      'RC-2026-0091 · 2026-03 · First Tenant',
    ])
    expect(receiptsSpy).toHaveBeenCalledWith({ leaseId: 61 })
    expect(receiptsSpy).toHaveBeenCalledWith({ leaseId: 62 })
  })

  it('attaches the document to the lease the uploader picks instead of the preselected one', async () => {
    const next = await createLease({
      roomId: roomId('102'),
      tenantId: 6,
      startDate: daysFromToday(40),
      endDate: daysFromToday(400),
      billingCycle: 'MONTHLY',
    })
    await openOnUnit102()
    await screen.findByRole('option', { name: /Haruto Watanabe/ })

    choose('Lease', /Haruto Watanabe/)
    chooseFile(pdfFile('next-lease.pdf'))
    await screen.findByText('next-lease.pdf')
    await userEvent.click(screen.getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(sentUpload().owner).toEqual({ kind: 'LEASE', id: next.id })
  })

  it('says the units are still loading and keeps the unit list closed', () => {
    renderDialog({ rooms: null, roomsError: null })

    const unit = screen.getByLabelText('Linked unit')
    expect(unit).toBeDisabled()
    expect(within(unit).getByRole('option', { name: 'Loading units...' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says why the units could not be loaded instead of offering an empty list', () => {
    renderDialog({ rooms: null, roomsError: 'Could not load the units' })

    const unit = screen.getByLabelText('Linked unit')
    expect(unit).toBeDisabled()
    expect(within(unit).getByRole('option', { name: 'Units unavailable' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the units')
  })

  it('uses a corrected lease start date in the description', async () => {
    await openOnUnit102()
    await userEvent.click(screen.getByRole('button', { name: 'Preview extraction' }))

    fireEvent.change(screen.getByLabelText('Lease start'), { target: { value: '2026-02-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Use as description' }))

    expect(descriptionInput()).toHaveValue('Lease agreement · Yuki Tanaka · from 2026-02-01')
  })

  it('keeps the file chosen last even when an earlier file finishes its check later', async () => {
    let finishFirstCheck: (problem: string | null) => void = () => {}
    vi.spyOn(fileSignatureModule, 'checkUploadFile')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstCheck = resolve
          }),
      )
      .mockResolvedValueOnce(null)
    await openOnUnit102()

    chooseFile(pdfFile('first.pdf'))
    chooseFile(pdfFile('second.pdf'))
    expect(await screen.findByText('second.pdf')).toBeInTheDocument()
    await act(async () => finishFirstCheck(null))

    expect(screen.queryByText('first.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('second.pdf')).toBeInTheDocument()
  })
})
