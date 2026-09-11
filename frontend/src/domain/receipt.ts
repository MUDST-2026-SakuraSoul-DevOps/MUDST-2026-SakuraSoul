import { yenAmount } from '../format'
import { downloadTextFile } from '../lib/downloadFile'

export interface ReceiptLineItem {
  id: string
  item: string
  detail?: string
  usageValue?: number
  usageUnit?: string
  rate?: number
  amount: number
}

export interface ReceiptData {
  receiptNo: string
  tenant: string
  unit: string
  billingMonth: string
  dueDate: string
  items: ReceiptLineItem[]
  totalAmount: number
  status: 'Paid' | 'Pending' | 'Unpaid'
  paidDate?: string
  paymentMethod?: string
}

const DEFAULT_ITEMS: ReceiptLineItem[] = [
  { id: 'room-rent', item: 'Room rent', amount: 45000 },
  { id: 'electricity', item: 'Electricity', usageValue: 120, usageUnit: 'units', rate: 50, amount: 6000 },
  { id: 'water', item: 'Water', usageValue: 15, usageUnit: 'units', rate: 100, amount: 1500 },
  { id: 'appliance-fee', item: 'Appliance fee', detail: 'Refrigerator 5.9 cu.ft', amount: 3000 },
  { id: 'repair-charge', item: 'Repair charge', detail: 'Toilet replacement · MT-2026-0088', amount: 3500 },
]

export const SAMPLE_RECEIPT: ReceiptData = {
  receiptNo: 'RC-2026-1015',
  tenant: 'Somchai P.',
  unit: '101',
  billingMonth: 'October 2026',
  dueDate: '5 Nov 2026',
  items: DEFAULT_ITEMS,
  totalAmount: DEFAULT_ITEMS.reduce((sum, row) => sum + row.amount, 0),
  status: 'Paid',
  paidDate: '3 Nov 2026',
  paymentMethod: 'Bank transfer',
}

export function formatReceiptText(receipt: ReceiptData): string {
  const lines = [
    '========================================',
    '        Sakura Soul Apartment           ',
    '           Payment Receipt              ',
    '========================================',
    `Receipt No:     ${receipt.receiptNo}`,
    `Tenant:         ${receipt.tenant}`,
    `Unit:           ${receipt.unit}`,
    `Billing Month:  ${receipt.billingMonth}`,
    `Due Date:       ${receipt.dueDate}`,
    '----------------------------------------',
    'ITEM              USAGE     RATE    AMOUNT',
    '----------------------------------------',
  ]

  for (const item of receipt.items) {
    const itemStr = item.item.padEnd(16, ' ').slice(0, 16)
    const usageStr = (item.usageValue != null ? `${item.usageValue} ${item.usageUnit || ''}` : '—').padEnd(9, ' ').slice(0, 9)
    const rateStr = (item.rate != null ? yenAmount(item.rate) : '—').padEnd(8, ' ').slice(0, 8)
    const amountStr = yenAmount(item.amount).padStart(8, ' ')
    lines.push(`${itemStr} ${usageStr} ${rateStr} ${amountStr}`)
    if (item.detail) {
      lines.push(`  (${item.detail})`)
    }
  }

  lines.push('----------------------------------------')
  lines.push(`Total Amount:   ${yenAmount(receipt.totalAmount)}`)
  lines.push(`Status:         ${receipt.status}${receipt.paidDate ? ` (${receipt.paidDate} · ${receipt.paymentMethod || 'Bank transfer'})` : ''}`)
  lines.push('========================================')

  return lines.join('\n')
}

export function downloadReceipt(receipt: ReceiptData): void {
  const text = formatReceiptText(receipt)
  downloadTextFile(`${receipt.receiptNo}.txt`, text, 'text/plain;charset=utf-8')
}
