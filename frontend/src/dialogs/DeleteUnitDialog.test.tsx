import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeleteUnitDialog } from './DeleteUnitDialog'
import * as client from '../api/client'
import type { RoomSummary } from '../api/types'

describe('DeleteUnitDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const room: RoomSummary = {
    id: 10,
    roomNumber: '205',
    floor: 2,
    roomType: 'DOUBLE',
    baseRent: 5000,
    status: 'OCCUPIED',
    currentLease: {
      id: 99,
      tenantId: 3,
      tenantName: 'Nadia K.',
      startDate: '2026-01-01',
      endDate: null,
      monthlyRent: 5000,
      billingCycle: 'MONTHLY',
    },
    openMaintenanceCount: 0,
    openMaintenanceTitle: null,
  }

  it('deletes the room and calls onDeleted and onClose', async () => {
    const deleteSpy = vi.spyOn(client, 'deleteRoom').mockResolvedValue(undefined)
    const onClose = vi.fn()
    const onDeleted = vi.fn()

    render(<DeleteUnitDialog room={room} onClose={onClose} onDeleted={onDeleted} />)

    expect(screen.getByText(/Unit 205/)).toBeInTheDocument()
    expect(screen.getByText('Nadia K.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(10)
      expect(onDeleted).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('shows error message when deleteRoom fails and renders None without lease', async () => {
    vi.spyOn(client, 'deleteRoom').mockRejectedValue(new Error('Room has active lease'))
    const onClose = vi.fn()
    const onDeleted = vi.fn()

    render(
      <DeleteUnitDialog
        room={{ ...room, status: 'AVAILABLE', currentLease: null }}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    )

    expect(screen.getByText('None')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not delete the unit')
    })
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
