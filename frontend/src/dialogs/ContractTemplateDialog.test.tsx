import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContractTemplateDialog } from './ContractTemplateDialog'

describe('ContractTemplateDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders template content, available variables, toggles preview, and saves', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onSaved = vi.fn()

    render(<ContractTemplateDialog onClose={onClose} onSaved={onSaved} />)

    expect(screen.getByRole('dialog', { name: 'Contract Template' })).toBeInTheDocument()
    expect(screen.getByText('RESIDENTIAL LEASE AGREEMENT')).toBeInTheDocument()
    expect(screen.getAllByText('[CONTRACT_NO]').length).toBeGreaterThan(0)

    // Toggle preview button
    fireEvent.click(screen.getByRole('button', { name: 'Preview with sample data' }))

    // Save template
    fireEvent.click(screen.getByRole('button', { name: 'Save Template' }))
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()

    vi.advanceTimersByTime(400)
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when Cancel or Close button is clicked', () => {
    const onClose = vi.fn()
    render(<ContractTemplateDialog onClose={onClose} onSaved={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
