import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import DocumentsPage from './DocumentsPage'
import { resetMockStore } from '../api/mockApi'
import * as clientModule from '../api/client'
import { createLease, createReceipt, deleteDocument, fetchDocuments, fetchRooms } from '../api/client'
import { downloadBlob } from '../lib/downloadFile'
import { MAX_UPLOAD_BYTES } from '../lib/fileSignature'
import { todayInBangkok } from '../format'
import { pdfFile, pngFile, renamedExeFile } from '../test/files'

vi.mock('../lib/downloadFile', () => ({ downloadBlob: vi.fn() }))

/*
  หน้า Documents คุยกับ backend จำลองจริงทุกคำขอ (ไม่ stub client) เอกสารตัวอย่างสี่ฉบับ:
  สัญญาสแกนห้อง 102 (Yuki Tanaka), รายงานซ่อมห้อง 106 (รูป PNG), ใบเสร็จสแกนห้อง 102 (ไม่มีคำอธิบาย)
  และสัญญาที่จบแล้วของห้อง 103
*/
const LEASE_102 = 'Signed lease agreement'
const REPORT_106 = 'Technician report for the AC compressor'
const RECEIPT_102 = 'RC-2026-0001-stamped.pdf'
const LEASE_103 = 'Lease that ended last year'

function CurrentSearch() {
  return <div role="note" aria-label="Current search">{useLocation().search}</div>
}

async function renderDocumentsPage(initialEntry = '/documents') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/documents"
          element={
            <>
              <DocumentsPage />
              <CurrentSearch />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByText('Loading documents...')).not.toBeInTheDocument())
}

function rowTitles(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).queryAllByRole('cell')[0]?.querySelector('span')?.textContent ?? '')
}

/** เลือกตัวเลือกของ CustomSelect ผ่าน select ที่ซ่อนไว้ ด้วยข้อความที่ผู้ใช้เห็น */
function choose(label: string, optionText: string | RegExp, container: HTMLElement = document.body) {
  const select = within(container).getByLabelText(label) as HTMLSelectElement
  const option = within(select).getByRole('option', { name: optionText }) as HTMLOptionElement
  fireEvent.change(select, { target: { value: option.value } })
}

async function openUpload() {
  await userEvent.click(screen.getByRole('button', { name: /Upload document/i }))
  return screen.getByRole('dialog', { name: 'Upload document' })
}

async function chooseFile(dialog: HTMLElement, file: File) {
  fireEvent.change(within(dialog).getByLabelText('Document file'), { target: { files: [file] } })
}

beforeEach(() => {
  resetMockStore()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:document-preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(downloadBlob).mockClear()
})

