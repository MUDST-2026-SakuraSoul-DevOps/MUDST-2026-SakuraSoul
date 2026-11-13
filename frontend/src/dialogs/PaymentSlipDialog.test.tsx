import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '../api/client'
import * as files from '../lib/downloadFile'
import type { Attachment } from '../api/types'
import { pngFile } from '../test/files'
import { PaymentSlipDialog } from './PaymentSlipDialog'

/**
 * SSK-163: สลิปของการชำระ ดูสลิปล่าสุด สลับไปดูสลิปเก่า ดาวน์โหลด และแนบภายหลังได้
 * การชำระที่ void แล้วดูได้อย่างเดียว ป็อปอัปที่หน้าเปิดให้เองหลังอัปโหลดไม่ผ่านมี notice กับไฟล์เดิมมาด้วย
 * jsdom ไม่มี URL.createObjectURL จึงปลอมไว้ ไฟล์ที่ได้จาก server ใช้ spy ที่ client
 */
const payment = { paymentId: 42, label: 'PAY-42', roomNumber: '101', receiptNo: 'RC-1' }

function attachment(id: number, fileName: string, contentType: string): Attachment {
  return {
    id,
    ownerType: 'PAYMENT',
    ownerId: 42,
    fileName,
    contentType,
    sizeBytes: 2048,
    sha256: 'abc',
    uploadedAt: '2026-11-12T03:00:00Z',
    uploadedBy: 'admin',
    contentUrl: `/api/attachments/${id}/content`,
  }
}

const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:slip')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  vi.restoreAllMocks()
})

