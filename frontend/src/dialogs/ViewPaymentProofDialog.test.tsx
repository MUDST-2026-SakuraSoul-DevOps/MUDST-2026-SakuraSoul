import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ViewPaymentProofDialog } from './ViewPaymentProofDialog'
import type { PaymentRecord } from '../domain/paymentPhase2'

describe('ViewPaymentProofDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const baseRecord: PaymentRecord = {
    id: 'PAY-101',
    receiptId: 10,
    receiptNo: 'RC-2026-0010',
    roomNumber: '201',
    tenantName: 'Kenji Sato',
    amount: 4000,
    date: '2026-10-08',
    method: 'Bank transfer',
    slipName: 'slip-201.png',
    slipUrl: 'data:image/png;base64,fake',
  }

  it('renders nothing when record is null', () => {
    const { container } = render(<ViewPaymentProofDialog record={null} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders Mobile E-Slip image when slipUrl is present and switches to PDF mode', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<ViewPaymentProofDialog record={baseRecord} onClose={() => {}} />)

    expect(screen.getByAltText('Proof slip for receipt PAY-101')).toHaveAttribute('src', 'data:image/png;base64,fake')
    expect(screen.getByText('slip-201.png')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /PDF Document/i }))
    expect(screen.getByTitle('Payment Slip PDF - PAY-101')).toHaveAttribute('src', 'blob:pdf-url')
    expect(screen.getByText('slip-201.pdf')).toBeInTheDocument()
  })

  it('defaults to PDF mode when slipUrl is absent and shows empty state in Mobile E-Slip mode', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const noSlipRecord: PaymentRecord = {
      ...baseRecord,
      slipUrl: undefined,
      slipName: undefined,
    }
    render(<ViewPaymentProofDialog record={noSlipRecord} onClose={() => {}} />)

    expect(screen.getByTitle('Payment Slip PDF - PAY-101')).toBeInTheDocument()
    expect(screen.getByText('PAY-101.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Mobile E-Slip/i }))
    expect(screen.getByText('No payment proof uploaded')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /View PDF Document/i }))
    expect(screen.getByTitle('Payment Slip PDF - PAY-101')).toBeInTheDocument()
  })

  it('downloads PDF slip and shows notice, prints slip, and closes', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dl-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const onClose = vi.fn()

    render(<ViewPaymentProofDialog record={baseRecord} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Download slip' }))
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Downloaded PDF slip for slip-201\.png!/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Print slip' }))
    const hiddenIframes = document.querySelectorAll('iframe')
    const printIframe = hiddenIframes[hiddenIframes.length - 1]
    expect(printIframe).toBeTruthy()
    printIframe.dispatchEvent(new Event('load'))

    fireEvent.click(screen.getByRole('button', { name: 'Close proof dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
