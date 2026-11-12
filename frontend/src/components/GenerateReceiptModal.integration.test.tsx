import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import QRCode from 'qrcode'
import { GenerateReceiptModal } from './GenerateReceiptModal'
import { SAMPLE_RECEIPT } from '../domain/receipt'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cXI=') } }))
afterEach(() => vi.clearAllMocks())

it('does not invent a QR payload from bank configuration when the server did not return one', async () => {
  render(<GenerateReceiptModal isOpen trigger={false} receipt={{ ...SAMPLE_RECEIPT, status: 'Pending', promptPayPayload: null, bank: { bankName: 'Bank', accountName: 'Apartment', accountNumber: '1234567890', promptPayId: '0812345678' } }} />)
  await screen.findByText(/Bank.*1234567890/)
  await waitFor(() => expect(QRCode.toDataURL).not.toHaveBeenCalled())
})

it('renders only the exact PromptPay payload returned by the server', async () => {
  render(<GenerateReceiptModal isOpen trigger={false} receipt={{ ...SAMPLE_RECEIPT, status: 'Pending', promptPayPayload: 'server-payload', bank: null }} />)
  await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalledWith('server-payload', { width: 280, margin: 1 }))
})
