import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { todayInBangkok } from '../format'
import { pngFile, renamedExeFile } from '../test/files'

const receipt = { id: 1, receiptNo: 'RC-1', roomNumber: '101', tenantName: 'Tenant' }

function renderDialog(onRecord = vi.fn()) {
  render(<RecordPaymentDialog isOpen receipt={receipt} outstanding={1000} onClose={vi.fn()} onRecord={onRecord} />)
  return onRecord
}

function chooseSlip(file: File) {
  fireEvent.change(screen.getByLabelText('Payment slip (optional)'), { target: { files: [file] } })
}

it('blocks an empty or future date before attempting to record money', async () => {
  const onRecord = renderDialog()
  const date = screen.getByLabelText('Payment date')
  expect(date).toHaveAttribute('max', todayInBangkok())
  fireEvent.change(date, { target: { value: '2099-01-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The payment date cannot be in the future')
  expect(onRecord).not.toHaveBeenCalled()
  fireEvent.change(date, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Please choose the payment date')
  expect(onRecord).not.toHaveBeenCalled()
})

it('records OTHER with a trimmed note and passes no slip when none is chosen', async () => {
  const onRecord = renderDialog()
  fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'Other' } })
  fireEvent.change(screen.getByLabelText('Payment note'), { target: { value: '  Paid at reception  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
  await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1))
  expect(onRecord.mock.calls[0]).toEqual([expect.objectContaining({ method: 'Other', note: 'Paid at reception' })])
})

it('passes the checked slip to onRecord together with the payment (SSK-163)', async () => {
  const onRecord = renderDialog()
  const slip = pngFile('transfer-slip.png')
  chooseSlip(slip)
  expect(await screen.findByText('transfer-slip.png')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

  await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1))
  expect(onRecord.mock.calls[0]).toEqual([
    expect.objectContaining({ receiptId: 1, amount: 1000, method: 'Bank transfer', date: todayInBangkok() }),
    slip,
  ])
})

it('refuses a program renamed to .png and records the payment without it', async () => {
  const onRecord = renderDialog()
  chooseSlip(renamedExeFile('slip.png'))
  expect(await screen.findByText('Only PDF, PNG and JPEG files are allowed')).toBeInTheDocument()
  expect(screen.queryByText('slip.png')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
  await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1))
  expect(onRecord.mock.calls[0]).toHaveLength(1)
})

it('refuses a slip over 5 MB before anything is sent', async () => {
  renderDialog()
  chooseSlip(pngFile('huge.png', 5 * 1024 * 1024 + 1))
  expect(await screen.findByText('The file is larger than 5 MB')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Remove huge.png' })).not.toBeInTheDocument()
})

it('lets the chosen slip be removed again before recording', async () => {
  const onRecord = renderDialog()
  chooseSlip(pngFile('wrong-slip.png'))
  fireEvent.click(await screen.findByRole('button', { name: 'Remove wrong-slip.png' }))
  expect(screen.queryByText('wrong-slip.png')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
  await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1))
  expect(onRecord.mock.calls[0]).toHaveLength(1)
})
