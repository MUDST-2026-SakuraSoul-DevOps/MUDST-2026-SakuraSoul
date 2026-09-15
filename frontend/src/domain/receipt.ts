import { yenAmount } from '../format'
import { downloadDataUrl, downloadTextFile } from '../lib/downloadFile'

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

export function renderReceiptToCanvas(receipt: ReceiptData): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const width = 640
  const height = 760
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // Background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  // Outer border
  ctx.strokeStyle = '#eed9c4'
  ctx.lineWidth = 2
  ctx.strokeRect(20, 20, width - 40, height - 40)

  // Header Banner
  ctx.fillStyle = '#5b3a3c'
  ctx.fillRect(20, 20, width - 40, 60)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('SAKURA SOUL APARTMENT', width / 2, 56)

  ctx.fillStyle = '#795356'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('OFFICIAL PAYMENT RECEIPT', width / 2, 106)

  // Metadata Box
  ctx.fillStyle = '#FAF8F6'
  ctx.fillRect(40, 125, width - 80, 95)
  ctx.strokeStyle = '#eed9c4'
  ctx.lineWidth = 1
  ctx.strokeRect(40, 125, width - 80, 95)

  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'left'

  // Left column
  ctx.fillStyle = '#7A6B68'
  ctx.fillText('Receipt No:', 55, 150)
  ctx.fillStyle = '#1A1A1A'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(receipt.receiptNo, 145, 150)

  ctx.fillStyle = '#7A6B68'
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Tenant:', 55, 175)
  ctx.fillStyle = '#1A1A1A'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(receipt.tenant, 145, 175)

  ctx.fillStyle = '#7A6B68'
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Unit:', 55, 200)
  ctx.fillStyle = '#1A1A1A'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(receipt.unit, 145, 200)

  // Right column
  ctx.fillStyle = '#7A6B68'
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Billing Month:', 340, 150)
  ctx.fillStyle = '#1A1A1A'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(receipt.billingMonth, 440, 150)

  ctx.fillStyle = '#7A6B68'
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Due Date:', 340, 175)
  ctx.fillStyle = '#1A1A1A'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(receipt.dueDate, 440, 175)

  ctx.fillStyle = '#7A6B68'
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Status:', 340, 200)
  ctx.fillStyle = receipt.status === 'Paid' ? '#2E7D32' : '#F57F17'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(receipt.status, 440, 200)

  // Table header
  ctx.fillStyle = '#F6F3F2'
  ctx.fillRect(40, 235, width - 80, 28)
  ctx.fillStyle = '#7A6B68'
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('ITEM', 55, 253)
  ctx.textAlign = 'right'
  ctx.fillText('USAGE', 320, 253)
  ctx.fillText('RATE', 440, 253)
  ctx.fillText('AMOUNT', width - 55, 253)

  // Table rows
  let y = 285
  for (const item of receipt.items) {
    ctx.textAlign = 'left'
    ctx.fillStyle = '#1A1A1A'
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText(item.item, 55, y)

    if (item.detail) {
      ctx.fillStyle = '#888888'
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(item.detail, 55, y + 15)
    }

    ctx.textAlign = 'right'
    ctx.fillStyle = '#444444'
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText(item.usageValue != null ? `${item.usageValue} ${item.usageUnit || ''}` : '—', 320, y)
    ctx.fillText(item.rate != null ? yenAmount(item.rate) : '—', 440, y)

    ctx.fillStyle = '#1A1A1A'
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText(yenAmount(item.amount), width - 55, y)

    y += item.detail ? 36 : 28
  }

  // Total divider & Total
  ctx.strokeStyle = '#eed9c4'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(40, y + 10)
  ctx.lineTo(width - 40, y + 10)
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.fillStyle = '#1A1A1A'
  ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('TOTAL AMOUNT', 55, y + 38)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#5b3a3c'
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(yenAmount(receipt.totalAmount), width - 55, y + 40)

  // Status & Payment Note
  ctx.fillStyle = '#FAF8F6'
  ctx.fillRect(40, height - 105, width - 80, 45)
  ctx.strokeStyle = '#eed9c4'
  ctx.lineWidth = 1
  ctx.strokeRect(40, height - 105, width - 80, 45)

  ctx.textAlign = 'left'
  ctx.fillStyle = receipt.status === 'Paid' ? '#2E7D32' : '#F57F17'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(receipt.status === 'Paid' ? '✓ PAID' : '⚠ PENDING', 55, height - 77)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#7A6B68'
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const paidNote = receipt.paidDate ? `${receipt.paidDate} · ${receipt.paymentMethod || 'Bank transfer'}` : 'Awaiting Payment'
  ctx.fillText(paidNote, width - 55, height - 77)

  // Footer text
  ctx.textAlign = 'center'
  ctx.fillStyle = '#999999'
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Sakura Soul Apartment Management · Thank you for your stay', width / 2, height - 35)

  return canvas
}

export function downloadReceiptImage(receipt: ReceiptData): void {
  const canvas = renderReceiptToCanvas(receipt)
  let dataUrl: string | null
  try {
    dataUrl = canvas.toDataURL?.('image/png') ?? null
  } catch {
    dataUrl = null
  }
  const finalDataUrl =
    dataUrl ||
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  downloadDataUrl(`${receipt.receiptNo}.png`, finalDataUrl)
}




