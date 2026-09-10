import { useMemo, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { Search, Refrigerator, WashingMachine, Microwave, Tv, Wifi, Pencil, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'

/**
 * ตรงกับเฟรม "Appliance Rental" ใน Figma (node 378:1152 / 378:1482) — ฟีเจอร์นี้
 * ไม่ได้อยู่ใน requirement เดิมของ README เลย (ไม่มีพูดถึงในหัวข้อ Requirements
 * หรือ "ที่ยังไม่มี") ทีมน่าจะเพิ่มขอบเขตนี้เข้ามาทีหลังตอนทำ Figma — backend
 * ยังไม่มี endpoint ส่วนนี้เลยสักตัว เลยใช้ "ข้อมูลตัวอย่างจาก Figma ตรง ๆ"
 * (SAMPLE_RENTALS / SAMPLE_CATALOG) ไม่ใช่ข้อมูลจริง ควรคุยกับทีม backend ว่าจะ
 * ทำ endpoint ส่วนนี้จริงไหมก่อน
 *
 * หมายเหตุฟอนต์: เฟรมนี้ในดีไซน์ต้นฉบับใช้ DM Sans (ต่างจากหน้าอื่นทั้งหมดที่ใช้
 * Plus Jakarta Sans/Manrope ตาม theme token ของแอป) ดูเหมือนเป็นความไม่สม่ำเสมอ
 * ของดีไซน์ต้นทาง (คนละเฟรม/ต้นแบบ) เพื่อความสม่ำเสมอของทั้งแอปเลยใช้ font
 * token เดิมของโปรเจกต์แทน แต่คง hex สีทุกตัวไว้ตรงตามดีไซน์เป๊ะ ๆ
 */

type Tab = 'requests' | 'catalog'

const APPLIANCE_ICONS: Record<string, LucideIcon> = {
  'Refrigerator 5.9 cu.ft': Refrigerator,
  'Washing Machine 7 kg': WashingMachine,
  'Microwave Oven 20 L': Microwave,
  'Smart TV 43"': Tv,
  'Pocket Wi-Fi': Wifi,
}

interface RentalRequest {
  room: string
  appliance: string
  sku: string
  fee: string
  startDate: string
  status: 'Active' | 'Pending' | 'Returned'
}

const SAMPLE_RENTALS: RentalRequest[] = [
  { room: '101', appliance: 'Refrigerator 5.9 cu.ft', sku: 'AP-001', fee: '¥3,500', startDate: '1 Sep 2026', status: 'Active' },
  { room: '204', appliance: 'Washing Machine 7 kg', sku: 'AP-004', fee: '3,000', startDate: '15 Sep 2026', status: 'Pending' },
  { room: '112', appliance: 'Microwave Oven 20 L', sku: 'AP-007', fee: '¥700', startDate: '3 Aug 2026', status: 'Returned' },
]

function RentalStatusBadge({ status }: { status: RentalRequest['status'] }) {
  const styles: Record<RentalRequest['status'], string> = {
    Active: 'bg-[#dff0e3] text-[#3e7a4e]',
    Pending: 'bg-[#e9c9a4] text-[#7a5322]',
    Returned: 'bg-[#efeae7] text-[#6b6360]',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

interface CatalogItem {
  name: string
  sku: string
  category: string
  fee: string
  deposit: string
  available: number
}

const SAMPLE_CATALOG: CatalogItem[] = [
  { name: 'Refrigerator 5.9 cu.ft', sku: 'AP-001', category: 'Kitchen', fee: '¥300', deposit: '¥1,000', available: 6 },
  { name: 'Washing Machine 7 kg', sku: 'AP-004', category: 'Laundry', fee: '¥450', deposit: '¥1,500', available: 1 },
  { name: 'Microwave Oven 20 L', sku: 'AP-007', category: 'Kitchen', fee: '¥150', deposit: '¥500', available: 9 },
  { name: 'Smart TV 43"', sku: 'AP-011', category: 'Living', fee: '¥350', deposit: '¥2,000', available: 0 },
  { name: 'Pocket Wi-Fi', sku: 'AP-081', category: 'Living', fee: '200', deposit: '1,500', available: 0 },
]

function AvailabilityBadge({ count }: { count: number }) {
  const tone = count === 0 ? 'bg-[#efeae7] text-[#6b6360]' : count <= 1 ? 'bg-[#e9c9a4] text-[#7a5322]' : 'bg-[#dff0e3] text-[#3e7a4e]'
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${tone}`}>
      {count} left
    </span>
  )
}

function ApplianceIcon({ name }: { name: string }) {
  const Icon = APPLIANCE_ICONS[name] ?? Refrigerator
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f4f0ee]">
      <Icon size={16} className="text-[#6b6360]" />
    </span>
  )
}

export default function AppliancesPage() {
  const [tab, setTab] = useState<Tab>('requests')
  const [search, setSearch] = useState('')

  const filteredRentals = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SAMPLE_RENTALS
    return SAMPLE_RENTALS.filter((r) => r.appliance.toLowerCase().includes(q) || r.room.includes(q))
  }, [search])

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SAMPLE_CATALOG
    return SAMPLE_CATALOG.filter((c) => c.name.toLowerCase().includes(q))
  }, [search])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Appliance Rental"
        description={
          tab === 'requests'
            ? 'Track extra appliances rented into each room and the fees they carry.'
            : 'Set which appliances can be rented and what they cost per month.'
        }
        actions={
          <PrimaryButton>
            <Plus size={11} weight="bold" />
            {tab === 'requests' ? 'New Request' : 'Add Appliance'}
          </PrimaryButton>
        }
      />

      <div className="inline-flex w-fit gap-1 rounded-[10px] bg-[#f2ecea] p-[5px]">
        <button
          type="button"
          onClick={() => setTab('requests')}
          className={`rounded-lg px-5 py-2 text-sm font-medium ${
            tab === 'requests' ? 'bg-white text-[#2a2422] shadow-sm' : 'text-[#6b6360] hover:text-ink'
          }`}
        >
          Rental Requests
        </button>
        <button
          type="button"
          onClick={() => setTab('catalog')}
          className={`rounded-lg px-5 py-2 text-sm font-medium ${
            tab === 'catalog' ? 'bg-white text-[#2a2422] shadow-sm' : 'text-[#6b6360] hover:text-ink'
          }`}
        >
          Appliance Catalog
        </button>
      </div>

      {tab === 'requests' && (
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
          <SummaryCard label="ACTIVE RENTALS" value="18" description="Across 14 rooms" />
          <SummaryCard label="PENDING REQUESTS" value="3" description="Waiting for approval" tone="amber" />
          <SummaryCard label="MONTHLY FEE TOTAL" value="¥5,400" description="Added to this month's bills" />
        </div>
      )}

      <div className="rounded-xl border border-[#ede8e6] bg-white">
        <div className="flex items-center justify-between border-b border-[#efeae7] px-6 py-5">
          <h3 className="font-heading text-xl text-[#241f1d]">
            {tab === 'requests' ? 'Rental Requests' : 'Appliance Catalog'}
          </h3>
          <label className="relative w-56 border-b border-[#d9a7a7] pb-2">
            <Search size={14} className="absolute top-0 left-0 text-[#a8a29e]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'requests' ? 'Search room or item...' : 'Search appliance...'}
              className="w-full pl-6 text-[13px] text-ink outline-none placeholder:text-[#a8a29e]"
            />
          </label>
        </div>

        {tab === 'requests' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr>
                  {['ROOM', 'APPLIANCE', 'MONTHLY FEE', 'START DATE', 'STATUS', 'ACTIONS'].map((col, i) => (
                    <th
                      key={col}
                      className={`px-4 pt-4 pb-3 text-[10px] font-medium tracking-[0.9px] text-[#9a9390] ${
                        i === 2 ? 'text-right' : i === 5 ? 'text-center' : ''
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRentals.map((r) => (
                  <tr key={r.room + r.sku} className="border-t border-[#f5f1ef]">
                    <td className="px-4 py-4 text-sm font-medium text-[#241f1d]">{r.room}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <ApplianceIcon name={r.appliance} />
                        <div>
                          <p className="text-sm text-[#241f1d]">{r.appliance}</p>
                          <p className="text-[11px] text-[#9a9390]">SKU: {r.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-[#241f1d]">{r.fee}</td>
                    <td className="px-4 py-4 text-[13px] text-[#4a4340]">{r.startDate}</td>
                    <td className="px-4 py-4">
                      <RentalStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-center">
                        <button type="button" aria-label="Edit" className="text-[#9a9390] hover:text-ink">
                          <Pencil size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr>
                  {['APPLIANCE', 'CATEGORY', 'MONTHLY FEE', 'DEPOSIT', 'AVAILABLE', 'ACTIONS'].map((col, i) => (
                    <th
                      key={col}
                      className={`px-4 pt-4 pb-3 text-[10px] font-medium tracking-[0.9px] text-[#9a9390] ${
                        i >= 2 && i <= 4 ? 'text-right' : i === 5 ? 'text-center' : ''
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCatalog.map((c) => (
                  <tr key={c.sku} className="border-t border-[#f5f1ef]">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <ApplianceIcon name={c.name} />
                        <div>
                          <p className="text-sm text-[#241f1d]">{c.name}</p>
                          <p className="text-[11px] text-[#9a9390]">SKU: {c.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[13px] text-[#4a4340]">{c.category}</td>
                    <td className="px-4 py-4 text-right text-sm text-[#241f1d]">{c.fee}</td>
                    <td className="px-4 py-4 text-right text-[13px] text-[#4a4340]">{c.deposit}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end">
                        <AvailabilityBadge count={c.available} />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-center">
                        <button type="button" aria-label="Edit" className="text-[#9a9390] hover:text-ink">
                          <Pencil size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  description,
  tone = 'default',
}: {
  label: string
  value: string
  description: string
  tone?: 'default' | 'amber'
}) {
  const valueColor = tone === 'amber' ? '#a8622c' : '#241f1d'
  const labelColor = tone === 'amber' ? '#a8622c' : '#8a817d'
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#ede8e6] bg-white px-6 py-5">
      <p className="text-[10px] font-medium tracking-[0.9px]" style={{ color: labelColor }}>
        {label}
      </p>
      <p className="font-heading text-[36px] leading-none" style={{ color: valueColor }}>
        {value}
      </p>
      <p className="text-xs text-[#8a817d]">{description}</p>
    </div>
  )
}
