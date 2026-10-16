import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

/*
  Pages pass onClose as an inline arrow function (onClose={() => setOpen(false)}),
  so every re-render of the page hands Modal a new onClose. The Modal must not treat
  that as "opened again": a page that finishes loading its data while the admin is
  typing in a dialog used to pull focus back to the dialog panel mid-word, and the
  rest of the keystrokes were lost (seen as E2E-LIVE-TENANT-002 saving a truncated name).
*/
function renderModal(onClose: () => void) {
  return (
    <Modal title="Tenant Information" onClose={onClose}>
      <label>
        Full name
        <input />
      </label>
    </Modal>
  )
}

describe('Modal', () => {
  it('moves focus into the dialog when it opens', () => {
    render(renderModal(() => {}))

    expect(screen.getByRole('dialog', { name: 'Tenant Information' })).toHaveFocus()
  })

  it('keeps focus in the field being typed in when the page re-renders with a new onClose', async () => {
    const user = userEvent.setup()
    const { rerender } = render(renderModal(() => {}))

    const field = screen.getByLabelText('Full name')
    await user.type(field, 'QA Ed')
    rerender(renderModal(() => {}))
    await user.keyboard('it')

    expect(field).toHaveFocus()
    expect(field).toHaveValue('QA Edit')
  })

  it('closes with Escape using the latest onClose after a re-render', async () => {
    const user = userEvent.setup()
    const firstOnClose = vi.fn()
    const latestOnClose = vi.fn()
    const { rerender } = render(renderModal(firstOnClose))

    rerender(renderModal(latestOnClose))
    await user.keyboard('{Escape}')

    expect(latestOnClose).toHaveBeenCalledTimes(1)
    expect(firstOnClose).not.toHaveBeenCalled()
  })
})