export function printReceiptPdf(receipt: ReceiptData): void {
  const printWindow = window.open('', '_blank', 'width=800,height=900')
  if (!printWindow) return

  const itemsHtml = receipt.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f2ece8;">
        <div class="item-name">${item.item}</div>
        ${item.detail ? `<div class="item-detail">${item.detail}</div>` : ''}
      </td>
      <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f2ece8; color: #444444; font-size: 12px;">
        ${item.usageValue != null ? `${item.usageValue} ${item.usageUnit || ''}` : '—'}
      </td>
      <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f2ece8; color: #444444; font-size: 12px;">
        ${item.rate != null ? yenAmount(item.rate) : '—'}
      </td>
      <td style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #f2ece8; font-weight: 700; color: #1a1a1a; font-size: 12px;">
        ${yenAmount(item.amount)}
      </td>
    </tr>
  `,
    )
    .join('')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt - ${receipt.receiptNo}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #2d2424;
            margin: 0;
            padding: 20px;
            background: #ffffff;
          }
          .receipt-container {
            max-width: 640px;
            margin: 0 auto;
            border: 2px solid #eed9c4;
            border-radius: 8px;
            overflow: hidden;
            background: #ffffff;
          }
          .header-banner {
            background-color: #5b3a3c !important;
            color: #ffffff !important;
            text-align: center;
            padding: 16px 20px;
          }
          .header-banner h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.8px;
            color: #ffffff !important;
          }
          .subheader {
            text-align: center;
            color: #795356 !important;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            padding: 14px 20px 6px;
          }
          .metadata-box {
            margin: 10px 24px 16px;
            background-color: #faf8f6 !important;
            border: 1px solid #eed9c4;
            border-radius: 6px;
            padding: 12px 18px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            font-size: 12px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .meta-label {
            color: #7a6b68;
            font-weight: 500;
          }
          .meta-value {
            color: #1a1a1a;
            font-weight: 700;
          }
          .items-table {
            width: calc(100% - 48px);
            margin: 0 24px;
            border-collapse: collapse;
          }
          .items-table thead {
            background-color: #f6f3f2 !important;
          }
          .items-table th {
            padding: 8px 12px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #7a6b68;
          }
          .item-name {
            font-weight: 600;
            color: #1a1a1a;
          }
          .item-detail {
            font-size: 11px;
            color: #888888;
            margin-top: 2px;
          }
          .total-divider {
            margin: 14px 24px 0;
            border-top: 1.5px solid #eed9c4;
            padding-top: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .total-label {
            font-size: 15px;
            font-weight: 700;
            color: #1a1a1a;
          }
          .total-amount {
            font-size: 22px;
            font-weight: 800;
            color: #5b3a3c !important;
          }
          .status-box {
            margin: 14px 24px;
            background-color: #faf8f6 !important;
            border: 1px solid #eed9c4;
            border-radius: 6px;
            padding: 10px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .status-badge {
            font-weight: 700;
            font-size: 12px;
          }
          .status-paid {
            color: #2e7d32 !important;
          }
          .status-pending {
            color: #f57f17 !important;
          }
          .payment-note {
            font-size: 12px;
            color: #7a6b68;
          }
          .footer-text {
            text-align: center;
            color: #999999;
            font-size: 11px;
            padding: 8px 24px 16px;
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header-banner">
            <h1>SAKURA SOUL APARTMENT</h1>
          </div>
          <div class="subheader">OFFICIAL PAYMENT RECEIPT</div>
          <div class="metadata-box">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div class="meta-row"><span class="meta-label">Receipt No:</span><span class="meta-value">${receipt.receiptNo}</span></div>
              <div class="meta-row"><span class="meta-label">Tenant:</span><span class="meta-value">${receipt.tenant}</span></div>
              <div class="meta-row"><span class="meta-label">Unit:</span><span class="meta-value">${receipt.unit}</span></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div class="meta-row"><span class="meta-label">Billing Month:</span><span class="meta-value">${receipt.billingMonth}</span></div>
              <div class="meta-row"><span class="meta-label">Due Date:</span><span class="meta-value">${receipt.dueDate}</span></div>
              <div class="meta-row"><span class="meta-label">Status:</span><span class="meta-value" style="color: ${receipt.status === 'Paid' ? '#2e7d32' : '#f57f17'};">${receipt.status}</span></div>
            </div>
          </div>
          <table class="items-table">
            <thead>
              <tr>
                <th style="text-align: left;">ITEM</th>
                <th style="text-align: right;">USAGE</th>
                <th style="text-align: right;">RATE</th>
                <th style="text-align: right;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="total-divider">
            <span class="total-label">TOTAL AMOUNT</span>
            <span class="total-amount">${yenAmount(receipt.totalAmount)}</span>
          </div>
          <div class="status-box">
            <span class="status-badge ${receipt.status === 'Paid' ? 'status-paid' : 'status-pending'}">
              ${receipt.status === 'Paid' ? '✓ PAID' : '⚠ PENDING'}
            </span>
            <span class="payment-note">
              ${receipt.paidDate ? `${receipt.paidDate} · ${receipt.paymentMethod || 'Bank transfer'}` : 'Awaiting Payment'}
            </span>
          </div>
          <div class="footer-text">
            Sakura Soul Apartment Management · Thank you for your stay
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

export function downloadReceipt(receipt: ReceiptData, format: 'pdf' | 'image' | 'text' = 'pdf'): void {
  if (format === 'image') {
    downloadReceiptImage(receipt)
  } else if (format === 'text') {
    const text = formatReceiptText(receipt)
    downloadTextFile(`${receipt.receiptNo}.txt`, text, 'text/plain;charset=utf-8')
  } else {
    printReceiptPdf(receipt)
  }
}

