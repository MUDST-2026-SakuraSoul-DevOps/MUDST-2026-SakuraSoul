import { useState } from 'react'
import { Receipt, Download, X } from 'lucide-react'

/**
 * ตรงกับเฟรม "Generate Receipt" popup ใน Figma — SSK-16
 * เด้งเป็น modal ตรงกลางจอ เมื่อกดไอคอนใบเสร็จ (Receipt icon) ในคอลัมน์
 * Actions ของหน้า Payment Management (frontend/src/pages/PaymentsPage.tsx —
 * ปุ่มที่มี aria-label="ดูใบแจ้งหนี้" อยู่แล้ว)
 *
 * คงดีไซน์เดิมตามภาพทุกอย่างตามที่ทีมยืนยัน ไม่ปรับเปลี่ยน: หัวข้อ "Generate
 * Receipt" + ปุ่มปิด, การ์ดใบเสร็จ (ชื่อหอพัก, เลขที่ใบเสร็จ, ผู้เช่า, ห้อง,
 * รอบบิล, วันครบกำหนด, ตารางรายการ Room rent/Electricity/Water/Appliance
 * fee/Repair charge, ยอดรวม, ป้าย Paid + วันที่ชำระ/ช่องทาง), ปุ่ม
 * Cancel (ขอบ) / Download (พื้นเข้ม)
 *
 * เป็น component ที่มี trigger (ไอคอนใบเสร็จ) ในตัวเอง เอาไปแทนที่ปุ่มเปล่า
 * เดิมใน PaymentsPage.tsx ได้เลยตอน wiring จริง — รอบนี้ยังไม่ได้แก้
 * PaymentsPage.tsx ตรงๆ (เหมือน ticket อื่นก่อนหน้านี้ที่ยังไม่ wiring เข้า
 * App.tsx/router/deps)
 *
 * backend ยังไม่มี endpoint payment/invoice เลยสักตัว (ดู README) ข้อมูลใน
 * ใบเสร็จเลยเป็น "ข้อมูลตัวอย่างจาก Figma ตรง ๆ" (SAMPLE_RECEIPT) ไม่ใช่ข้อมูล
 * จริง ปุ่ม Download เลยยังไม่ได้ต่อ logic สร้างไฟล์จริง — พอมี endpoint จริง
 * ค่อยเปลี่ยนมา fetch ข้อมูลใบเสร็จของแถวนั้น ๆ แทน
 */

interface ReceiptLineItem {
  item: string
  detail?: string
  usage?: string
  rate?: string
  amount: string
}

const SAMPLE_RECEIPT = {
  receiptNo: 'RC-2026-1015',
  tenant: 'Somchai P.',
  unit: '101',
  billingMonth: 'October 2026',
  dueDate: '5 Nov 2026',
  items: [
    { item: 'Room rent', amount: '45,000.00' },
    { item: 'Electricity', usage: '120 units', rate: '50.00', amount: '6,000.00' },
    { item: 'Water', usage: '15 units', rate: '100.00', amount: '1,500.00' },
    { item: 'Appliance fee', detail: 'Refrigerator 5.9 cu.ft', amount: '3,000.00' },
    { item: 'Repair charge', detail: 'Toilet replacement · MT-2026-0088', amount: '3,500.00' },
  ] as ReceiptLineItem[],
  totalAmount: '56,700.00',
  paidDate: '3 Nov 2026',
  paymentMethod: 'Bank transfer',
}

export function GenerateReceiptModal() {
  const [open, setOpen] = useState(false)

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
            className="flex w-full max-w-lg flex-col gap-6 rounded-lg bg-white p-8 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-ink">Generate Receipt</h2>
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
                  <div key={row.item} className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-ink">{row.item}</p>
                      {row.detail && <p className="text-xs text-body-muted">{row.detail}</p>}
                    </div>
                    <span className="text-right text-ink">{row.usage ?? '—'}</span>
                    <span className="text-right text-ink">{row.rate ?? '—'}</span>
                    <span className="text-right text-ink">{row.amount}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] pt-4">
                <span className="text-lg text-ink">Total amount</span>
                <span className="font-heading text-3xl text-brand">{SAMPLE_RECEIPT.totalAmount}</span>
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
                onClick={() => setOpen(false)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#5b3a3c] py-2.5 text-sm font-medium text-white hover:brightness-110"
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
