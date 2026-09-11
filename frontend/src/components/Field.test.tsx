import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberField } from './Field'

/**
 * These tests come from a QA bug (SSK-90): NumberField hard-coded step="0.01"
 * even though it is a shared component. Pressing the spinner on Min Stock once
 * produced 49.98 instead of 49, and the check-in rent field had the same issue
 * (SSK-103).
 *
 * Testing here catches the shared root cause for every numeric field in the app.
 * If 0.01 is reintroduced, this fails before QA has to find it again.
 */
describe('NumberField', () => {
  it('defaults step to 1 instead of 0.01', () => {
    render(<NumberField label="Min Stock" value={50} onChange={() => {}} />)
    expect(screen.getByLabelText('Min Stock')).toHaveAttribute('step', '1')
  })

  it('allows callers to override step for real decimal fields', () => {
    render(<NumberField label="Rate" value={1} onChange={() => {}} step={0.5} />)
    expect(screen.getByLabelText('Rate')).toHaveAttribute('step', '0.5')
  })

  it('preserves the provided min value', () => {
    render(<NumberField label="Amount to add" value={1} onChange={() => {}} min={1} />)
    expect(screen.getByLabelText('Amount to add')).toHaveAttribute('min', '1')
  })
})
