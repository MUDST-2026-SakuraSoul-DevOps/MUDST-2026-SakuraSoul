import { useMemo, useState } from 'react'
import { Wrench, Package, Plus, ClockCounterClockwise } from '@phosphor-icons/react'
import { Search, Pencil, Bell } from 'lucide-react'
import { fetchMaintenanceLog } from '../api/client'
import type { MaintenanceStatus } from '../api/types'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { ExportLogButton } from '../components/ExportLogButton'

/**
 * ตรงกับเฟรม "Maintenance Management" ใน Figma (node 53:5732 / 53:5932 / 53:6150)
 * มี 3 sub-tab ที่ทำจริงรอบนี้: Maintenance Tasks, Supplies & Inventory,
 * Schedule & Reminder — ดีไซน์จริงมีแท็บที่ 4 "Maintenance Log" โผล่มาด้วย
 * (เห็นใน tab bar ของทุกเฟรมที่ดึงมา) แต่ไม่มี design context ให้ดึงรายละเอียด
 * เนื้อหาข้างในเลย เลยใส่แท็บไว้ให้ตรงหน้าตา แต่ในเนื้อหาขึ้น EmptyState ไว้ก่อน
 *
 * backend ยังไม่มี endpoint งานซ่อมบำรุง/สต็อกอะไหล่/ตารางนัดหมายเลยสักตัว
 * (README หัวข้อ "ที่ยังไม่มี" ข้อ 5 บอกว่าจะเป็น V3__maintenance.sql ในอนาคต)
 * ทุก tab เลยใช้ "ข้อมูลตัวอย่างจาก Figma ตรง ๆ" (SAMPLE_TASKS / SAMPLE_SUPPLIES /
 * REMINDERS) ไม่ใช่ข้อมูลจริง — พอมี endpoint จริงค่อยเปลี่ยนมา fetch แทน
 *
 * หมายเหตุ Schedule & Reminder: ดีไซน์จริงเป็นปฏิทินรายสัปดาห์แบบ
 * absolute-positioned (บล็อกงานวางตามพิกัด px เป๊ะ ๆ ต่อชั่วโมง) ซึ่งซับซ้อนมาก
 * และเปราะบางเรื่อง responsive รอบนี้เลยตัดสินใจ simplify เป็นกริดคอลัมน์ต่อวัน
 * แบบ normal flow แทน (คงจำนวนวัน Mon-Fri, ชื่องาน, หน่วย/ผู้รับผิดชอบ, และสี
 * ของแต่ละ event block ไว้ตรงตามดีไซน์) ส่วน Recurring Reminders sidebar
 * ทำตรงตามดีไซน์ทุกใบ (การ์ด 3 ใบ + ปุ่ม Add Reminder)
 */

type Tab = 'tasks' | 'supplies' | 'schedule' | 'log'

const TABS: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Maintenance Tasks' },
  { id: 'supplies', label: 'Supplies & Inventory' },
  { id: 'schedule', label: 'Schedule & Reminder' },
  { id: 'log', label: 'Maintenance Log' },
]

export default function MaintenancePage() {
  const [tab, setTab] = useState<Tab>('tasks')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Maintenance Management"
        description="Oversee tasks, inventory, and schedules with clarity."
      />

      <div className="inline-flex w-fit gap-2 rounded-md border border-[rgba(212,194,195,0.3)] bg-[#f0eded] p-[9px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-sm px-6 py-2 text-sm font-semibold tracking-[0.7px] whitespace-nowrap ${
              tab === t.id
                ? 'border border-[#f1e6db] bg-sidebar text-[#504444] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]'
                : 'text-[#504444] hover:text-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tasks' && <MaintenanceTasksTab />}
      {tab === 'supplies' && <SuppliesTab />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'log' && <MaintenanceLogTab />}
    </div>
  )
}

/* ---------------------------- Tab 1: Maintenance Tasks ---------------------------- */

