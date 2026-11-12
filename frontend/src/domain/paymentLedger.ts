import type { Receipt } from '../api/types'
import type { InvoiceBalances, PaymentRecord } from './paymentPhase2'
import { roundMoney } from './billing'

export function canEditReceipt(receipt: Receipt): boolean {
  return receipt.latest === true && !receipt.carriedToReceiptNo && receipt.status === 'PENDING' && receipt.paidAmount === 0
}

export function canRecordPayment(receipt: Receipt): boolean {
  return receipt.latest === true && (receipt.balanceDue ?? 0) > 0
}

export function invoiceBalances(receipt: Receipt): InvoiceBalances {
  return {
    currentCharges: roundMoney(receipt.totalAmount - (receipt.previousBalance ?? 0) - (receipt.interestAmount ?? 0)),
    carriedBalance: receipt.previousBalance ?? 0, lateInterest: receipt.interestAmount ?? 0,
    totalDue: receipt.totalAmount, totalPaid: receipt.paidAmount ?? receipt.settledAmount ?? 0,
    outstanding: receipt.balanceDue ?? receipt.outstandingAmount ?? 0,
    status: receipt.status === 'PAID' ? 'Paid' : receipt.overdue ? 'Overdue' : receipt.status === 'PARTIAL' ? 'Partially paid' : 'Pending',
  }
}

export function paymentHistory(receipts: Receipt[]): PaymentRecord[] {
  const latestActiveByLease = new Map<number, number>()
  for (const receipt of receipts) {
    for (const payment of receipt.payments ?? []) {
      if (!payment.voidedAt) latestActiveByLease.set(receipt.leaseId, Math.max(latestActiveByLease.get(receipt.leaseId) ?? 0, payment.id))
    }
  }
  return receipts.flatMap(receipt => (receipt.payments ?? []).map(payment => ({
    id: `PAY-${payment.id}`, paymentId: payment.id, receiptId: receipt.id, receiptNo: receipt.receiptNo,
    roomNumber: receipt.roomNumber, tenantName: receipt.tenantName, amount: payment.amount, date: payment.paidOn,
    method: payment.method === 'CASH' ? 'Cash' as const : payment.method === 'TRANSFER' ? 'Bank transfer' as const : payment.method === 'QR' ? 'PromptPay' as const : 'Other' as const,
    note: payment.note ?? undefined, status: payment.voidedAt ? 'Voided' as const : 'Paid' as const,
    canVoid: !payment.voidedAt && receipt.latest === true && latestActiveByLease.get(receipt.leaseId) === payment.id,
  }))).sort((a, b) => b.paymentId - a.paymentId)
}

export function paymentRevenue(records: PaymentRecord[], today: string) {
  const active = records.filter(record => record.status !== 'Voided')
  const monthly = active.filter(record => record.date.startsWith(today.slice(0, 7)))
  return {
    monthly: roundMoney(monthly.reduce((sum, record) => sum + record.amount, 0)),
    yearly: roundMoney(active.filter(record => record.date.startsWith(today.slice(0, 4))).reduce((sum, record) => sum + record.amount, 0)),
    monthlyCount: monthly.length,
  }
}
