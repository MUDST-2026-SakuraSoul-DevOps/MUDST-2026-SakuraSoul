import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as clientModule from '../api/client'
import { UploadContractDialog } from './UploadContractDialog'
import type { Lease, ScannedDocument } from '../api/types'
import { todayInBangkok } from '../format'
import { pdfFile, renamedExeFile } from '../test/files'

/*
  Since SSK-161/172 (#227) this dialog uploads the real signed file as a CONTRACT_SCAN of the lease
  through POST /api/documents. There is no pre-attached sample file any more, the file is checked like
  the backend checks it (content, not name), and the parent closes the dialog when onUploaded runs.
  uploadDocument is replaced here because lease 42 does not exist in the mock backend; what this file
  checks is the request the dialog sends.
*/

describe('UploadContractDialog', () => {
  let uploadSpy: MockInstance<typeof clientModule.uploadDocument>

  beforeEach(() => {
    uploadSpy = vi.spyOn(clientModule, 'uploadDocument').mockResolvedValue({ id: 1 } as ScannedDocument)
  })

  afterEach(() => {
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

  function fileInput() {
    return document.querySelector('input[type="file"]') as HTMLInputElement
  }

  it('displays unit info, takes a real file, allows removing it, and uploads it as a contract scan', async () => {
    const onClose = vi.fn()
    const onUploaded = vi.fn()

    render(<UploadContractDialog lease={lease} onClose={onClose} onUploaded={onUploaded} />)

    expect(screen.getByText('Unit 101 · Somchai P.')).toBeInTheDocument()
    expect(screen.queryByText('CT-0042-signed.pdf')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Upload$/ })).toBeDisabled()

    // A program renamed to .pdf is refused before anything is sent
    fireEvent.change(fileInput(), { target: { files: [renamedExeFile('contract.pdf')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Only PDF, PNG and JPEG files are allowed')
    expect(screen.getByRole('button', { name: /^Upload$/ })).toBeDisabled()

    fireEvent.change(fileInput(), { target: { files: [pdfFile('old-contract.pdf')] } })
    expect(await screen.findByText('old-contract.pdf')).toBeInTheDocument()

    // Removing the attached file disables the upload button again
    fireEvent.click(screen.getByRole('button', { name: 'Remove attached contract' }))
    expect(screen.queryByText('old-contract.pdf')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Upload$/ })).toBeDisabled()

    fireEvent.change(fileInput(), { target: { files: [pdfFile('new-contract.pdf')] } })
    expect(await screen.findByText('new-contract.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Upload$/ }))

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(uploadSpy.mock.calls[0][0]).toMatchObject({
      type: 'CONTRACT_SCAN',
      scanDate: todayInBangkok(),
      description: 'Signed lease agreement',
      owner: { kind: 'LEASE', id: 42 },
    })
    expect(uploadSpy.mock.calls[0][0].file.name).toBe('new-contract.pdf')
    // The page closes the dialog from onUploaded, so it is not closed twice
    expect(onClose).not.toHaveBeenCalled()
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
