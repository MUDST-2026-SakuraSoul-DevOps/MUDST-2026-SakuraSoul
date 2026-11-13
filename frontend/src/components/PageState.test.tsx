import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LoadingState, ErrorState, EmptyState } from './PageState'
import { ProfileAvatar } from './ProfileAvatar'

describe('PageState & ProfileAvatar', () => {
  it('renders LoadingState, ErrorState, and EmptyState with optional hint', () => {
    render(
      <div>
        <LoadingState label="Fetching data..." />
        <ErrorState message="Server unavailable" />
        <EmptyState title="No items" hint="Try adding one" />
        <EmptyState title="Only title" />
      </div>,
    )

    expect(screen.getByText('Fetching data...')).toBeInTheDocument()
    expect(screen.getByText('Server unavailable')).toBeInTheDocument()
    expect(screen.getByText('No items')).toBeInTheDocument()
    expect(screen.getByText('Try adding one')).toBeInTheDocument()
    expect(screen.getByText('Only title')).toBeInTheDocument()
  })

  it('renders ProfileAvatar initials fallback and hides broken images on error', () => {
    const { rerender } = render(<ProfileAvatar alt="Somchai P." size={48} />)
    expect(screen.getByText('SP')).toBeInTheDocument()

    rerender(<ProfileAvatar src="https://example.com/broken.png" alt="Somchai P." size={48} />)
    const img = screen.getByAltText('Somchai P.') as HTMLImageElement
    fireEvent.error(img)
    expect(img.style.display).toBe('none')
  })
})
