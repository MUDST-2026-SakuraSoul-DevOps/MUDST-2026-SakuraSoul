import { useEffect, useState } from 'react'
import { Receipt, Download, X } from 'lucide-react'
import { baht } from '../format'

/**
 * ตรงกับเฟรม "Generate Receipt" popup ใน Figma — SSK-16
 * เด้งเป็น modal ตรงกลางจอ เมื่อกดไอคอนใบเสร็จ (Receipt icon) ในคอลัมน์
 * Actions ของหน้า Payment Management (frontend/src/pages/PaymentsPage.tsx —
 * ปุ่มที่มี aria-label="ดูใบแจ้งหนี้" อยู่แล้ว)
 *
 * คงดีไซน์เดิมตามภาพทุกอย่างตามที่ทีมยืนยัน ไม่ปรับเปลี่ยน: หัวข้อ "Generate
 * Receipt" + ปุ่มปิด, การ์ดใบเสร็จ (ชื่อหอพัก, เลขที่ใบเสร็จ, ผู้เช่า, ห้อง,
 * รอบบิล, วันครบกำหนด, ตารางรายการ, ยอดรวม, ป้าย Paid + วันที่ชำระ/ช่องทาง),
 * ปุ่ม Cancel (ขอบ) / Download (พื้นเข้ม)
 *
 * เป็น component ที่มี trigger (ไอคอนใบเสร็จ) ในตัวเอง เอาไปแทนที่ปุ่มเปล่า
 * เดิมใน PaymentsPage.tsx ได้เลยตอน wiring จริง — รอบนี้ยังไม่ได้แก้
 * PaymentsPage.tsx ตรงๆ (เหมือน ticket อื่นก่อนหน้านี้ที่ยังไม่ wiring เข้า
 * App.tsx/router/deps)
 *
 * backend ยังไม่มี endpoint payment/invoice เลยสักตัว (ดู README) ข้อมูลใน
 * ใบเสร็จเลยเป็น "ข้อมูลตัวอย่าง" (SAMPLE_RECEIPT) ไม่ใช่ข้อมูลจริง — พอมี
 * endpoint จริงค่อยเปลี่ยนมา fetch ข้อมูลใบเสร็จของแถวนั้น ๆ แทน
 *
 * แก้ตาม QA review (SSK-16):
 * 🔴 [1] ยอดรวมเดิมเป็นค่าคงที่พิมพ์มือ ไม่ตรงกับผลบวกจาก items เลย — ตอนนี้
 *     คำนวณจาก items จริงเสมอ (ดู totalAmount ด้านล่าง) ไม่มีทางเพี้ยนอีก
 * 🔴 [2] ปุ่ม Download เดิมกด แล้วปิด modal เฉย ๆ ทำให้เข้าใจผิดว่าได้ไฟล์ —
 *     เปลี่ยนเป็น disabled ไว้ก่อนจนกว่าจะมี endpoint จริง
 * 🔴 [3] อัตราค่าไฟ/น้ำ/ค่าเช่าตัวอย่างเดิมไม่ตรงกับ SSK-22/seed data —
 *     ปรับเป็นค่าไฟ 8.00/หน่วย, ค่าน้ำ 18.00/หน่วย, ค่าเช่าอยู่ในช่วง
 *     baseRent ของห้อง (3,500–3,800)
 * 🟠 [4] เพิ่มสัญลักษณ์ ฿ ทุกยอดเงิน (ใช้ baht() จาก src/format.ts ตัวเดียวกับ
 *     ที่ไฟล์อื่นในโปรเจกต์ใช้อยู่แล้ว)
 * 🟠 [5] เพิ่มรายการ Common area fee ตาม SSK-22
 * 🟠 [6] เพิ่ม role="dialog"/aria-modal + ปิดด้วยปุ่ม Esc ได้
 * 🟠 [7] เปลี่ยน key ของแถวรายการจากชื่อ item เป็น id กันชนกันตอนมีรายการ
 *     ประเภทเดียวกันซ้ำในบิลเดียว
 */

interface ReceiptLineItem {
  id: string
  item: string
  detail?: string
  usageValue?: number
  usageUnit?: string
  rate?: number
  amount: number
}

