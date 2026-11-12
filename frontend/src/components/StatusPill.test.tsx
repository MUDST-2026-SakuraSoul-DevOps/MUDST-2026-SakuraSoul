import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('renders dash when status is undefined', () => {
    render(<StatusPill />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('renders Active, Pending, and Overdue badges', () => {
    const { rerender } = render(<StatusPill status="Active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()

    rerender(<StatusPill status="Pending" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()

    rerender(<StatusPill status="Overdue" />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })
})
