import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UploadContractDialog } from './UploadContractDialog'
import type { Lease } from '../api/types'

describe('UploadContractDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const lease: Lease = {
    id: 42,
    roomId: 1,
    roomNumber: '101',
    tenantId: 1,
    tenantName: 'Somchai P.',
    billingCycle: 'MONTHLY',
    monthlyRent: 3500,
    securityDeposit: 7000,
    commonAreaFee: 300,
    internetFee: 200,
    waterRatePerUnit: 18,
    electricRatePerUnit: 8,
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    status: 'ACTIVE',
  }

  it('displays unit info, pre-attached file, allows removing and selecting new file, and uploads', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onUploaded = vi.fn()

    render(<UploadContractDialog lease={lease} onClose={onClose} onUploaded={onUploaded} />)

    expect(screen.getByText('Unit 101 · Somchai P.')).toBeInTheDocument()
    expect(screen.getByText('CT-0042-signed.pdf')).toBeInTheDocument()

    // Remove pre-attached file disables upload button
    fireEvent.click(screen.getByRole('button', { name: 'Remove attached contract' }))
    expect(screen.queryByText('CT-0042-signed.pdf')).not.toBeInTheDocument()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const newFile = new File(['signed contract'], 'new-contract.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [newFile] } })

    expect(screen.getByText('new-contract.pdf')).toBeInTheDocument()

    const uploadBtn = screen.getByRole('button', { name: /Upload/i })
    fireEvent.click(uploadBtn)

    vi.advanceTimersByTime(500)
    expect(onUploaded).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when Cancel or Close is clicked', () => {
    const onClose = vi.fn()
    render(<UploadContractDialog lease={lease} onClose={onClose} onUploaded={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