const SAMPLE_ITEMS: ReceiptLineItem[] = [
  { id: 'room-rent', item: 'Room rent', amount: 3800 },
  {
    id: 'common-area',
    item: 'Common area fee',
    detail: 'ค่าไฟ/น้ำ/อินเทอร์เน็ตส่วนกลาง ตามที่ตั้งไว้ใน SSK-22',
    amount: 500,
  },
  { id: 'electricity', item: 'Electricity', usageValue: 120, usageUnit: 'units', rate: 8, amount: 120 * 8 },
  { id: 'water', item: 'Water', usageValue: 15, usageUnit: 'units', rate: 18, amount: 15 * 18 },
  { id: 'appliance-fee', item: 'Appliance fee', detail: 'Refrigerator 5.9 cu.ft', amount: 3000 },
  {
    id: 'repair-charge',
    item: 'Repair charge',
    detail: 'Toilet replacement · MT-2026-0088',
    amount: 3500,
  },
]

const SAMPLE_RECEIPT = {
  receiptNo: 'RC-2026-1015',
  tenant: 'Somchai P.',
  unit: '101',
  billingMonth: 'October 2026',
  dueDate: '5 Nov 2026',
  items: SAMPLE_ITEMS,
  // คำนวณจาก items เสมอ ไม่ใช้ค่าคงที่พิมพ์มือ (แก้ QA #1)
  totalAmount: SAMPLE_ITEMS.reduce((sum, row) => sum + row.amount, 0),
  paidDate: '3 Nov 2026',
  paymentMethod: 'Bank transfer',
}

export function GenerateReceiptModal() {
  const [open, setOpen] = useState(false)

  // ปิดด้วย Esc ได้ (แก้ QA #6)
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label="ดูใบแจ้งหนี้"
        className="hover:text-ink"
        onClick={() => setOpen(true)}
      >
        <Receipt size={18} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-receipt-title"
            className="flex w-full max-w-lg flex-col gap-6 rounded-lg bg-white p-8 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="generate-receipt-title" className="text-2xl font-bold text-ink">
                Generate Receipt
              </h2>
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => setOpen(false)}
                className="text-body-muted hover:text-ink"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex flex-col gap-5 rounded-lg border border-[rgba(212,194,195,0.4)] p-6">
              <div className="flex flex-col items-center gap-1 border-b border-[rgba(212,194,195,0.3)] pb-4 text-center">
                <p className="text-lg font-semibold text-ink">Sakura Soul Apartment</p>
                <p className="text-sm text-body-muted">Payment Receipt</p>
              </div>

              <div className="flex flex-col gap-2 border-b border-[rgba(212,194,195,0.3)] pb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-body-muted">Receipt no.</span>
                  <span className="text-ink">{SAMPLE_RECEIPT.receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-body-muted">Tenant</span>
                  <span className="text-ink">{SAMPLE_RECEIPT.tenant}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-body-muted">Unit</span>
                  <span className="text-ink">{SAMPLE_RECEIPT.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-body-muted">Billing month</span>
                  <span className="text-ink">{SAMPLE_RECEIPT.billingMonth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-body-muted">Due date</span>
                  <span className="text-ink">{SAMPLE_RECEIPT.dueDate}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-2 text-xs font-medium tracking-[0.6px] text-body-muted uppercase">
                  <span>Item</span>
                  <span className="text-right">Usage</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Amount</span>
                </div>
                {SAMPLE_RECEIPT.items.map((row) => (
                  <div key={row.id} className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-ink">{row.item}</p>
                      {row.detail && <p className="text-xs text-body-muted">{row.detail}</p>}
                    </div>
                    <span className="text-right text-ink">
                      {row.usageValue != null ? `${row.usageValue} ${row.usageUnit}` : '—'}
                    </span>
                    <span className="text-right text-ink">{row.rate != null ? `฿${baht(row.rate)}` : '—'}</span>
                    <span data-testid="receipt-item-amount" className="text-right text-ink">
                      ฿{baht(row.amount)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] pt-4">
                <span className="text-lg text-ink">Total amount</span>
                <span data-testid="receipt-total-amount" className="font-heading text-3xl text-brand">
                  ฿{baht(SAMPLE_RECEIPT.totalAmount)}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] pt-4">
                <span className="inline-flex items-center rounded-sm bg-[#e8f5e9] px-2.5 py-1 text-xs font-medium text-[#2e7d32]">
                  Paid
                </span>
                <span className="text-sm text-body-muted">
                  {SAMPLE_RECEIPT.paidDate} · {SAMPLE_RECEIPT.paymentMethod}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-[rgba(212,194,195,0.5)] bg-white py-2.5 text-sm font-medium text-ink hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled
                title="ยังดาวน์โหลดไม่ได้ตอนนี้ รอ backend endpoint payment/invoice ก่อน"
                className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-[#5b3a3c] py-2.5 text-sm font-medium text-white opacity-50"
              >
                <Download size={16} />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
