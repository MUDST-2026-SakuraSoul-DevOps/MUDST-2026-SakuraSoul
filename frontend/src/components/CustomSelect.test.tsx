import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CustomSelect } from './CustomSelect'

describe('CustomSelect', () => {
  const stringOptions = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ]

  it('renders selected option label and placeholder when unmatched', () => {
    const { rerender } = render(
      <CustomSelect
        id="test-select"
        aria-label="Test select"
        value="b"
        onChange={() => {}}
        options={stringOptions}
      />,
    )
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Beta')

    rerender(
      <CustomSelect
        id="test-select"
        aria-label="Test select"
        value=""
        placeholder="Pick one"
        onChange={() => {}}
        options={stringOptions}
      />,
    )
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Pick one')
  })

  it('opens listbox on click, selects option, and closes', () => {
    const onChange = vi.fn()
    render(
      <CustomSelect
        aria-label="Test select"
        value="a"
        onChange={onChange}
        options={stringOptions}
      />,
    )

    const trigger = screen.getByRole('button', { expanded: false })
    fireEvent.click(trigger)
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(within(listbox).getByRole('option', { name: 'Gamma' }))
    expect(onChange).toHaveBeenCalledWith('c')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape key and click outside', () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <CustomSelect
          aria-label="Test select"
          value="a"
          onChange={() => {}}
          options={stringOptions}
        />
      </div>,
    )

    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('supports numeric values via hidden native select and dark variant', () => {
    const onChange = vi.fn()
    render(
      <CustomSelect<number>
        id="num-select"
        aria-label="Number select"
        variant="dark"
        value={1}
        onChange={onChange}
        options={[
          { value: 1, label: 'One' },
          { value: 2, label: 'Two' },
        ]}
      />,
    )

    const nativeSelect = screen.getByLabelText('Number select')
    fireEvent.change(nativeSelect, { target: { value: '2' } })
    expect(onChange).toHaveBeenCalledWith(2)

    fireEvent.click(screen.getByRole('button'))
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'One' })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not open when disabled', () => {
    render(
      <CustomSelect
        aria-label="Disabled select"
        value="a"
        disabled
        onChange={() => {}}
        options={stringOptions}
      />,
    )

    const trigger = screen.getByRole('button')
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
