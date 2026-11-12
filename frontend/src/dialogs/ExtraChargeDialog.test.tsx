import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExtraChargeDialog } from './ExtraChargeDialog'
import * as client from '../api/client'
import type { RoomSummary } from '../api/types'

describe('ExtraChargeDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const rooms: RoomSummary[] = [
    {
      id: 1,
      roomNumber: '101',
      floor: 1,
      status: 'OCCUPIED',
      roomType: 'SINGLE',
      baseRent: 3500,
      currentLease: null,
      openMaintenanceCount: 0,
      openMaintenanceTitle: null,
    },
    {
      id: 2,
      roomNumber: '102',
      floor: 1,
      status: 'AVAILABLE',
      roomType: 'SINGLE',
      baseRent: 3500,
      currentLease: null,
      openMaintenanceCount: 0,
      openMaintenanceTitle: null,
    },
  ]

  it('validates description, toggles frequency, and handles API error and success', async () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()

    render(<ExtraChargeDialog rooms={rooms} roomId={1} onClose={onClose} onSaved={onSaved} />)

    // Submit empty description -> shows validation error
    fireEvent.click(screen.getByRole('button', { name: /Add charge/i }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Change room and frequency to ONE_TIME -> Last month hides
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'ONE_TIME' } })
    expect(screen.queryByLabelText(/Last month/i)).not.toBeInTheDocument()

    // Switch back to MONTHLY -> Last month shows
    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'MONTHLY' } })
    expect(screen.getByLabelText(/Last month/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Charge description'), { target: { value: 'Parking fee' } })
    fireEvent.change(screen.getByLabelText('Amount (฿)'), { target: { value: '600' } })
    fireEvent.change(screen.getByLabelText('First month'), { target: { value: '2027-01' } })
    fireEvent.change(screen.getByLabelText(/Last month/i), { target: { value: '2027-06' } })

    // Mock API failure first
    const createSpy = vi.spyOn(client, 'createExtraCharge').mockRejectedValueOnce(new Error('Network error'))
    fireEvent.click(screen.getByRole('button', { name: /Add charge/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not add the charge'))
    expect(onSaved).not.toHaveBeenCalled()

    // Mock API success
    createSpy.mockResolvedValueOnce({
      id: 99,
      roomId: 2,
      label: 'Parking fee',
      amount: 600,
      recurrence: 'MONTHLY',
      startMonth: '2027-01',
      endMonth: '2027-06',
      active: true,
    })
    fireEvent.click(screen.getByRole('button', { name: /Add charge/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