interface MaintenanceTask {
  task: string
  detail: string
  unit: string
  assignTo: string
  reportBy: string
  status: 'In Progress' | 'Pending' | 'Wait for Assign'
}

const SAMPLE_TASKS: MaintenanceTask[] = [
  {
    task: 'AC Not Cooling',
    detail: 'Air conditioner is not working',
    unit: '101',
    assignTo: 'Kenji Tanaka',
    reportBy: 'Sarah J.',
    status: 'In Progress',
  },
  {
    task: 'Leaking Faucet',
    detail: 'Dripping continuously in kitchen',
    unit: '204',
    assignTo: 'Mei Lin',
    reportBy: 'David W.',
    status: 'Pending',
  },
  {
    task: 'Broken Blinds',
    detail: 'Living room window',
    unit: '205',
    assignTo: '-',
    reportBy: 'Alex P.',
    status: 'Wait for Assign',
  },
]

function TaskStatusBadge({ status }: { status: MaintenanceTask['status'] }) {
  if (status === 'Wait for Assign') {
    return (
      <span className="inline-flex items-center rounded-sm bg-[#e6e2de] px-2 py-1 text-xs font-semibold tracking-[0.6px] text-[#666461]">
        {status}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-sm border border-[#d4c2c3] px-2 py-1 text-xs font-semibold tracking-[0.6px] text-[#504444]">
      {status}
    </span>
  )
}

function MaintenanceTasksTab() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SAMPLE_TASKS
    return SAMPLE_TASKS.filter((t) => t.task.toLowerCase().includes(q) || t.unit.includes(q))
  }, [search])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-stretch gap-6">
        <MiniStatCard label="Total Tasks" value="12" valueColor="#1b1c1c" />
        <MiniStatCard label="Pending" value="5" valueColor="#6b5c4b" />
        <MiniStatCard label="High Priority" value="2" valueColor="#ba1a1a" border="#ffdad6" />
        <MiniStatCard label="Completed" value="5" valueColor="#7a5457" />
      </div>

      <div className="flex items-center justify-between">
        <label className="relative w-64">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#d4c2c3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Task..."
            className="w-full rounded-sm border border-[rgba(212,194,195,0.5)] bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-[#d4c2c3]"
          />
        </label>
        <PrimaryButton>
          <Plus size={11} weight="bold" />
          New Task
        </PrimaryButton>
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-[rgba(212,194,195,0.3)] bg-sidebar">
        <div className="flex items-center gap-2 border-b border-[rgba(212,194,195,0.3)] px-4 py-4">
          <Wrench size={18} className="text-[#504444]" />
          <h3 className="font-heading text-2xl text-[#1b1c1c]">Task Overview</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-[rgba(212,194,195,0.3)] bg-[#f6f3f2]">
                {['Task', 'Unit', 'Assign To', 'Report By', 'Status', 'Action'].map((col, i) => (
                  <th
                    key={col}
                    className={`p-4 text-sm font-normal tracking-[0.7px] text-[#504444] ${i === 5 ? 'text-right' : ''}`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.task} className="border-b border-[rgba(212,194,195,0.2)] bg-white last:border-b-0">
                  <td className="px-4 py-4">
                    <p className="text-base text-[#1b1c1c]">{t.task}</p>
                    <p className="text-sm text-[#504444]">{t.detail}</p>
                  </td>
                  <td className="px-4 py-4 text-base text-[#1b1c1c]">{t.unit}</td>
                  <td className="px-4 py-4 text-base text-[#1b1c1c]">{t.assignTo}</td>
                  <td className="px-4 py-4 text-base text-[#1b1c1c]">{t.reportBy}</td>
                  <td className="px-4 py-4">
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end">
                      <button type="button" aria-label="แก้ไขงาน" className="text-ink-muted hover:text-ink">
                        <Pencil size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MiniStatCard({
  label,
  value,
  valueColor,
  border,
}: {
  label: string
  value: string
  valueColor: string
  border?: string
}) {
  return (
    <div
      className="flex flex-1 flex-col justify-between rounded-lg border bg-white p-[17px]"
      style={{ borderColor: border ?? 'rgba(212,194,195,0.3)' }}
    >
      <p className="text-sm font-semibold tracking-[0.7px] text-[#504444]">{label}</p>
      <p className="font-heading text-2xl" style={{ color: valueColor }}>
        {value}
      </p>
    </div>
  )
}

/* ---------------------------- Tab 2: Supplies & Inventory ---------------------------- */

interface SupplyItem {
  name: string
  sku: string
  category: string
  stock: number
  minStock: number
  status: 'In Stock' | 'Low Stock'
}

const SAMPLE_SUPPLIES: SupplyItem[] = [
  { name: 'LED Bulbs 60W', sku: 'EL-001', category: 'Electrical', stock: 145, minStock: 50, status: 'In Stock' },
  { name: 'Air Filters 16x20x1', sku: 'HV-042', category: 'HVAC', stock: 8, minStock: 20, status: 'Low Stock' },
  { name: 'Copper Pipe Fittings', sku: 'PL-108', category: 'Plumbing', stock: 85, minStock: 30, status: 'In Stock' },
]

function SupplyStatusBadge({ status }: { status: SupplyItem['status'] }) {
  return status === 'In Stock' ? (
    <span className="inline-flex items-center rounded-sm bg-[#e8f5e9] px-2 py-1 text-xs font-medium text-[#2e7d32]">
      In Stock
    </span>
  ) : (
    <span className="inline-flex items-center rounded-sm bg-[#e9d4bf] px-2 py-1 text-xs font-medium text-[#6a5b4a]">
      Low Stock
    </span>
  )
}

function SuppliesTab() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SAMPLE_SUPPLIES
    return SAMPLE_SUPPLIES.filter((s) => s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q))
  }, [search])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <BentoMetricCard label="TOTAL ITEMS" value="1,248" description="Across 5 categories" icon={Package} />
        <BentoMetricCard
          label="LOW STOCK ALERTS"
          value="12"
          description="Requires immediate attention"
          icon={Bell}
          tone="danger"
        />
        <BentoMetricCard label="RECENT RESTOCKS" value="45" description="Items restocked this week" icon={Package} />
      </div>

      <div className="flex items-center justify-between">
        <label className="relative w-64">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#d4c2c3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Item"
            className="w-full rounded-sm border border-[rgba(212,194,195,0.5)] bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-[#d4c2c3]"
          />
        </label>
        <PrimaryButton>
          <Plus size={11} weight="bold" />
          New Supply Item
        </PrimaryButton>
      </div>

      <div className="w-full overflow-hidden rounded-sm border border-[rgba(233,212,191,0.5)] bg-white">
        <div className="border-b border-[rgba(233,212,191,0.3)] bg-sidebar px-6 py-6">
          <h3 className="font-heading text-2xl text-[#1b1c1c]">Current Inventory</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-[rgba(233,212,191,0.5)] bg-sidebar">
                {['ITEM NAME', 'CATEGORY', 'CURRENT STOCK', 'MIN STOCK', 'STATUS', 'ACTIONS'].map((col, i) => (
                  <th
                    key={col}
                    className={`px-6 py-4 text-xs font-medium tracking-[1.2px] text-[#605e5b] uppercase ${i === 5 ? 'text-right' : ''}`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.sku} className="border-t border-[rgba(233,212,191,0.3)]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[#f0eded]">
                        <Package size={18} className="text-[#605e5b]" />
                      </div>
                      <div>
                        <p className="text-base font-medium text-[#1b1c1c]">{s.name}</p>
                        <p className="text-xs font-medium text-[#605e5b]">SKU: {s.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-base text-[#605e5b]">{s.category}</td>
                  <td className={`px-6 py-4 text-base font-medium ${s.stock < s.minStock ? 'text-[#ba1a1a]' : 'text-[#1b1c1c]'}`}>
                    {s.stock}
                  </td>
                  <td className="px-6 py-4 text-base text-[#605e5b]">{s.minStock}</td>
                  <td className="px-6 py-4">
                    <SupplyStatusBadge status={s.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end">
                      <button type="button" aria-label="แก้ไขอะไหล่" className="text-ink-muted hover:text-ink">
                        <Pencil size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function BentoMetricCard({
  label,
  value,
  description,
  icon: IconComp,
  tone = 'default',
}: {
  label: string
  value: string
  description: string
  icon: typeof Package
  tone?: 'default' | 'danger'
}) {
  const valueColor = tone === 'danger' ? '#ba1a1a' : '#1b1c1c'
  const labelColor = tone === 'danger' ? '#ba1a1a' : '#605e5b'
  const iconBg = tone === 'danger' ? 'bg-[#ffdad6]' : 'bg-[#f0eded]'
  return (
    <div className="flex h-40 flex-col justify-between rounded-sm border border-[rgba(233,212,191,0.5)] bg-white px-[25px] py-[19px]">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium tracking-[1.2px] uppercase" style={{ color: labelColor }}>
          {label}
        </p>
        <span className={`flex size-8 items-center justify-center rounded-full ${iconBg}`}>
          <IconComp size={15} style={{ color: labelColor }} />
        </span>
      </div>
      <div>
        <p className="font-heading text-[40px] leading-none tracking-[-0.8px]" style={{ color: valueColor }}>
          {value}
        </p>
        <p className="mt-1 text-base text-[#605e5b]">{description}</p>
      </div>
    </div>
  )
}

/* ---------------------------- Tab 3: Schedule & Reminder ---------------------------- */

interface ScheduleEvent {
  day: string
  title: string
  meta: string
  color: string
  border: string
}

const WEEK_EVENTS: (ScheduleEvent | null)[] = [
  { day: 'Mon 14', title: 'Filter Replacement', meta: 'Unit 104 • Kenji', color: 'rgba(230,226,222,0.5)', border: 'rgba(212,194,195,0.3)' },
  { day: 'Tue 15', title: 'Door Lock Repair', meta: 'Unit 201 • Taetae', color: 'rgba(253,203,206,0.3)', border: 'rgba(235,186,189,0.5)' },
  { day: 'Wed 16', title: 'Plumbing Check', meta: 'Unit 305 • External', color: 'rgba(233,212,191,0.3)', border: 'rgba(215,195,175,0.5)' },
  null,
  { day: 'Fri 18', title: 'Garden Upkeep', meta: 'Courtyard • Staff', color: 'rgba(230,226,222,0.5)', border: 'rgba(212,194,195,0.3)' },
]

interface Reminder {
  freq: string
  freqBg: string
  freqText: string
  title: string
  desc: string
  next: string
  active: boolean
}

const REMINDERS: Reminder[] = [
  {
    freq: 'MONTHLY',
    freqBg: '#eae8e7',
    freqText: '#1b1c1c',
    title: 'HVAC Inspection',
    desc: 'Check filters and overall system health across all main units.',
    next: 'Next: 1st of Month',
    active: true,
  },
  {
    freq: 'QUARTERLY',
    freqBg: '#e9d4bf',
    freqText: '#6a5b4a',
    title: 'Fire Safety Audit',
    desc: 'Test alarms and verify extinguisher expiration dates.',
    next: 'Next: Oct 15',
    active: true,
  },
  {
    freq: 'ANNUAL',
    freqBg: '#f0eded',
    freqText: '#605e5b',
    title: 'Roofing Inspection',
    desc: 'Comprehensive check for leaks or damage pre-winter.',
    next: 'Next: Sep 2024',
    active: false,
  },
]

function ScheduleTab() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-lg border border-[rgba(233,212,191,0.5)] bg-white shadow-[0px_4px_20px_0px_rgba(122,84,87,0.08)]">
        <div className="border-b border-[rgba(233,212,191,0.3)] bg-[#f6f3f2] px-3 py-3 text-center text-xs font-medium text-[#605e5b]">
          GMT+9 — This Week
        </div>
        <div className="grid grid-cols-5 divide-x divide-[rgba(233,212,191,0.3)]">
          {WEEK_EVENTS.map((event, i) => (
            <div key={i} className="flex min-h-[200px] flex-col gap-3 p-3">
              <p className={`text-center text-sm font-semibold tracking-[0.7px] ${event ? 'text-[#1b1c1c]' : 'text-[#605e5b]'}`}>
                {event?.day ?? ['Mon 14', 'Tue 15', 'Wed 16', 'Thu 17', 'Fri 18'][i]}
              </p>
              {event ? (
                <div
                  className="rounded-sm border p-[9px]"
                  style={{ backgroundColor: event.color, borderColor: event.border }}
                >
                  <p className="text-sm font-semibold tracking-[0.7px] text-[#1b1c1c]">{event.title}</p>
                  <p className="text-xs font-medium text-[#605e5b]">{event.meta}</p>
                </div>
              ) : (
                <p className="text-center text-xs text-[#c9c6c2]">No events</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="pb-2 font-heading text-2xl text-[#1b1c1c]">Recurring Reminders</h3>
        <div className="flex flex-col gap-4">
          {REMINDERS.map((r) => (
            <div
              key={r.title}
              className={`flex flex-col gap-2 rounded-lg border border-[rgba(233,212,191,0.5)] bg-white p-[17px] ${
                r.active ? '' : 'opacity-70'
              }`}
            >
              <span
                className="w-fit rounded-sm px-2 py-1 text-[10px] font-bold tracking-[0.5px] uppercase"
                style={{ backgroundColor: r.freqBg, color: r.freqText }}
              >
                {r.freq}
              </span>
              <div>
                <p className="text-sm font-semibold tracking-[0.7px] text-[#1b1c1c]">{r.title}</p>
                <p className="text-xs font-medium text-[#605e5b]">{r.desc}</p>
              </div>
              <p className={`pt-1 text-base ${r.active ? 'text-brand' : 'text-[#605e5b]'}`}>{r.next}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 w-full rounded-lg border border-dashed border-avatar-ring py-3 text-center text-sm font-semibold tracking-[0.7px] text-[#605e5b] hover:bg-black/5"
        >
          Add Reminder
        </button>
      </div>
    </div>
  )
}

/* ---------------------------- Tab 4: Maintenance Log ---------------------------- */

/**
 * ครอบ US-18 ทั้งสาม scenario ปุ่ม Export Log อยู่ที่หน้านี้ตามที่ story ระบุ
 * (เฟรม Figma node 196:1102)
 *
 * ต่างจากสามแท็บบนที่ยังใช้ข้อมูลตัวอย่างจาก Figma ตรง ๆ แท็บนี้ดึงจาก API จริง
 * เพราะไฟล์ที่ export ออกไปจะกลายเป็นรายงานที่คนเอาไปใช้ต่อ ถ้าดึงจากค่าคงที่
 * ในโค้ดมันจะเป็นรายงานปลอม ซึ่งอันตรายกว่าการไม่มีปุ่มเสียอีก
 */

const LOG_FILTERS: { id: MaintenanceStatus | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'OPEN', label: 'Open' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'DONE', label: 'Done' },
]

const LOG_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}

function LogStatusBadge({ status }: { status: MaintenanceStatus }) {
  const tone =
    status === 'DONE'
      ? 'bg-[#e8f5e9] text-[#2e7d32]'
      : status === 'IN_PROGRESS'
        ? 'border border-[#d4c2c3] text-[#504444]'
        : 'bg-[#e9d4bf] text-[#6a5b4a]'
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-semibold tracking-[0.6px] ${tone}`}>
      {LOG_STATUS_LABEL[status]}
    </span>
  )
}

function MaintenanceLogTab() {
  const [status, setStatus] = useState<MaintenanceStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const log = useLoader(fetchMaintenanceLog, 'เรียกประวัติงานซ่อมบำรุงไม่สำเร็จ')

  const tickets = useMemo(() => log.data ?? [], [log.data])

  /**
   * US-18-S2 ไฟล์ต้องมีเฉพาะรายการที่ตรงกับตัวกรอง จึงส่งชุดเดียวกันนี้ให้ทั้ง
   * ตารางและปุ่ม export สิ่งที่ผู้ใช้เห็นกับสิ่งที่ได้ในไฟล์จะได้ตรงกันเสมอ
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (status !== 'ALL' && ticket.status !== status) {
        return false
      }
      if (q === '') {
        return true
      }
      return (
        ticket.roomNumber.toLowerCase().includes(q) ||
        ticket.title.toLowerCase().includes(q) ||
        (ticket.detail ?? '').toLowerCase().includes(q)
      )
    })
  }, [tickets, status, search])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {LOG_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatus(option.id)}
                aria-pressed={status === option.id}
                className={`rounded-sm border px-4 py-2 text-sm font-semibold tracking-[0.7px] ${
                  status === option.id
                    ? 'border-[#504444] bg-[#504444] text-white'
                    : 'border-[rgba(212,194,195,0.5)] bg-sidebar text-[#504444] hover:border-[#d4c2c3]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="relative w-64">
            <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#d4c2c3]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Log..."
              aria-label="ค้นหาประวัติงานซ่อมบำรุง"
              className="w-full rounded-sm border border-[rgba(212,194,195,0.5)] bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-[#d4c2c3]"
            />
          </label>
        </div>

        <ExportLogButton tickets={filtered} />
      </div>

      {log.loading && <LoadingState label="กำลังโหลดประวัติงานซ่อมบำรุง..." />}
      {log.error && <ErrorState message={log.error} />}

      {!log.loading && !log.error && (
        <div className="w-full overflow-hidden rounded-lg border border-[rgba(212,194,195,0.3)] bg-sidebar">
          <div className="flex items-center gap-2 border-b border-[rgba(212,194,195,0.3)] px-4 py-4">
            <ClockCounterClockwise size={18} className="text-[#504444]" />
            <h3 className="font-heading text-2xl text-[#1b1c1c]">Maintenance Log</h3>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white p-4">
              <EmptyState
                title={
                  tickets.length === 0
                    ? 'ยังไม่มีประวัติงานซ่อมบำรุงในระบบ'
                    : 'ไม่พบรายการที่ตรงกับตัวกรอง'
                }
                hint={
                  tickets.length === 0
                    ? 'เมื่อมีการแจ้งซ่อมเข้ามา รายการจะขึ้นที่นี่'
                    : 'ลองเปลี่ยนสถานะหรือคำค้นหาดู'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-[rgba(212,194,195,0.3)] bg-[#f6f3f2]">
                    {['Unit', 'Issue', 'Status', 'Reported'].map((col) => (
                      <th key={col} className="p-4 text-sm font-normal tracking-[0.7px] text-[#504444]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-[rgba(212,194,195,0.2)] bg-white last:border-b-0">
                      <td className="px-4 py-4 text-base text-[#1b1c1c]">{ticket.roomNumber}</td>
                      <td className="px-4 py-4">
                        <p className="text-base text-[#1b1c1c]">{ticket.title}</p>
                        {ticket.detail && <p className="text-sm text-[#504444]">{ticket.detail}</p>}
                      </td>
                      <td className="px-4 py-4">
                        <LogStatusBadge status={ticket.status} />
                      </td>
                      <td className="px-4 py-4 text-base text-[#1b1c1c]">{ticket.reportedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
