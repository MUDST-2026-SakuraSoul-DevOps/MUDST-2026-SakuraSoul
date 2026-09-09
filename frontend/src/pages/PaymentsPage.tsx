import { useMemo, useState } from 'react'
import { Bank, ClipboardText, CalendarCheck, Plus, TrendUp } from '@phosphor-icons/react'
import { Search, Receipt, Download, Send } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { StatCard } from '../components/StatCard'
import { InitialsAvatar } from '../components/InitialsAvatar'

/**
 * ตรงกับเฟรม "Payment Management" ใน Figma (node 11:1193)
 *
 * backend ยังไม่มี endpoint การชำระเงินเลยสักตัว (ไม่มีตาราง payment/invoice)
 * ตัวเลขสรุปการ์ดด้านบนกับแถวในตารางข้างล่างเลยเป็น "ข้อมูลตัวอย่างจาก Figma
 * ตรง ๆ" (SAMPLE_PAYMENTS) ไม่ใช่ข้อมูลจริง — ใส่ comment กำกับไว้ให้ชัดเพื่อไม่ให้
 * สับสนว่าเป็นข้อมูลจริงจาก backend พอมี endpoint จริงค่อยเปลี่ยนมา fetch แทน
 * array นี้ทั้งหมด (โครงสร้างคอลัมน์ยังคงเดิม)
 */

interface SamplePayment {
  tenant: string
  unit: string
  roomType: string
  amount: string
  amountLabel: string
  cycle: string
  cycleDate: string
  status: 'Paid' | 'Pending'
}

const SAMPLE_PAYMENTS: SamplePayment[] = [
  {
    tenant: 'Yuki Tanaka',
    unit: 'Unit 4A - Sakura Wing',
    roomType: 'Single Bedroom',
    amount: '35,000',
    amountLabel: 'Rent',
    cycle: 'Monthly',
    cycleDate: 'Oct 2024',
    status: 'Paid',
  },
  {
    tenant: 'Kenji Sato',
    unit: 'Unit 2B - Lotus Wing',
    roomType: 'Double Bedroom',
    amount: '500,000',
    amountLabel: 'Annual Rent',
    cycle: 'Yearly',
    cycleDate: '2024 - 2025',
    status: 'Pending',
  },
  {
    tenant: 'Hiroshi Nakamura',
    unit: 'Unit 8C - Maple Penthouse',
    roomType: 'Double Bedroom',
    amount: '45,000',
    amountLabel: 'Rent',
    cycle: 'Monthly',
    cycleDate: 'Oct 2024',
    status: 'Paid',
  },
]

function PaymentStatusPill({ status }: { status: SamplePayment['status'] }) {
  return status === 'Paid' ? (
    <span className="inline-flex items-center rounded-sm bg-[#e8f5e9] px-2.5 py-1 text-xs font-medium text-[#2e7d32]">
      Paid
    </span>
  ) : (
    <span className="inline-flex items-center rounded-sm border border-[rgba(255,224,130,0.5)] bg-[#fff8e1] px-2.5 py-1 text-xs font-medium text-[#f57f17]">
      Pending
    </span>
  )
}

export default function PaymentsPage() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SAMPLE_PAYMENTS
    return SAMPLE_PAYMENTS.filter(
      (p) => p.tenant.toLowerCase().includes(q) || p.unit.toLowerCase().includes(q),
    )
  }, [search])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payment Management"
        description="Oversee financial transactions, generate receipts, and manage billing cycles with clarity and ease."
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard
          label="TOTAL REVENUE (YTD)"
          value="12,450,000"
          icon={Bank}
          footer={
            <span className="inline-flex items-center gap-1 rounded-sm bg-[rgba(76,175,80,0.1)] px-2 py-1 text-xs font-medium text-[#4caf50]">
              <TrendUp size={12} weight="bold" /> +8.4%
            </span>
          }
        />
        <StatCard
          label="PENDING COLLECTIONS"
          value="450,000"
          icon={ClipboardText}
          footer={<span className="text-xs font-medium text-[#6b5c4b]">12 Invoices Awaiting Payment</span>}
        />
        <StatCard
          label="UPCOMING RENEWALS (30D)"
          value="8 Units"
          icon={CalendarCheck}
          footer={<span className="text-xs font-medium text-ink-muted">Total Value: ¥1,200,000</span>}
        />
      </div>

      <div className="flex justify-end">
        <PrimaryButton>
          <Plus size={11} weight="bold" />
          New Invoice
        </PrimaryButton>
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-[rgba(238,217,196,0.5)] bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
        <div className="flex flex-col gap-3 border-b border-[rgba(212,194,195,0.3)] bg-white/50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative w-full sm:max-w-sm">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-body-muted/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Tenant or Unit..."
              className="w-full rounded-md border border-[rgba(212,194,195,0.5)] bg-sidebar py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-body-muted/70"
            />
          </label>
          <div className="flex gap-2">
            <span className="rounded-xl border border-[rgba(212,194,195,0.5)] bg-white px-4 py-1.5 text-xs font-medium text-ink">
              All Status
            </span>
            <span className="rounded-xl border border-[rgba(212,194,195,0.5)] bg-white px-4 py-1.5 text-xs font-medium text-ink">
              Paid
            </span>
            <span className="rounded-xl border border-[rgba(212,194,195,0.5)] bg-white px-4 py-1.5 text-xs font-medium text-ink">
              Pending
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-[rgba(212,194,195,0.3)] bg-[#f6f3f2]">
                {['TENANT & UNIT', 'ROOM TYPE', 'AMOUNT', 'BILLING CYCLE', 'STATUS', 'ACTIONS'].map((col, i) => (
                  <th
                    key={col}
                    className={`px-6 py-4 text-xs font-medium tracking-[0.6px] text-body-muted uppercase ${i === 5 ? 'text-right' : ''}`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white/40">
              {filtered.map((p) => (
                <tr key={p.tenant} className="border-t border-[rgba(212,194,195,0.2)]">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={p.tenant} size={40} />
                      <div>
                        <p className="text-sm font-semibold tracking-[0.7px] text-ink">{p.tenant}</p>
                        <p className="text-[13px] text-body-muted">{p.unit}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-base text-ink">{p.roomType}</p>
                    <p className="text-xs text-body-muted">{p.amountLabel}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-base text-ink">{p.amount}</p>
                    <p className="text-xs text-body-muted">{p.amountLabel}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-base text-ink">{p.cycle}</p>
                    <p className="text-xs text-body-muted">{p.cycleDate}</p>
                  </td>
                  <td className="px-6 py-5">
                    <PaymentStatusPill status={p.status} />
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-3 text-ink-muted">
                      <button type="button" aria-label="ดูใบแจ้งหนี้" className="hover:text-ink">
                        <Receipt size={18} />
                      </button>
                      <button type="button" aria-label="ดาวน์โหลด" className="hover:text-ink">
                        <Download size={18} />
                      </button>
                      <button type="button" aria-label="ส่งใบแจ้งหนี้" className="hover:text-ink">
                        <Send size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] bg-white/50 px-4 py-4">
          <p className="text-xs font-medium text-body-muted">Showing {filtered.length} of {SAMPLE_PAYMENTS.length} entries (ตัวอย่างจาก Figma)</p>
          <div className="flex items-center gap-1 text-xs font-medium text-body-muted">
            <span className="flex size-8 items-center justify-center rounded-sm bg-accent-soft font-medium text-[#795356]">
              1
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
