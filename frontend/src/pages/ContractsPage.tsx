import { useMemo, useState } from 'react'
import { FileText } from '@phosphor-icons/react'
import { Search } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { InitialsAvatar } from '../components/InitialsAvatar'

/**
 * ตรงกับเฟรม "Contract Management" ใน Figma (node 11:1429)
 *
 * backend ยังไม่มี endpoint สัญญาเช่าเลยสักตัว (ไม่มีตาราง lease — README หัวข้อ
 * "ที่ยังไม่มี" ข้อ 1) แถวในตารางเลยเป็น "ข้อมูลตัวอย่างจาก Figma ตรง ๆ"
 * (SAMPLE_CONTRACTS) ไม่ใช่ข้อมูลจริง — ใช้ผู้เช่าชุดเดียวกับที่ดีไซน์ Payment
 * ใช้ (Yuki Tanaka / Kenji Sato / Hiroshi Nakamura) พอมี endpoint จริงค่อยเปลี่ยน
 * มา fetch แทน array นี้ทั้งหมด
 *
 * รูปโปรไฟล์ผู้เช่าในดีไซน์เป็นรูปจริงจาก Figma CDN (ดาวน์โหลดไม่ได้ ดู
 * เหตุผลเรื่อง network sandbox ใน README) เลยใช้ InitialsAvatar แทนเหมือนหน้าอื่น
 * ปุ่ม "Create Contract" ยังไม่ทำ popup ฟอร์มจริง (ดูสรุปขอบเขตที่คุยกันไว้)
 */

interface SampleContract {
  tenant: string
  unit: string
  roomType: string
  amount: string
  amountLabel: string
  start: string
  end: string
  status: 'Active' | 'Pending Signature' | 'Ending Soon'
}

const SAMPLE_CONTRACTS: SampleContract[] = [
  {
    tenant: 'Yuki Tanaka',
    unit: 'Unit 4A - Sakura Wing',
    roomType: 'Single Bedroom',
    amount: '35,000',
    amountLabel: 'Rent',
    start: 'Oct 01, 2023',
    end: 'to Sep 30, 2024',
    status: 'Active',
  },
  {
    tenant: 'Kenji Sato',
    unit: 'Unit 2B - Lotus Wing',
    roomType: 'Double Bedroom',
    amount: '500,000',
    amountLabel: 'Annual Rent',
    start: 'Jan 15, 2024',
    end: 'to Jan 14, 2025',
    status: 'Pending Signature',
  },
  {
    tenant: 'Hiroshi Nakamura',
    unit: 'Unit 8C - Maple Penthouse',
    roomType: 'Double Bedroom',
    amount: '45,000',
    amountLabel: 'Rent',
    start: 'May 01, 2022',
    end: 'to Apr 30, 2024',
    status: 'Ending Soon',
  },
]

function ContractStatusPill({ status }: { status: SampleContract['status'] }) {
  const styles: Record<SampleContract['status'], string> = {
    Active: 'bg-[rgba(233,212,191,0.3)] border-[rgba(107,92,75,0.2)] text-[#6b5c4b]',
    'Pending Signature': 'bg-[rgba(212,194,195,0.3)] border-[rgba(212,194,195,0.5)] text-[#504444]',
    'Ending Soon': 'bg-[rgba(255,218,214,0.5)] border-[rgba(186,26,26,0.2)] text-[#93000a]',
  }
  return (
    <span className={`inline-flex items-center rounded-sm border px-3 py-1.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

export default function ContractsPage() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SAMPLE_CONTRACTS
    return SAMPLE_CONTRACTS.filter(
      (c) => c.tenant.toLowerCase().includes(q) || c.unit.toLowerCase().includes(q),
    )
  }, [search])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contract Management"
        description="Manage active leases, renewals, and resident agreements."
        actions={
          <PrimaryButton className="rounded-xl px-6 py-3 shadow-[0px_4px_12px_rgba(122,84,87,0.15)]">
            <FileText size={13} weight="bold" />
            Create Contract
          </PrimaryButton>
        }
      />

      <label className="relative w-full max-w-sm">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-body-muted/70" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Tenant or Unit..."
          className="w-full rounded-md border border-[rgba(212,194,195,0.5)] bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-body-muted/70"
        />
      </label>

      <div className="w-full overflow-hidden rounded-lg border border-[rgba(238,217,196,0.5)] bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-[rgba(212,194,195,0.3)] bg-[#f6f3f2]">
                {['TENANT & UNIT', 'ROOM TYPE', 'AMOUNT', 'DURATION', 'STATUS', 'ACTIONS'].map((col, i) => (
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
              {filtered.map((c) => (
                <tr key={c.tenant} className="border-t border-[rgba(212,194,195,0.2)]">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={c.tenant} size={40} />
                      <div>
                        <p className="text-sm font-semibold tracking-[0.7px] text-ink">{c.tenant}</p>
                        <p className="text-[13px] text-body-muted">{c.unit}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-base text-ink">{c.roomType}</p>
                    <p className="text-xs text-body-muted">{c.amountLabel}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-base text-ink">{c.amount}</p>
                    <p className="text-xs text-body-muted">{c.amountLabel}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-base text-ink">{c.start}</p>
                    <p className="text-xs text-body-muted">{c.end}</p>
                  </td>
                  <td className="px-6 py-5">
                    <ContractStatusPill status={c.status} />
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-end">
                      <button type="button" aria-label="ดูสัญญา" className="text-ink-muted hover:text-ink">
                        <FileText size={19} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] bg-white/50 px-4 py-4">
          <p className="text-xs font-medium text-body-muted">Showing {filtered.length} of {SAMPLE_CONTRACTS.length} entries (ตัวอย่างจาก Figma)</p>
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
