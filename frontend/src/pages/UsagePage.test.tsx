import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { resetMockStore } from '../api/mockApi'
import UsagePage from './UsagePage'

/**
 * SSK-181: หน้า Usage ใช้ร่วมกับกราฟรายห้อง/รายชั้นของ SSK-167 โหมดทั้งตึกเป็นค่าเริ่มต้น
 * เทสนี้วิ่งผ่าน backend จำลองทั้งสองโหมด
 */
beforeEach(() => resetMockStore())

describe('UsagePage', () => {
  it('opens on the whole building and switches to the floor and unit graph on the same page', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UsagePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Usage', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Whole building' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('heading', { name: 'Electricity consumption · whole building' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'By floor or unit' }))

    expect(screen.getByRole('button', { name: 'By floor or unit' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('heading', { name: 'Electricity consumption' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Range' })).not.toBeInTheDocument()
  })
})
