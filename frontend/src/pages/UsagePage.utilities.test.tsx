import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { resetMockStore } from '../api/mockApi'
import UsagePage from './UsagePage'

beforeEach(() => resetMockStore())

async function renderUsage() {
  const user = userEvent.setup()
  render(<MemoryRouter><UsagePage /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: 'By floor or unit' }))
  await screen.findByRole('button', { name: 'Import usage CSV' })
}

describe('SSK-166 import water and electricity usage', () => {
  it('reviews a CSV with a bad row, imports the valid rows, and lists them', async () => {
    const user = userEvent.setup()
    await renderUsage()
    const month = new Date().toISOString().slice(0, 7)

    await user.click(await screen.findByRole('button', { name: 'Import usage CSV' }))
    const dialog = await screen.findByRole('dialog')
    const file = new File(
      [`room_number,month,electric_units,water_units
101,${month},142.5,12
999,${month},1,1
`],
      'usage.csv',
      { type: 'text/csv' },
    )
    await user.upload(within(dialog).getByLabelText(/Choose CSV file/), file)
    await user.click(within(dialog).getByRole('button', { name: 'Review rows' }))

    expect(await within(dialog).findByText('Line 3: Unit 999 does not exist')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Import 1 rows' }))
    expect(await within(dialog).findByText('Import complete')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'View usage' }))

    const monthInput = screen.getByLabelText('Month')
    fireEvent.change(monthInput, { target: { value: month } })
    const row = (await screen.findByText('142.5')).closest('tr')!
    expect(within(row).getByText('101')).toBeInTheDocument()
    expect(within(row).getByText('CSV import')).toBeInTheDocument()
  })
})

describe('SSK-167 water and electricity graph', () => {
  it('shows the chart with totals and lets you switch utility, scope and period', async () => {
    const user = userEvent.setup()
    await renderUsage()

    expect(await screen.findByRole('img', { name: /Electricity usage for Floor 1/ })).toBeInTheDocument()
    expect(screen.getByText('Electricity usage').parentElement).toHaveTextContent('kWh')

    await user.click(screen.getByRole('button', { name: 'Water' }))
    await user.selectOptions(screen.getByLabelText('View'), 'building')
    await user.selectOptions(screen.getByLabelText('Period'), 'year')

    expect(await screen.findByRole('img', { name: /Water usage for Whole building/ })).toBeInTheDocument()
    expect(screen.getByText('Water usage').parentElement).toHaveTextContent('m³')
    const details = screen.getByText('View usage data table').closest('details')!
    await user.click(screen.getByText('View usage data table'))
    expect(within(details).getByRole('columnheader', { name: 'WATER (m³)' })).toBeInTheDocument()
    expect(within(details).getByRole('columnheader', { name: 'PERIOD' })).toBeInTheDocument()
  })

  // AC 5: a selection with no data shows an empty state, not an error
  it('shows how to import data when the range has no usage', async () => {
    await renderUsage()
    await screen.findByRole('img', { name: /Electricity usage/ })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2099-12' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2099-01' } })
    expect(await screen.findByText(/No usage recorded for this selection yet/)).toBeInTheDocument()
  })
})
