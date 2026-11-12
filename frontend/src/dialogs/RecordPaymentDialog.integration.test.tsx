import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { todayInBangkok } from '../format'

const receipt = { id: 1, receiptNo: 'RC-1', roomNumber: '101', tenantName: 'Tenant' }
it('blocks an empty or future date before attempting to record money', async () => {
  const onRecord = vi.fn()
  render(<RecordPaymentDialog isOpen receipt={receipt} outstanding={1000} onClose={vi.fn()} onRecord={onRecord} />)
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

it('records OTHER with a note without offering a file that cannot be saved', async () => {
  const onRecord = vi.fn()
  render(<RecordPaymentDialog isOpen receipt={receipt} outstanding={1000} onClose={vi.fn()} onRecord={onRecord} />)
  fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'Other' } })
  fireEvent.change(screen.getByLabelText('Payment note'), { target: { value: '  Paid at reception  ' } })
  expect(screen.queryByLabelText('Payment proof (optional)')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
  await waitFor(() => expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ method: 'Other', note: 'Paid at reception' })))
})
