import { useMemo, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { Search, Refrigerator, WashingMachine, Microwave, Tv, Wifi, Pencil, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { ApplianceDialog } from '../dialogs/ApplianceDialog'
import { ApplianceRequestDialog } from '../dialogs/ApplianceRequestDialog'
import type { CatalogItem, RentalRequest } from '../domain/appliance'
import { availableCount } from '../domain/appliance'
import { displayDate, yenAmount } from '../format'

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

const INITIAL_RENTALS: RentalRequest[] = [
  { id: 1, room: '101', sku: 'AP-001', monthlyFee: 300, deposit: 1000, startDate: '2026-09-01', status: 'Active' },
  { id: 2, room: '204', sku: 'AP-004', monthlyFee: 450, deposit: 1500, startDate: '2026-09-15', status: 'Pending' },
  { id: 3, room: '112', sku: 'AP-007', monthlyFee: 150, deposit: 500, startDate: '2026-08-03', status: 'Returned' },
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

const INITIAL_CATALOG: CatalogItem[] = [
  { id: 1, name: 'Refrigerator 5.9 cu.ft', sku: 'AP-001', category: 'Kitchen', monthlyFee: 300, deposit: 1000, owned: 7, lowStockAt: 2 },
  { id: 2, name: 'Washing Machine 7 kg', sku: 'AP-004', category: 'Laundry', monthlyFee: 450, deposit: 1500, owned: 2, lowStockAt: 1 },
  { id: 3, name: 'Microwave Oven 20 L', sku: 'AP-007', category: 'Kitchen', monthlyFee: 150, deposit: 500, owned: 9, lowStockAt: 2 },
  { id: 4, name: 'Smart TV 43"', sku: 'AP-011', category: 'Living', monthlyFee: 350, deposit: 2000, owned: 0, lowStockAt: 0 },
  { id: 5, name: 'Pocket Wi-Fi', sku: 'AP-081', category: 'Living', monthlyFee: 200, deposit: 1500, owned: 0, lowStockAt: 0 },
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

  /*
    ข้อมูลอยู่ใน state ของหน้า เพราะฟีเจอร์นี้ยังไม่มี endpoint ฝั่ง backend
    เลยสักตัว แนวเดียวกับสามแท็บแรกของหน้า Maintenance ป็อปอัปจึงทำงานจริงใน
    รอบที่เปิดหน้าอยู่ แต่ปิดหน้าแล้วข้อมูลกลับไปตั้งต้น พอมี API ค่อยเปลี่ยน
    ตรงนี้ให้ยิง API แทน โดยไม่ต้องแตะกฎใน domain/appliance.ts
  */
  const [catalog, setCatalog] = useState<CatalogItem[]>(INITIAL_CATALOG)
  const [rentals, setRentals] = useState<RentalRequest[]>(INITIAL_RENTALS)
  const [creating, setCreating] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [editingRequest, setEditingRequest] = useState<RentalRequest | null>(null)

  const nameOf = (sku: string) => catalog.find((c) => c.sku === sku)?.name ?? sku

  const filteredRentals = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rentals
    return rentals.filter((r) => nameOf(r.sku).toLowerCase().includes(q) || r.room.includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, rentals, catalog])

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter((c) => c.name.toLowerCase().includes(q))
  }, [search, catalog])

  const summary = useMemo(() => {
    const active = rentals.filter((r) => r.status === 'Active')
    return {
      active: active.length,
      rooms: new Set(active.map((r) => r.room)).size,
      pending: rentals.filter((r) => r.status === 'Pending').length,
      // คิดเฉพาะใบที่ยังเช่าอยู่จริง ใบที่คืนแล้วไม่ขึ้นบิลเดือนนี้
      monthlyTotal: active.reduce((sum, r) => sum + r.monthlyFee, 0),
    }
  }, [rentals])

  function saveCatalogItem(next: CatalogItem) {
    setCatalog((current) => {
      if (next.id !== 0) {
        return current.map((c) => (c.id === next.id ? next : c))
      }
      const nextId = Math.max(0, ...current.map((c) => c.id)) + 1
      return [...current, { ...next, id: nextId }]
    })
  }

  function saveRequest(next: RentalRequest) {
    setRentals((current) => {
      if (next.id !== 0) {
        return current.map((r) => (r.id === next.id ? next : r))
      }
      const nextId = Math.max(0, ...current.map((r) => r.id)) + 1
      return [...current, { ...next, id: nextId }]
    })
  }

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
          <PrimaryButton onClick={() => setCreating(true)}>
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
          {/*
            การ์ดสามใบคำนวณจากใบเช่าจริง ไม่ใช่ตัวเลขคงที่จากดีไซน์ เหตุผล
            เดียวกับการ์ดสรุปในหน้า Maintenance คือพอเพิ่มใบเช่าแล้วตัวเลขต้อง
            ขยับตาม ไม่งั้นผู้ใช้จะเห็นเลขค้างอยู่ที่เดิมแล้วไม่เชื่อหน้าจอ
          */}
          <SummaryCard
            label="ACTIVE RENTALS"
            value={String(summary.active)}
            description={`Across ${summary.rooms} ${summary.rooms === 1 ? 'room' : 'rooms'}`}
          />
          <SummaryCard
            label="PENDING REQUESTS"
            value={String(summary.pending)}
            description="Waiting for approval"
            tone="amber"
          />
          <SummaryCard
            label="MONTHLY FEE TOTAL"
            value={yenAmount(summary.monthlyTotal)}
            description="Added to this month's bills"
          />
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
                  <tr key={r.id} className="border-t border-[#f5f1ef]">
                    <td className="px-4 py-4 text-sm font-medium text-[#241f1d]">{r.room}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <ApplianceIcon name={nameOf(r.sku)} />
                        <div>
                          <p className="text-sm text-[#241f1d]">{nameOf(r.sku)}</p>
                          <p className="text-[11px] text-[#9a9390]">SKU: {r.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-[#241f1d]">
                      {yenAmount(r.monthlyFee)}
                    </td>
                    <td className="px-4 py-4 text-[13px] text-[#4a4340]">{displayDate(r.startDate)}</td>
                    <td className="px-4 py-4">
                      <RentalStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setEditingRequest(r)}
                          aria-label={`Edit request for unit ${r.room}`}
                          className="rounded p-1.5 text-[#9a9390] hover:bg-black/5 hover:text-ink"
                        >
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
                    <td className="px-4 py-4 text-right text-sm text-[#241f1d]">
                      {yenAmount(c.monthlyFee)}
                    </td>
                    <td className="px-4 py-4 text-right text-[13px] text-[#4a4340]">
                      {yenAmount(c.deposit)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end">
                        <AvailabilityBadge count={availableCount(c, rentals)} />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setEditingItem(c)}
                          aria-label={`Edit ${c.name}`}
                          className="rounded p-1.5 text-[#9a9390] hover:bg-black/5 hover:text-ink"
                        >
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

      {creating && tab === 'catalog' && (
        <ApplianceDialog
          mode="create"
          existingSkus={catalog.map((c) => c.sku)}
          onClose={() => setCreating(false)}
          onSave={saveCatalogItem}
        />
      )}
      {creating && tab === 'requests' && (
        <ApplianceRequestDialog
          mode="create"
          catalog={catalog}
          onClose={() => setCreating(false)}
          onSave={saveRequest}
        />
      )}
      {editingItem && (
        <ApplianceDialog
          mode="edit"
          item={editingItem}
          existingSkus={catalog.map((c) => c.sku)}
          onClose={() => setEditingItem(null)}
          onSave={saveCatalogItem}
        />
      )}
      {editingRequest && (
        <ApplianceRequestDialog
          mode="edit"
          request={editingRequest}
          catalog={catalog}
          onClose={() => setEditingRequest(null)}
          onSave={saveRequest}
        />
      )}
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
