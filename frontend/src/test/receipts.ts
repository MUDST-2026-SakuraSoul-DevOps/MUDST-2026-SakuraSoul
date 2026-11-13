import type { ReceiptData } from '../domain/receipt'

/**
 * ใบเสร็จตัวอย่างสำหรับเทสของป็อปอัปใบเสร็จและตัวสร้าง PDF
 * เดิมเป็นค่าตั้งต้นของ GenerateReceiptModal (SSK-179 ย้ายมาไว้ฝั่งเทส ป็อปอัปรับใบจาก API เสมอ)
 * ยอดคิดด้วยมือ: 45,000 + 120 × 50 + 15 × 100 + 3,000 + 3,500 = 59,000
 */
export const SAMPLE_RECEIPT: ReceiptData = {
  receiptNo: 'RC-2026-1015',
  tenant: 'Somchai P.',
  unit: '101',
  billingMonth: 'October 2026',
  dueDate: '5 Nov 2026',
  items: [
    { id: 'room-rent', item: 'Room rent', amount: 45000 },
    { id: 'electricity', item: 'Electricity', usageValue: 120, usageUnit: 'units', rate: 50, amount: 6000 },
    { id: 'water', item: 'Water', usageValue: 15, usageUnit: 'units', rate: 100, amount: 1500 },
    { id: 'appliance-fee', item: 'Appliance fee', detail: 'Refrigerator 5.9 cu.ft', amount: 3000 },
    { id: 'repair-charge', item: 'Repair charge', detail: 'Toilet replacement · MT-2026-0088', amount: 3500 },
  ],
  totalAmount: 59000,
  status: 'Paid',
  paidDate: '3 Nov 2026',
  paymentMethod: 'Bank transfer',
}
