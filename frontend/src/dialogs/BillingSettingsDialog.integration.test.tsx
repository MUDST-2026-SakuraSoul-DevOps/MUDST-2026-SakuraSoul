import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as api from '../api/client'
import type { ApartmentConfig } from '../api/types'
import { BillingSettingsDialog } from './BillingSettingsDialog'

const config: ApartmentConfig = {
  electricRatePerUnit: 8, waterRatePerUnit: 20, commonAreaFee: 0, internetFee: 0,
  updatedAt: '2026-11-13T00:00:00Z', lateInterestPercentPerMonth: 0, graceDays: 0, bank: null,
}
afterEach(() => vi.restoreAllMocks())

describe('Billing settings server integration', () => {
  it('keeps the form unavailable when loading fails and supports retry', async () => {
    vi.spyOn(api, 'fetchApartmentConfig').mockRejectedValueOnce(new api.ApiError(503, 'Config unavailable')).mockResolvedValue(config)
    const save = vi.spyOn(api, 'updateBankAccountConfig')
    render(<BillingSettingsDialog isOpen onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Config unavailable')
    expect(screen.queryByRole('button', { name: 'Save Settings' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('Bank name')).toHaveValue('')
    expect(save).not.toHaveBeenCalled()
  })

  it('does not overwrite either config section on an unchanged save', async () => {
    vi.spyOn(api, 'fetchApartmentConfig').mockResolvedValue(config)
    const bank = vi.spyOn(api, 'updateBankAccountConfig')
    const interest = vi.spyOn(api, 'updateLateInterestConfig')
    const onSaved = vi.fn()
    render(<BillingSettingsDialog isOpen onClose={vi.fn()} onSaved={onSaved} />)
    await screen.findByLabelText('Bank name')
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(bank).not.toHaveBeenCalled()
    expect(interest).not.toHaveBeenCalled()
  })

  it('saves only the edited section and shows server errors without closing', async () => {
    vi.spyOn(api, 'fetchApartmentConfig').mockResolvedValue(config)
    const bank = vi.spyOn(api, 'updateBankAccountConfig')
    const interest = vi.spyOn(api, 'updateLateInterestConfig').mockRejectedValueOnce(new Error('Interest update failed')).mockResolvedValue(config)
    const onClose = vi.fn()
    render(<BillingSettingsDialog isOpen onClose={onClose} onSaved={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Grace days'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Interest update failed')
    expect(onClose).not.toHaveBeenCalled()
    expect(bank).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(interest).toHaveBeenLastCalledWith({ lateInterestPercentPerMonth: 0, graceDays: 3 })
  })

  it('waits for both writes and retries only the section that failed', async () => {
    vi.spyOn(api, 'fetchApartmentConfig').mockResolvedValue(config)
    let finish!: (value: ApartmentConfig) => void
    const bank = vi.spyOn(api, 'updateBankAccountConfig').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const interest = vi.spyOn(api, 'updateLateInterestConfig').mockRejectedValueOnce(new Error('Interest update failed')).mockResolvedValue(config)
    const onClose = vi.fn()
    render(<BillingSettingsDialog isOpen onClose={onClose} onSaved={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Grace days'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Bank name'), { target: { value: 'Bank' } })
    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Apartment' } })
    fireEvent.change(screen.getByLabelText('Account number'), { target: { value: '1234567890' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    await waitFor(() => expect(interest).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
    finish(config)
    expect(await screen.findByRole('alert')).toHaveTextContent('Interest update failed')
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(bank).toHaveBeenCalledOnce()
    expect(interest).toHaveBeenCalledTimes(2)
  })
})
