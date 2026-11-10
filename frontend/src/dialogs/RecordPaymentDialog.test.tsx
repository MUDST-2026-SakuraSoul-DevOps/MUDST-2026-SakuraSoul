import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import * as paymentPhase2 from '../domain/paymentPhase2'

describe('RecordPaymentDialog file size checks', () => {
  const mockReceipt = {
    id: 101,
    receiptNo: 'INV-2026-101',
    roomNumber: '101',
    tenantName: 'Kenji Sato',
    totalAmount: 5000,
  }

  it('rejects PDF file larger than 350 KB at the first gate', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const pdf500k = new File([new ArrayBuffer(500 * 1024)], 'statement.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [pdf500k] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PDF file size exceeds 350 KB limit (500 KB). Please select a smaller file.',
    )
  })

  // Round 5 Issue: 1 MB PDF without mock must hit the 350 KB gate directly
  it('rejects 1 MB PDF at the first gate without mocking compressImageSlip', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const real1MbPdf = new File([new ArrayBuffer(1024 * 1024)], 'bank_statement_1mb.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [real1MbPdf] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PDF file size exceeds 350 KB limit (1.0 MB). Please select a smaller file.',
    )
  })

  it('allows small PDF under 350 KB without mocking compressImageSlip', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const smallPdf = new File([new ArrayBuffer(50 * 1024)], 'small_receipt.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [smallPdf] } })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/Attached: small_receipt.pdf/i)).toBeInTheDocument()
    })
  })

  it('allows image file between 2 MB and 10 MB because canvas compresses it', async () => {
    vi.spyOn(paymentPhase2, 'compressImageSlip').mockResolvedValue('data:image/jpeg;base64,mockSmallData')

    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const phonePhoto = new File([new ArrayBuffer(4 * 1024 * 1024)], 'phone_slip.jpg', {
      type: 'image/jpeg',
    })

    fireEvent.change(fileInput, { target: { files: [phonePhoto] } })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/Attached: phone_slip.jpg/i)).toBeInTheDocument()
    })
  })

  it('rejects image file larger than 10 MB', async () => {
    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const hugeImage = new File([new ArrayBuffer(12 * 1024 * 1024)], 'huge_photo.png', {
      type: 'image/png',
    })

    fireEvent.change(fileInput, { target: { files: [hugeImage] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Image file size exceeds 10 MB limit (12.0 MB). Please select a smaller file.',
    )
  })

  it('rejects file post-compression if resulting data URL exceeds 500 KB', async () => {
    const hugeDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(600 * 1024)
    vi.spyOn(paymentPhase2, 'compressImageSlip').mockResolvedValue(hugeDataUrl)

    render(
      <RecordPaymentDialog
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        outstanding={5000}
        onRecord={vi.fn()}
      />,
    )

    const fileInput = screen.getByLabelText(/Payment proof \(optional\)/i)
    const file = new File([new ArrayBuffer(100 * 1024)], 'uncompressed.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'File is too large to store in browser archive. Please select a smaller PDF or an image.',
    )
  })
})
