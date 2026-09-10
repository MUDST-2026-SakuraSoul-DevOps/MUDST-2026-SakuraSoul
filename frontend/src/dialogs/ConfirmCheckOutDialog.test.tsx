import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, terminateLease } from '../api/client'
import type { Lease } from '../api/types'
import { ConfirmCheckOutDialog } from './ConfirmCheckOutDialog'

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    terminateLease: vi.fn(),
  }
})

const mockedTerminateLease = vi.mocked(terminateLease)

const activeLease: Lease = {
  id: 12,
  roomId: 2,
  roomNumber: '102',
  tenantId: 1,
  tenantName: 'ยูกิ ทานากะ',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: 3500,
  billingCycle: 'MONTHLY',
  status: 'ACTIVE',
}

function renderCheckOutDialog(lease: Lease = activeLease) {
  const onClose = vi.fn()
  const onDone = vi.fn()
  render(<ConfirmCheckOutDialog lease={lease} onClose={onClose} onDone={onDone} />)

  return {
    user: userEvent.setup(),
    onClose,
    onDone,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ConfirmCheckOutDialog', () => {
  it('renders the lease checkout confirmation details', () => {
    renderCheckOutDialog()

    // Test 1: Verify that the admin can review the target lease before cancelling it.
    expect(screen.getByRole('dialog', { name: 'ยืนยันเช็คเอาต์ห้อง 102' })).toBeInTheDocument()
    expect(screen.getByText('ยูกิ ทานากะ')).toBeInTheDocument()
    expect(screen.getByLabelText(/วันที่ย้ายออกจริง/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ไม่ใช่ตอนนี้' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ยืนยันเช็คเอาต์' })).toBeInTheDocument()
  })

  it('closes the dialog without terminating the lease when the admin cancels', async () => {
    const { user, onClose, onDone } = renderCheckOutDialog()

    // Test 2: Verify that backing out does not call the terminate lease API.
    await user.click(screen.getByRole('button', { name: 'ไม่ใช่ตอนนี้' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    expect(mockedTerminateLease).not.toHaveBeenCalled()
  })

  it('defaults the move-out date to today in Bangkok time', () => {
    // 2026-09-08T18:00:00Z is already 2026-09-09 in Bangkok.
    // This catches regressions where the dialog accidentally uses the UTC date.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T18:00:00Z'))

    renderCheckOutDialog()

    expect(screen.getByLabelText(/วันที่ย้ายออกจริง/)).toHaveValue('2026-09-09')
  })

  it('terminates the lease with the selected move-out date', async () => {
    mockedTerminateLease.mockResolvedValue({ ...activeLease, status: 'ENDED', endDate: '2026-05-15' })
    const { user, onClose, onDone } = renderCheckOutDialog()

    // Test 3: Verify that confirming checkout sends the chosen end date to the API.
    fireEvent.change(screen.getByLabelText(/วันที่ย้ายออกจริง/), {
      target: { value: '2026-05-15' },
    })
    await user.click(screen.getByRole('button', { name: 'ยืนยันเช็คเอาต์' }))

    await waitFor(() => {
      expect(mockedTerminateLease).toHaveBeenCalledWith(12, '2026-05-15')
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an API error and keeps the dialog open when termination fails', async () => {
    mockedTerminateLease.mockRejectedValue(new ApiError(500, 'ปิดสัญญาไม่สำเร็จจาก API'))
    const { user, onClose, onDone } = renderCheckOutDialog()

    // Test 4: Verify that a failed checkout is visible and does not close the dialog.
    await user.click(screen.getByRole('button', { name: 'ยืนยันเช็คเอาต์' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ปิดสัญญาไม่สำเร็จจาก API')
    expect(screen.getByRole('dialog', { name: 'ยืนยันเช็คเอาต์ห้อง 102' })).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