describe('DocumentsPage list (SSK-172)', () => {
  it('shows the archive from the API with totals that ignore the filters', async () => {
    await renderDocumentsPage()

    expect(screen.getByRole('heading', { name: 'Document Library' })).toBeInTheDocument()
    expect(rowTitles()).toEqual([REPORT_106, RECEIPT_102, LEASE_102, LEASE_103])
    const card = (label: string) => screen.getByText(label).parentElement!
    expect(within(card('STORED DOCUMENTS')).getByText('4')).toBeInTheDocument()
    expect(within(card('CONTRACTS')).getByText('2')).toBeInTheDocument()
    expect(within(card('REPORTS & RECEIPTS')).getByText('2')).toBeInTheDocument()

    const lease = screen.getByText(LEASE_102).closest('tr')!
    expect(within(lease).getByText('Unit 102')).toBeInTheDocument()
    expect(within(lease).getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(within(lease).getByText(/lease-102-signed\.pdf/)).toBeInTheDocument()
    // ใบแจ้งซ่อมไม่มีผู้เช่า โชว์ว่าแนบกับใบไหนแทน
    expect(within(screen.getByText(REPORT_106).closest('tr')!).getByText('Maintenance ticket #1')).toBeInTheDocument()
    expect(screen.getByText(/up to 5 MB per file/)).toBeInTheDocument()
  })

  it('filters by type through the URL and keeps the totals', async () => {
    await renderDocumentsPage()

    await userEvent.click(screen.getByRole('button', { name: 'Contract tab' }))

    await waitFor(() => expect(rowTitles()).toEqual([LEASE_102, LEASE_103]))
    expect(screen.getByLabelText('Current search')).toHaveTextContent('?type=Contract')
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 2 of 4 documents')

    await userEvent.click(screen.getByRole('button', { name: 'Maintenance report tab' }))
    await waitFor(() => expect(rowTitles()).toEqual([REPORT_106]))

    await userEvent.click(screen.getByRole('button', { name: 'All documents tab' }))
    await waitFor(() => expect(rowTitles()).toHaveLength(4))
    expect(screen.getByLabelText('Current search')).toHaveTextContent(/^$/)
  })

  it('searches on the server after the user stops typing', async () => {
    await renderDocumentsPage()

    await userEvent.type(screen.getByRole('textbox', { name: 'Search documents' }), 'arisa')
    await waitFor(() => expect(rowTitles()).toEqual([LEASE_103]))

    await userEvent.click(screen.getByRole('button', { name: /Reset all filters/i }))
    expect(screen.getByRole('textbox', { name: 'Search documents' })).toHaveValue('')
    await waitFor(() => expect(rowTitles()).toHaveLength(4))
  })

  it('opens on the unit and type that another page links to', async () => {
    await renderDocumentsPage('/documents?type=Receipt&unit=102')

    expect(rowTitles()).toEqual([RECEIPT_102])
    expect(screen.getByLabelText('Filter by unit')).toHaveValue('102')

    choose('Filter by unit', 'All units')
    await waitFor(() => expect(screen.getByLabelText('Current search')).toHaveTextContent(/^\?type=Receipt$/))
  })

  it('shows nothing for a unit that does not exist', async () => {
    await renderDocumentsPage('/documents?unit=999')
    expect(screen.getByText('No matching documents found')).toBeInTheDocument()
  })
})

describe('DocumentsPage viewing and deleting (SSK-172)', () => {
  it('previews a PDF from the downloaded file and downloads it under its stored name', async () => {
    await renderDocumentsPage()

    await userEvent.click(screen.getByRole('button', { name: `View document ${LEASE_102}` }))

    const dialog = screen.getByRole('dialog', { name: LEASE_102 })
    const frame = await within(dialog).findByTitle(`File of ${LEASE_102}`)
    expect(frame).toHaveAttribute('src', 'blob:document-preview')
    expect(within(dialog).getByText('Lease #1')).toBeInTheDocument()
    expect(within(dialog).getByText(/lease-102-signed\.pdf/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Download file' }))
    expect(downloadBlob).toHaveBeenCalledWith('lease-102-signed.pdf', expect.anything())
    const blob = vi.mocked(downloadBlob).mock.calls[0][1]
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: LEASE_102 })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:document-preview')
  })

  it('shows an image scan as a picture', async () => {
    await renderDocumentsPage()

    await userEvent.click(screen.getByRole('button', { name: `View document ${REPORT_106}` }))

    expect(await screen.findByAltText(`Scan of ${REPORT_106}`)).toHaveAttribute('src', 'blob:document-preview')
  })

  it('deletes after confirmation and updates the list and totals', async () => {
    await renderDocumentsPage()

    await userEvent.click(screen.getByRole('button', { name: `Delete document ${LEASE_103}` }))
    const confirm = screen.getByRole('dialog', { name: 'Confirm Delete Document' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(rowTitles()).toEqual([REPORT_106, RECEIPT_102, LEASE_102]))
    expect(screen.getByRole('status')).toHaveTextContent(`Deleted document "${LEASE_103}"`)
    await waitFor(() => expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 3 of 3 documents'))
    expect((await fetchDocuments()).map((d) => d.description)).not.toContain(LEASE_103)
  })

  it('keeps the confirmation open with the server message when the delete fails', async () => {
    await renderDocumentsPage()
    const target = (await fetchDocuments()).find((d) => d.description === LEASE_103)!
    await deleteDocument(target.id)

    await userEvent.click(screen.getByRole('button', { name: `Delete document ${LEASE_103}` }))
    const confirm = screen.getByRole('dialog', { name: 'Confirm Delete Document' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

    expect(await within(confirm).findByRole('alert')).toHaveTextContent(`No document with id ${target.id}`)
    expect(screen.getByRole('dialog', { name: 'Confirm Delete Document' })).toBeInTheDocument()
  })

  it('cancels a delete without sending it and does not carry the last failure to the next document', async () => {
    await renderDocumentsPage()
    const target = (await fetchDocuments()).find((d) => d.description === LEASE_103)!
    await deleteDocument(target.id)
    await userEvent.click(screen.getByRole('button', { name: `Delete document ${LEASE_103}` }))
    const failed = screen.getByRole('dialog', { name: 'Confirm Delete Document' })
    await userEvent.click(within(failed).getByRole('button', { name: 'Delete' }))
    await within(failed).findByRole('alert')
    const deleteSpy = vi.spyOn(clientModule, 'deleteDocument')

    await userEvent.click(within(failed).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Confirm Delete Document' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: `Delete document ${LEASE_102}` }))

    const next = screen.getByRole('dialog', { name: 'Confirm Delete Document' })
    expect(within(next).getByText(LEASE_102)).toBeInTheDocument()
    expect(within(next).queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(within(next).getByRole('button', { name: 'Cancel' }))
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(rowTitles()).toContain(LEASE_102)
  })

  it('lets the user dismiss the message about a finished delete', async () => {
    await renderDocumentsPage()
    await userEvent.click(screen.getByRole('button', { name: `Delete document ${LEASE_103}` }))
    const confirm = screen.getByRole('dialog', { name: 'Confirm Delete Document' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`Deleted document "${LEASE_103}"`))

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss toast' }))

    expect(screen.queryByText(`Deleted document "${LEASE_103}"`)).not.toBeInTheDocument()
  })
})

describe('DocumentsPage uploading (SSK-161, SSK-172)', () => {
  it('uploads a real file attached to the chosen lease and shows it in the list', async () => {
    await renderDocumentsPage()
    const dialog = await openUpload()

    await chooseFile(dialog, pdfFile('lease-201.pdf'))
    expect(await within(dialog).findByText('lease-201.pdf')).toBeInTheDocument()
    choose('Linked unit', 'Unit 201', dialog)
    expect(await within(dialog).findByRole('option', { name: /Kenji Sato/ })).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/Description/), 'Renewed lease')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload document' })).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Uploaded "Renewed lease" to archive')
    const row = (await screen.findByText('Renewed lease')).closest('tr')!
    expect(within(row).getByText('Unit 201')).toBeInTheDocument()
    expect(within(row).getByText('Kenji Sato')).toBeInTheDocument()
    const saved = (await fetchDocuments()).find((d) => d.description === 'Renewed lease')
    expect(saved).toMatchObject({ type: 'CONTRACT_SCAN', scanDate: todayInBangkok(), owner: { kind: 'LEASE', id: 2 } })
  })

  it('checks the file content and size before sending', async () => {
    await renderDocumentsPage()
    const dialog = await openUpload()

    choose('Linked unit', 'Unit 102', dialog)
    await within(dialog).findByRole('option', { name: /Yuki Tanaka/ })

    await chooseFile(dialog, renamedExeFile('photo.png'))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Only PDF, PNG and JPEG files are allowed')

    await chooseFile(dialog, pdfFile('huge.pdf', MAX_UPLOAD_BYTES + 1))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('The file is larger than 5 MB'))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to library' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please choose a file')
    expect(await fetchDocuments()).toHaveLength(4)
  })

  it('keeps the form open with the server message when the upload is refused', async () => {
    await renderDocumentsPage()
    const dialog = await openUpload()

    await chooseFile(dialog, pdfFile('lease.pdf'))
    await within(dialog).findByText('lease.pdf')
    choose('Linked unit', 'Unit 102', dialog)
    await within(dialog).findByRole('option', { name: /Yuki Tanaka/ })
    fireEvent.change(within(dialog).getByLabelText('Scan date'), { target: { value: '2999-01-01' } })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to library' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The scan date cannot be in the future')
    expect(within(dialog).getByText('lease.pdf')).toBeInTheDocument()
  })

  it('offers the owners that match the document type, including closed tickets and ended leases', async () => {
    await renderDocumentsPage()
    const dialog = await openUpload()

    choose('Linked unit', 'Unit 103', dialog)
    expect(await within(dialog).findByRole('option', { name: /Arisa Fujimoto .*\(ended\)/ })).toBeInTheDocument()

    choose('Document type', 'Maintenance report', dialog)
    choose('Linked unit', 'Unit 106', dialog)
    expect(
      await within(dialog).findByRole('option', { name: '#1 AC compressor replacement · In progress' }),
    ).toBeInTheDocument()

    choose('Document type', 'Receipt', dialog)
    choose('Linked unit', 'Unit 102', dialog)
    expect(await within(dialog).findByRole('option', { name: /^RC-2026-0001 · .* · Yuki Tanaka$/ })).toBeInTheDocument()

    choose('Linked unit', 'Unit 105', dialog)
    expect(await within(dialog).findByText('This unit has no receipts yet.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add to library' })).toBeDisabled()
  })

  it('fills the description from the local OCR preview without a national ID', async () => {
    await renderDocumentsPage()
    const dialog = await openUpload()

    choose('Linked unit', 'Unit 102', dialog)
    await within(dialog).findByRole('option', { name: /Yuki Tanaka/ })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Preview extraction' }))

    expect(within(dialog).getByText('Needs manual review')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Tenant name')).toHaveValue('Yuki Tanaka')
    expect(within(dialog).queryByText(/National ID/i)).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use as description' }))
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue(
      `Lease agreement · Yuki Tanaka · from ${within(dialog).getByLabelText<HTMLInputElement>('Lease start').value}`,
    )
  })

  it('opens the upload form from a deep link with the type and unit chosen', async () => {
    await renderDocumentsPage('/documents?type=Receipt&unit=102&upload=1')

    const dialog = screen.getByRole('dialog', { name: 'Upload document' })
    expect(within(dialog).getByLabelText('Document type')).toHaveValue('RECEIPT_SCAN')
    expect(within(dialog).getByRole('option', { name: 'Unit 102', selected: true })).toBeInTheDocument()
    // หลายขั้นต่อกัน (สัญญา ใบเสร็จ อัปโหลด โหลดรายการใหม่) ตอนรันทั้งชุดเครื่องช้าจนค่ารอปริยาย 1 วินาทีไม่พอ
    const slow = { timeout: 3000 }
    expect(await within(dialog).findByRole('option', { name: /^RC-2026-0001/ }, slow)).toBeInTheDocument()

    await chooseFile(dialog, pngFile('stamped.png'))
    await within(dialog).findByText('stamped.png', undefined, slow)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to library' }))

    // ชื่อไฟล์ยังอยู่ในป็อปอัปจนกว่าป็อปอัปจะปิด ถ้าหาด้วยข้อความเฉย ๆ จะได้ node ในป็อปอัปที่กำลังหลุดจากหน้า
    // (เทสนี้เคยพังแบบนั้นตอนรันพร้อม coverage) จึงรอให้ป็อปอัปปิดก่อน แล้วหาในแถวของตารางใหม่ทุกรอบที่รอ
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload document' })).not.toBeInTheDocument(), slow)
    expect(screen.getByLabelText('Current search')).toHaveTextContent('?type=Receipt&unit=102')
    await waitFor(() => expect(screen.getByRole('row', { name: /stamped\.png/ })).toBeInTheDocument(), slow)
  })
})

function daysFromToday(days: number): string {
  const date = new Date(`${todayInBangkok()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/*
  เคสจากรีวิวก่อนเปิด PR แต่ละเคสทำซ้ำปัญหาที่รีวิวชี้ไว้ก่อนแก้
  select ที่ซ่อนอยู่ของ CustomSelect โฟกัสด้วยคีย์บอร์ดได้ ผู้ใช้คีย์บอร์ดจึงเลือกตัวเลือกว่างได้จริง
*/
describe('DocumentsPage edge cases found in review', () => {
  it('keeps the upload form alive when the empty document type option is chosen', async () => {
    await renderDocumentsPage()
    const dialog = await openUpload()

    fireEvent.change(within(dialog).getByLabelText('Document type'), { target: { value: '' } })

    expect(screen.getByRole('dialog', { name: 'Upload document' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Document type')).toHaveValue('CONTRACT_SCAN')
  })

  it('treats an empty unit filter as all units', async () => {
    await renderDocumentsPage('/documents?unit=')
    expect(rowTitles()).toHaveLength(4)

    fireEvent.change(screen.getByLabelText('Filter by unit'), { target: { value: '' } })
    await waitFor(() => expect(rowTitles()).toHaveLength(4))
    expect(screen.getByLabelText('Current search')).not.toHaveTextContent('unit=')
  })

  it('filters by the unit chosen in the list and keeps it in the URL', async () => {
    await renderDocumentsPage()

    choose('Filter by unit', 'Unit 102')

    await waitFor(() => expect(rowTitles()).toEqual([RECEIPT_102, LEASE_102]))
    expect(screen.getByLabelText('Current search')).toHaveTextContent(/^\?unit=102$/)
  })

  it('sends the unit filter to the server', async () => {
    await renderDocumentsPage('/documents?unit=102')
    expect(rowTitles()).toEqual([RECEIPT_102, LEASE_102])

    choose('Filter by unit', 'All units')
    await waitFor(() => expect(rowTitles()).toHaveLength(4))
  })

  it('does not close the upload form while the upload is running', async () => {
    const pending = new Promise<never>(() => {})
    vi.spyOn(clientModule, 'uploadDocument').mockReturnValue(pending)
    await renderDocumentsPage()
    const dialog = await openUpload()
    await chooseFile(dialog, pdfFile('lease.pdf'))
    await within(dialog).findByText('lease.pdf')
    choose('Linked unit', 'Unit 102', dialog)
    await within(dialog).findByRole('option', { name: /Yuki Tanaka/ })

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to library' }))
    expect(within(dialog).getByRole('button', { name: 'Uploading...' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }))

    expect(screen.getByRole('dialog', { name: 'Upload document' })).toBeInTheDocument()
  })

  it('does not leave rows of the previous filter under a filter that failed to load', async () => {
    await renderDocumentsPage()
    const real = clientModule.fetchDocuments
    vi.spyOn(clientModule, 'fetchDocuments').mockImplementation((query) =>
      query?.type === 'RECEIPT_SCAN' ? Promise.reject(new clientModule.ApiError(503, 'Archive offline')) : real(query),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Receipt tab' }))

    expect(await screen.findByText('Archive offline')).toBeInTheDocument()
    expect(screen.queryByText(LEASE_102)).not.toBeInTheDocument()
  })

  it('reports when the totals cannot be loaded instead of showing zero', async () => {
    const real = clientModule.fetchDocuments
    vi.spyOn(clientModule, 'fetchDocuments').mockImplementation((query) =>
      query === undefined ? Promise.reject(new clientModule.ApiError(503, 'Totals offline')) : real(query),
    )
    await renderDocumentsPage()

    expect(await screen.findByText('Totals offline')).toBeInTheDocument()
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 4 documents')
  })

  it('submits the owner of the type that is chosen last', async () => {
    await renderDocumentsPage()
    const dialog = await openUpload()
    await chooseFile(dialog, pdfFile('tap-201.pdf'))
    await within(dialog).findByText('tap-201.pdf')
    choose('Linked unit', 'Unit 201', dialog)
    await within(dialog).findByRole('option', { name: /Kenji Sato/ })

    choose('Document type', 'Maintenance report', dialog)
    await within(dialog).findByRole('option', { name: /#4 Bathroom tap dripping/ })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload document' })).not.toBeInTheDocument())
    const saved = (await fetchDocuments({ q: 'tap-201' }))[0]
    expect(saved).toMatchObject({ type: 'MAINTENANCE_REPORT', owner: { kind: 'MAINTENANCE_TICKET', id: 4 } })
  })

  it('attaches a receipt scan to the receipt, not to the lease with the same number', async () => {
    const receipt = await createReceipt({
      leaseId: 3,
      billingMonth: todayInBangkok().slice(0, 7),
      electricUnits: 10,
      waterUnits: 1,
    })
    await renderDocumentsPage('/documents?type=Receipt&unit=207&upload=1')
    const dialog = screen.getByRole('dialog', { name: 'Upload document' })
    await within(dialog).findByRole('option', { name: new RegExp(`^${receipt.receiptNo}`) })
    await chooseFile(dialog, pdfFile('stamped-207.pdf'))
    await within(dialog).findByText('stamped-207.pdf')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upload document' })).not.toBeInTheDocument())
    const saved = (await fetchDocuments({ q: 'stamped-207' }))[0]
    expect(saved.owner).toMatchObject({ kind: 'RECEIPT', id: receipt.id, roomNumber: '207' })
    expect(receipt.id).not.toBe(3)
  })

  it('preselects the lease that is running today over a later one in the same unit', async () => {
    const room102 = (await fetchRooms()).find((room) => room.roomNumber === '102')!
    await createLease({
      roomId: room102.id,
      tenantId: 6,
      startDate: daysFromToday(40),
      endDate: daysFromToday(400),
      billingCycle: 'MONTHLY',
    })
    await renderDocumentsPage('/documents?unit=102&upload=1')
    const dialog = screen.getByRole('dialog', { name: 'Upload document' })

    await within(dialog).findByRole('option', { name: /Haruto Watanabe/ })
    expect(within(dialog).getByRole('option', { name: /Yuki Tanaka/, selected: true })).toBeInTheDocument()
  })

  it('shows an error and keeps the button disabled when the owners cannot be loaded', async () => {
    vi.spyOn(clientModule, 'fetchLeases').mockRejectedValue(new clientModule.ApiError(503, 'Leases offline'))
    await renderDocumentsPage('/documents?unit=102&upload=1')
    const dialog = screen.getByRole('dialog', { name: 'Upload document' })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Leases offline')
    expect(within(dialog).getByRole('button', { name: 'Add to library' })).toBeDisabled()
  })

  it('shows why a file cannot be opened', async () => {
    await renderDocumentsPage()
    const target = (await fetchDocuments()).find((d) => d.description === LEASE_103)!
    await deleteDocument(target.id)

    await userEvent.click(screen.getByRole('button', { name: `View document ${LEASE_103}` }))

    const dialog = screen.getByRole('dialog', { name: LEASE_103 })
    expect(await within(dialog).findByText(`No attachment with id ${target.attachmentId}`)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Download file' })).toBeDisabled()
  })

  it('drops upload=1 from the URL when the deep-linked form is cancelled', async () => {
    await renderDocumentsPage('/documents?type=Receipt&upload=1')

    const dialog = screen.getByRole('dialog', { name: 'Upload document' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Upload document' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current search')).toHaveTextContent(/^\?type=Receipt$/)
  })

  it('SSK-172: applies both category and unit from a document-library URL', async () => {
    await renderDocumentsPage('/documents?type=Contract&unit=102')

    expect(screen.getByLabelText('Filter by unit')).toHaveValue('102')
    expect(rowTitles()).toEqual([LEASE_102])
    // สัญญาของห้องอื่นกับเอกสารชนิดอื่นของห้องเดียวกันต้องไม่ปน
    expect(screen.queryByText(LEASE_103)).not.toBeInTheDocument()
    expect(screen.queryByText(RECEIPT_102)).not.toBeInTheDocument()
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 of 4 documents')
  })
})