describe('PaymentSlipDialog', () => {
  it('opens the newest slip of the payment and switches to an older one', async () => {
    const list = vi
      .spyOn(api, 'fetchAttachments')
      .mockResolvedValue([attachment(8, 'slip-2.png', 'image/png'), attachment(5, 'slip-1.pdf', 'application/pdf')])
    const content = vi.spyOn(api, 'fetchAttachmentContent').mockResolvedValue(new Blob(['x']))
    render(<PaymentSlipDialog payment={payment} onClose={vi.fn()} />)

    expect(await screen.findByRole('img', { name: 'Payment slip slip-2.png' })).toHaveAttribute('src', 'blob:slip')
    expect(list).toHaveBeenCalledWith('PAYMENT', 42)
    expect(content).toHaveBeenLastCalledWith(8)

    fireEvent.click(within(screen.getByRole('group', { name: 'Attached slips' })).getByRole('button', { name: 'slip-1.pdf' }))

    expect(await screen.findByTitle('Payment slip slip-1.pdf')).toBeInTheDocument()
    expect(content).toHaveBeenLastCalledWith(5)
  })

  it('downloads the slip under its own file name', async () => {
    vi.spyOn(api, 'fetchAttachments').mockResolvedValue([attachment(8, 'slip-2.png', 'image/png')])
    const blob = new Blob(['png'])
    vi.spyOn(api, 'fetchAttachmentContent').mockResolvedValue(blob)
    const save = vi.spyOn(files, 'downloadBlob').mockImplementation(() => {})
    render(<PaymentSlipDialog payment={payment} onClose={vi.fn()} />)
    await screen.findByRole('img', { name: 'Payment slip slip-2.png' })

    fireEvent.click(screen.getByRole('button', { name: 'Download slip' }))

    expect(save).toHaveBeenCalledWith('slip-2.png', blob)
  })

  it('attaches a slip to a payment that has none and then shows it', async () => {
    const list = vi
      .spyOn(api, 'fetchAttachments')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([attachment(9, 'new-slip.png', 'image/png')])
    vi.spyOn(api, 'fetchAttachmentContent').mockResolvedValue(new Blob(['x']))
    const upload = vi.spyOn(api, 'uploadAttachment').mockResolvedValue(attachment(9, 'new-slip.png', 'image/png'))
    render(<PaymentSlipDialog payment={payment} onClose={vi.fn()} />)
    expect(await screen.findByText('No slip attached to this payment yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attach slip' })).toBeDisabled()

    const slip = pngFile('new-slip.png')
    fireEvent.change(screen.getByLabelText('Slip file to attach'), { target: { files: [slip] } })
    await screen.findByRole('button', { name: 'Remove new-slip.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Attach slip' }))

    expect(await screen.findByRole('img', { name: 'Payment slip new-slip.png' })).toBeInTheDocument()
    expect(upload).toHaveBeenCalledWith(slip, 'PAYMENT', 42)
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('says why the upload failed and keeps the chosen file', async () => {
    const list = vi.spyOn(api, 'fetchAttachments').mockResolvedValue([])
    vi.spyOn(api, 'uploadAttachment').mockRejectedValue(new api.ApiError(413, 'The file is larger than 5 MB'))
    render(<PaymentSlipDialog payment={payment} onClose={vi.fn()} />)
    await screen.findByText('No slip attached to this payment yet.')

    fireEvent.change(screen.getByLabelText('Slip file to attach'), { target: { files: [pngFile('slip.png')] } })
    await screen.findByRole('button', { name: 'Remove slip.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Attach slip' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The file is larger than 5 MB')
    expect(screen.getByText('slip.png')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Attach slip' })).toBeEnabled())
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('shows why the slips could not be loaded, does not offer to attach, and loads them again on Retry', async () => {
    const list = vi
      .spyOn(api, 'fetchAttachments')
      .mockRejectedValueOnce(new api.ApiError(503, 'Attachments are unavailable'))
      .mockResolvedValueOnce([attachment(8, 'slip-2.png', 'image/png')])
    vi.spyOn(api, 'fetchAttachmentContent').mockResolvedValue(new Blob(['x']))
    render(<PaymentSlipDialog payment={payment} onClose={vi.fn()} />)

    expect(await screen.findByText('Attachments are unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attach slip' })).not.toBeInTheDocument()
    expect(screen.queryByText('No slip attached to this payment yet.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('img', { name: 'Payment slip slip-2.png' })).toBeInTheDocument()
    expect(screen.queryByText('Attachments are unavailable')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('shows the slips of a voided payment but offers no way to attach another', async () => {
    vi.spyOn(api, 'fetchAttachments').mockResolvedValue([attachment(8, 'slip-2.png', 'image/png')])
    vi.spyOn(api, 'fetchAttachmentContent').mockResolvedValue(new Blob(['x']))
    const upload = vi.spyOn(api, 'uploadAttachment')
    render(<PaymentSlipDialog payment={{ ...payment, voided: true }} onClose={vi.fn()} />)

    expect(await screen.findByRole('img', { name: 'Payment slip slip-2.png' })).toBeInTheDocument()
    expect(
      screen.getByText('This payment was voided. Its slips stay here for the record and no new slip can be attached.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download slip' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Attach slip' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Slip file to attach')).not.toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('opens with the reason and the file that failed, and attaches that file on the first click', async () => {
    vi.spyOn(api, 'fetchAttachments').mockResolvedValue([])
    vi.spyOn(api, 'fetchAttachmentContent').mockResolvedValue(new Blob(['x']))
    const upload = vi.spyOn(api, 'uploadAttachment').mockResolvedValue(attachment(9, 'retry.png', 'image/png'))
    const slip = pngFile('retry.png')
    render(
      <PaymentSlipDialog payment={payment} notice="The slip was not uploaded: Attachments are unavailable." initialFile={slip} onClose={vi.fn()} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('The slip was not uploaded: Attachments are unavailable.')
    expect(await screen.findByRole('button', { name: 'Remove retry.png' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Attach slip' }))

    expect(await screen.findByText('Slip attached.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(upload).toHaveBeenCalledWith(slip, 'PAYMENT', 42)
  })

  it('replaces the notice with the new error when the retry fails too', async () => {
    vi.spyOn(api, 'fetchAttachments').mockResolvedValue([])
    vi.spyOn(api, 'uploadAttachment').mockRejectedValue(new api.ApiError(503, 'Still unavailable'))
    render(<PaymentSlipDialog payment={payment} notice="The slip was not uploaded." initialFile={pngFile('retry.png')} onClose={vi.fn()} />)
    await screen.findByText('No slip attached to this payment yet.')

    fireEvent.click(screen.getByRole('button', { name: 'Attach slip' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Still unavailable'))
    expect(screen.queryByText('The slip was not uploaded.')).not.toBeInTheDocument()
  })

  it('shows the slip it just attached even while an older one was open and the list cannot be reloaded', async () => {
    vi.spyOn(api, 'fetchAttachments')
      .mockResolvedValueOnce([attachment(8, 'slip-2.png', 'image/png'), attachment(5, 'slip-1.png', 'image/png')])
      .mockRejectedValueOnce(new api.ApiError(503, 'Attachments are unavailable'))
    vi.spyOn(api, 'fetchAttachmentContent').mockResolvedValue(new Blob(['x']))
    vi.spyOn(api, 'uploadAttachment').mockResolvedValue(attachment(12, 'slip-3.png', 'image/png'))
    render(<PaymentSlipDialog payment={payment} onClose={vi.fn()} />)
    await screen.findByRole('img', { name: 'Payment slip slip-2.png' })
    fireEvent.click(within(screen.getByRole('group', { name: 'Attached slips' })).getByRole('button', { name: 'slip-1.png' }))
    await screen.findByRole('img', { name: 'Payment slip slip-1.png' })

    fireEvent.change(screen.getByLabelText('Slip file to attach'), { target: { files: [pngFile('slip-3.png')] } })
    await screen.findByRole('button', { name: 'Remove slip-3.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Attach slip' }))

    expect(await screen.findByText('Attachments are unavailable')).toBeInTheDocument()
    expect(screen.getByText('Slip attached.')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Payment slip slip-3.png' })).toBeInTheDocument()
    const slips = within(screen.getByRole('group', { name: 'Attached slips' })).getAllByRole('button')
    expect(slips.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['slip-3.png', 'true'],
      ['slip-2.png', 'false'],
      ['slip-1.png', 'false'],
    ])
  })
})
