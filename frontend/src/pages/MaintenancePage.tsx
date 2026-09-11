import { useMemo, useState } from 'react'
import {
  Wrench,
  Package,
  Plus,
  ClockCounterClockwise,
  CalendarBlank,
  DotsThreeVertical,
} from '@phosphor-icons/react'
import { Search, Pencil, Bell } from 'lucide-react'
import { fetchMaintenanceLog } from '../api/client'
import type { MaintenanceStatus } from '../api/types'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { ExportLogButton } from '../components/ExportLogButton'
import { MaintenanceTaskDialog } from '../dialogs/MaintenanceTaskDialog'
import { SupplyItemDialog } from '../dialogs/SupplyItemDialog'
import { RestockDialog } from '../dialogs/RestockDialog'
import { ReminderDialog } from '../dialogs/ReminderDialog'
import { ArrowClockwise } from '@phosphor-icons/react'
import type {
  MaintenanceTask,
  Reminder,
  ScheduleEvent,
  SupplyItem,
  TaskStatus,
} from '../domain/maintenanceBoard'
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  heightPercent,
  isReminderOverdue,
  reminderNextLabel,
  supplyStatus,
  verticalPercent,
  workWeekOf,
} from '../domain/maintenanceBoard'
import { todayInBangkok } from '../format'

/**
 * ตรงกับเฟรม "Maintenance Management" ใน Figma มี 4 sub-tab
 * Maintenance Tasks, Supplies & Inventory, Schedule & Reminder, Maintenance Log
 *
 * backend ยังไม่มี endpoint งานซ่อมบำรุง/สต็อกอะไหล่/ตารางนัดหมายเลยสักตัว
 * (README หัวข้อ "ที่ยังไม่มี" ข้อ 5 บอกว่าจะเป็น V3__maintenance.sql ในอนาคต)
 * สามแท็บแรกจึงเริ่มจากข้อมูลตัวอย่างของดีไซน์แล้วเก็บการแก้ไว้ใน state ของหน้า
 * ป็อปอัปทุกใบทำงานจริงในรอบที่เปิดหน้าอยู่ แต่ปิดหน้าแล้วข้อมูลหาย พอมี
 * endpoint ค่อยเปลี่ยนตรงนี้ให้ยิง API แทน กฎการตรวจฟอร์มอยู่ที่
 * domain/maintenanceBoard.ts ซึ่งไม่ต้องแก้ตอนนั้น
 *
 * ส่วนแท็บ Maintenance Log ต่างจากสามแท็บบน เพราะดึงจาก API จริง เหตุผลอยู่ใน
 * คอมเมนต์ของแท็บนั้นเอง
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
            aria-pressed={tab === t.id}
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

const INITIAL_TASKS: MaintenanceTask[] = [
  {
    id: 1,
    task: 'AC Not Cooling',
    detail: 'Air conditioner is not working',
    maintenanceType: 'HVAC',
    unit: '101',
    priority: 'High',
    assignTo: 'Kenji Tanaka',
    reportBy: 'Sarah J.',
    date: '',
    status: 'In Progress',
  },
  {
    id: 2,
    task: 'Leaking Faucet',
    detail: 'Dripping continuously in kitchen',
    maintenanceType: 'Plumbing',
    unit: '204',
    priority: 'Medium',
    assignTo: 'Mei Lin',
    reportBy: 'David W.',
    date: '',
    status: 'Pending',
  },
  {
    id: 3,
    task: 'Broken Blinds',
    detail: 'Living room window',
    maintenanceType: 'Fixture',
    unit: '205',
    priority: 'Low',
    assignTo: '',
    reportBy: 'Alex P.',
    date: '',
    status: 'Wait for Assign',
  },
]

function TaskStatusBadge({ status }: { status: TaskStatus }) {
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
  const [tasks, setTasks] = useState<MaintenanceTask[]>(INITIAL_TASKS)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MaintenanceTask | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => t.task.toLowerCase().includes(q) || t.unit.includes(q))
  }, [tasks, search])

  /**
   * การ์ดสรุปสี่ใบคำนวณจากรายการจริง ไม่ใช่ตัวเลขคงที่ ตัวเลขในดีไซน์
   * (12 / 5 / 2 / 5) ไม่ตรงกับตารางสามแถวในภาพเดียวกันอยู่แล้ว จึงเป็นค่า
   * ตัวอย่าง ถ้าลอกมาตรง ๆ ผู้ใช้จะเพิ่มงานแล้วเห็นตัวเลขไม่ขยับ
   *
   * ใบที่สี่ในดีไซน์คือ Completed แต่ชุดสถานะของงานมีแค่ In Progress /
   * Pending / Wait for Assign ไม่มีสถานะปิดงาน ใบนี้จึงนับ In Progress แทน
   * รอทีมยืนยันว่าจะเพิ่มสถานะ Completed เข้าไปไหม
   */
  const counts = useMemo(
    () => ({
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'Pending').length,
      highPriority: tasks.filter((t) => t.priority === 'High' || t.priority === 'Urgent').length,
      inProgress: tasks.filter((t) => t.status === 'In Progress').length,
    }),
    [tasks],
  )

  function saveTask(next: MaintenanceTask) {
    setTasks((current) => {
      if (next.id !== 0) {
        return current.map((t) => (t.id === next.id ? next : t))
      }
      const nextId = Math.max(0, ...current.map((t) => t.id)) + 1
      return [...current, { ...next, id: nextId }]
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-stretch gap-6">
        <MiniStatCard label="Total Tasks" value={String(counts.total)} valueColor="#1b1c1c" />
        <MiniStatCard label="Pending" value={String(counts.pending)} valueColor="#6b5c4b" />
        <MiniStatCard
          label="High Priority"
          value={String(counts.highPriority)}
          valueColor="#ba1a1a"
          border="#ffdad6"
        />
        <MiniStatCard label="In Progress" value={String(counts.inProgress)} valueColor="#7a5457" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-64">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#d4c2c3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Task..."
            aria-label="Search tasks"
            className="w-full rounded-sm border border-[rgba(212,194,195,0.5)] bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-[#d4c2c3]"
          />
        </label>
        <PrimaryButton onClick={() => setCreating(true)}>
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
                {/*
                  คอลัมน์สุดท้ายเว้นขอบขวา 24px เท่ากับตาราง Current Inventory
                  ในหน้าเดียวกัน ของเดิมใช้ 16px เท่าคอลัมน์อื่น แต่คอลัมน์อื่น
                  เป็นข้อความชิดซ้ายจึงมีเนื้อที่ว่างด้านขวาอยู่แล้ว ส่วนคอลัมน์นี้
                  ชิดขวา ไอคอนจึงไปจ่ออยู่ที่ขอบการ์ดพอดี (SSK-95)
                */}
                {['Task', 'Unit', 'Assign To', 'Report By', 'Status', 'Action'].map((col, i) => (
                  <th
                    key={col}
                    className={`p-4 text-sm font-normal tracking-[0.7px] text-[#504444] ${i === 5 ? 'pr-6 text-right' : ''}`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-[rgba(212,194,195,0.2)] bg-white last:border-b-0"
                >
                  <td className="px-4 py-4">
                    <p className="text-base text-[#1b1c1c]">{t.task}</p>
                    <p className="text-sm text-[#504444]">{t.detail}</p>
                  </td>
                  <td className="px-4 py-4 text-base text-[#1b1c1c]">{t.unit}</td>
                  <td className="px-4 py-4 text-base text-[#1b1c1c]">{t.assignTo || '-'}</td>
                  <td className="px-4 py-4 text-base text-[#1b1c1c]">{t.reportBy || '-'}</td>
                  <td className="px-4 py-4">
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td className="py-4 pr-6 pl-4">
                    <div className="flex justify-end">
                      {/*
                        ชื่อปุ่มต้องมีชื่องานอยู่ด้วย เพราะทุกแถวมีปุ่มดินสอเหมือนกัน
                        ถ้าใช้แค่คำว่า "แก้ไขงาน" คนใช้ screen reader กับตัวเทสจะ
                        แยกไม่ออกว่าปุ่มไหนของแถวไหน

                        ปุ่มมี padding รอบไอคอนเพื่อให้พื้นที่กดใหญ่กว่าตัวไอคอน
                        ของเดิมกดโดนเฉพาะไอคอน 18px ซึ่ง QA ทักว่ากดพลาดง่าย
                      */}
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        aria-label={`Edit task ${t.task}`}
                        className="rounded p-1.5 text-ink-muted hover:bg-black/5 hover:text-ink"
                      >
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

      {creating && (
        <MaintenanceTaskDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSave={saveTask}
        />
      )}
      {editing && (
        <MaintenanceTaskDialog
          mode="edit"
          task={editing}
          onClose={() => setEditing(null)}
          onSave={saveTask}
        />
      )}
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
      role="group"
      aria-label={`${label} tasks`}
      className="flex min-w-[160px] flex-1 flex-col justify-between gap-2 rounded-lg border bg-white p-[17px]"
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

const INITIAL_SUPPLIES: SupplyItem[] = [
  { id: 1, name: 'LED Bulbs 60W', sku: 'EL-001', category: 'Electrical', stock: 145, minStock: 50 },
  { id: 2, name: 'Air Filters 16x20x1', sku: 'HV-042', category: 'HVAC', stock: 8, minStock: 20 },
  {
    id: 3,
    name: 'Copper Pipe Fittings',
    sku: 'PL-108',
    category: 'Plumbing',
    stock: 85,
    minStock: 30,
  },
]

function SupplyStatusBadge({ item }: { item: SupplyItem }) {
  return supplyStatus(item) === 'In Stock' ? (
    <span className="inline-flex items-center rounded-sm bg-[#e8f5e9] px-2 py-1 text-xs font-medium text-[#2e7d32]">
      In Stock
    </span>
  ) : (
    <span className="inline-flex items-center rounded-sm bg-[#e9d4bf] px-2 py-1 text-xs font-medium text-[#6a5b4a]">
      Low Stock
    </span>
  )
}

/** ออกรหัส SKU ให้ของที่เพิ่มใหม่ ตารางโชว์ SKU ทุกแถว จะปล่อยว่างไม่ได้ */
function makeSku(category: string, id: number): string {
  const prefix = (category.replace(/[^A-Za-z]/g, '').slice(0, 2) || 'XX').toUpperCase()
  return `${prefix}-${String(id).padStart(3, '0')}`
}

function SuppliesTab() {
  const [supplies, setSupplies] = useState<SupplyItem[]>(INITIAL_SUPPLIES)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<SupplyItem | null>(null)
  const [restocking, setRestocking] = useState<SupplyItem | null>(null)
  // นับเฉพาะรอบที่แอปเปิดอยู่ ยังไม่มี backend เก็บประวัติ restock จริง
  const [recentRestocks, setRecentRestocks] = useState(0)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return supplies
    return supplies.filter(
      (s) => s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q),
    )
  }, [supplies, search])

  const lowStockCount = supplies.filter((s) => supplyStatus(s) === 'Low Stock').length
  const categoryCount = new Set(supplies.map((s) => s.category)).size

  function saveSupply(next: SupplyItem) {
    setSupplies((current) => {
      if (next.id !== 0) {
        return current.map((s) => (s.id === next.id ? { ...next, sku: s.sku } : s))
      }
      const nextId = Math.max(0, ...current.map((s) => s.id)) + 1
      return [...current, { ...next, id: nextId, sku: makeSku(next.category, nextId) }]
    })
  }

  /** US-17-S2 บวกจำนวนที่เติมเข้ากับของเดิม ไม่ใช่ตั้งค่าใหม่ทั้งก้อน */
  function restockSupply(id: number, addedAmount: number) {
    setSupplies((current) =>
      current.map((s) => (s.id === id ? { ...s, stock: s.stock + addedAmount } : s)),
    )
    setRecentRestocks((count) => count + 1)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <BentoMetricCard
          label="TOTAL ITEMS"
          value={String(supplies.length)}
          description={`Across ${categoryCount} categories`}
          icon={Package}
        />
        <BentoMetricCard
          label="LOW STOCK ALERTS"
          value={String(lowStockCount)}
          description="Requires immediate attention"
          icon={Bell}
          tone="danger"
        />
        <BentoMetricCard
          label="RECENT RESTOCKS"
          value={String(recentRestocks)}
          description="Restocks this session"
          icon={Package}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-64">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#d4c2c3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Item"
            aria-label="Search items"
            className="w-full rounded-sm border border-[rgba(212,194,195,0.5)] bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-[#d4c2c3]"
          />
        </label>
        <PrimaryButton onClick={() => setCreating(true)}>
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
                {['ITEM NAME', 'CATEGORY', 'CURRENT STOCK', 'MIN STOCK', 'STATUS', 'ACTIONS'].map(
                  (col, i) => (
                    <th
                      key={col}
                      className={`px-6 py-4 text-xs font-medium tracking-[1.2px] text-[#605e5b] uppercase ${i === 5 ? 'text-right' : ''}`}
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-[rgba(233,212,191,0.3)]">
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
                  <td
                    className={`px-6 py-4 text-base font-medium ${s.stock < s.minStock ? 'text-[#ba1a1a]' : 'text-[#1b1c1c]'}`}
                  >
                    {s.stock}
                  </td>
                  <td className="px-6 py-4 text-base text-[#605e5b]">{s.minStock}</td>
                  <td className="px-6 py-4">
                    <SupplyStatusBadge item={s} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setRestocking(s)}
                        aria-label={`Restock ${s.name}`}
                        className="text-ink-muted hover:text-ink"
                      >
                        <ArrowClockwise size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        aria-label={`Edit item ${s.name}`}
                        className="text-ink-muted hover:text-ink"
                      >
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

      {creating && (
        <SupplyItemDialog mode="create" onClose={() => setCreating(false)} onSave={saveSupply} />
      )}
      {editing && (
        <SupplyItemDialog
          mode="edit"
          item={editing}
          onClose={() => setEditing(null)}
          onSave={saveSupply}
        />
      )}
      {restocking && (
        <RestockDialog
          item={restocking}
          onClose={() => setRestocking(null)}
          onRestocked={restockSupply}
        />
      )}
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
        <p
          className="font-heading text-[40px] leading-none tracking-[-0.8px]"
          style={{ color: valueColor }}
        >
          {value}
        </p>
        <p className="mt-1 text-base text-[#605e5b]">{description}</p>
      </div>
    </div>
  )
}

/* ---------------------------- Tab 3: Schedule & Reminder ---------------------------- */

/**
 * ปฏิทินรอบนี้ทำเป็นตารางที่มีแกนเวลาจริงตามดีไซน์ใหม่ ของเดิม simplify เป็น
 * กริดคอลัมน์ต่อวันแบบไม่มีแกนเวลา ซึ่งอ่านไม่ออกว่างานไหนชนกันหรือกินเวลานาน
 * แค่ไหน อันนี้คือสาระของหน้าตารางนัด
 *
 * บล็อกงานวางด้วยเปอร์เซ็นต์ที่คำนวณจากเวลาเริ่มกับเวลาจบ ไม่ได้ฝังพิกัด px
 * ไว้ในข้อมูล เพราะถ้าฝัง px ตารางจะพังทันทีที่จอแคบลงแล้วความสูงเปลี่ยน และ
 * เวลาแก้ข้อมูลคนแก้ต้องมานั่งคำนวณพิกัดเอง ซึ่งผิดง่ายมาก
 */

/**
 * QA ทักว่าปฏิทินเดิมตรึงตายไว้ที่ Mon 14 ถึง Fri 18 เปิดวันไหนก็เห็นสัปดาห์
 * เดิม ซึ่งทำให้เส้นบอกเวลาปัจจุบันไม่มีความหมายเพราะไม่รู้ว่าอยู่คอลัมน์ไหน
 * ตอนนี้คำนวณจากวันจริงตามเวลาไทย และชื่อวันเก็บไว้ที่เดียว ไม่ได้เขียนซ้ำสองที่
 * แบบเดิมที่ QA ทักว่าถ้าแก้ที่หนึ่งแล้วลืมอีกที่ หัวคอลัมน์กับเนื้อหาจะเพี้ยนกัน
 */

/** เส้นบอกเวลาที่ดีไซน์ตีไว้ ทุกสองชั่วโมง */
const HOUR_MARKS = ['09:00', '11:00', '13:00', '15:00', '17:00']

const EVENT_TONE: Record<ScheduleEvent['tone'], { background: string; borderColor: string }> = {
  neutral: { background: 'rgba(230,226,222,0.5)', borderColor: 'rgba(212,194,195,0.3)' },
  rose: { background: 'rgba(253,203,206,0.3)', borderColor: 'rgba(235,186,189,0.5)' },
  sand: { background: 'rgba(233,212,191,0.3)', borderColor: 'rgba(215,195,175,0.5)' },
}

const WEEK_EVENTS: ScheduleEvent[] = [
  {
    id: 1,
    dayIndex: 0,
    start: '09:00',
    end: '10:30',
    title: 'Filter Replacement',
    meta: 'Unit 104 • Kenji',
    tone: 'neutral',
  },
  {
    id: 2,
    dayIndex: 1,
    start: '10:45',
    end: '12:00',
    title: 'Door Lock Repair',
    meta: 'Unit 201 • Taetae',
    tone: 'rose',
  },
  {
    id: 3,
    dayIndex: 2,
    start: '12:00',
    end: '13:30',
    title: 'Plumbing Check',
    meta: 'Unit 305 • External',
    tone: 'sand',
  },
  {
    id: 4,
    dayIndex: 4,
    start: '09:30',
    end: '11:00',
    title: 'Garden Upkeep',
    meta: 'Courtyard • Staff',
    tone: 'neutral',
  },
]

const INITIAL_REMINDERS: Reminder[] = [
  {
    id: 1,
    name: 'HVAC Inspection',
    frequency: 'Monthly',
    startDate: '2026-09-01',
    unit: '',
    time: '09:00',
    priority: 'Medium',
    notes: 'Check filters and overall system health across all main units.',
    active: true,
  },
  {
    id: 2,
    name: 'Fire Safety Audit',
    frequency: 'Quarterly',
    startDate: '2026-10-15',
    unit: '',
    time: '09:00',
    priority: 'High',
    notes: 'Test alarms and verify extinguisher expiration dates.',
    active: true,
  },
  {
    id: 3,
    name: 'Roofing Inspection',
    frequency: 'Annual',
    startDate: '2024-09-01',
    unit: '',
    time: '09:00',
    priority: 'Low',
    notes: 'Comprehensive check for leaks or damage pre-winter.',
    active: false,
  },
]

const FREQUENCY_CHIP: Record<string, { background: string; color: string }> = {
  'One-time': { background: '#f0eded', color: '#605e5b' },
  Monthly: { background: '#eae8e7', color: '#1b1c1c' },
  Quarterly: { background: '#e9d4bf', color: '#6a5b4a' },
  Annual: { background: '#f0eded', color: '#605e5b' },
}

/**
 * เส้นสีแดงบอกเวลาปัจจุบัน คืน null เมื่อตอนนี้อยู่นอกช่วงที่ตารางแสดง
 * จะได้ไม่มีเส้นไปเกาะติดขอบบนหรือขอบล่างค้างไว้ทั้งคืน
 */
function currentTimePercent(): number | null {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes < DAY_START_HOUR * 60 || minutes > DAY_END_HOUR * 60) {
    return null
  }
  return verticalPercent(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
}

function WeekCalendar({ today }: { today: string }) {
  const nowPercent = currentTimePercent()
  const weekDays = workWeekOf(today)

  return (
    <div className="overflow-hidden rounded-lg border border-[rgba(233,212,191,0.5)] bg-white shadow-[0px_4px_20px_0px_rgba(122,84,87,0.08)]">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[88px_repeat(5,1fr)] border-b border-[rgba(233,212,191,0.3)] bg-[#f6f3f2]">
            {/*
              ดีไซน์เขียนว่า GMT+9 ซึ่งเป็นเวลาญี่ปุ่น แต่อพาร์ตเมนต์อยู่ไทย
              QA ทักไว้ จึงแก้เป็น GMT+7 ให้ตรงกับเวลาที่ใช้จริงทั้งระบบ
            */}
            <div className="px-3 py-3 text-center text-xs font-medium text-[#605e5b]">GMT+7</div>
            {weekDays.map((day) => (
              <div
                key={day.date}
                className={`border-l border-[rgba(233,212,191,0.3)] px-3 py-3 text-center text-sm font-semibold tracking-[0.7px] ${
                  day.date === today ? 'text-brand' : 'text-[#1b1c1c]'
                }`}
              >
                {day.label}
              </div>
            ))}
          </div>

          <div className="grid h-[480px] grid-cols-[88px_repeat(5,1fr)]">
            {/* ช่องเวลา ตัวเลขวางคร่อมเส้นเพื่อให้อ่านคู่กับเส้นได้ตรงตัว */}
            <div className="relative">
              {HOUR_MARKS.map((mark) => (
                <span
                  key={mark}
                  className="absolute right-3 -translate-y-1/2 text-xs font-medium text-[#605e5b]"
                  style={{ top: `${verticalPercent(mark)}%` }}
                >
                  {mark}
                </span>
              ))}
            </div>

            {weekDays.map((day, dayIndex) => (
              <div
                key={day.date}
                className="relative border-l border-[rgba(233,212,191,0.3)]"
                aria-label={`Schedule for ${day.label}`}
              >
                {HOUR_MARKS.map((mark) => (
                  <div
                    key={mark}
                    className="absolute inset-x-0 border-t border-[rgba(233,212,191,0.3)]"
                    style={{ top: `${verticalPercent(mark)}%` }}
                    aria-hidden="true"
                  />
                ))}

                {WEEK_EVENTS.filter((event) => event.dayIndex === dayIndex).map((event) => (
                  <div
                    key={event.id}
                    /*
                      minHeight กันงานสั้น ๆ ไม่ให้บล็อกเตี้ยกว่าข้อความข้างใน
                      งานหนึ่งชั่วโมงกว่า ๆ ได้ความสูงราว 60px ซึ่งไม่พอใส่ชื่อ
                      งานสองบรรทัดบวกบรรทัดห้อง แล้วบรรทัดล่างจะโดนตัดหายไปเฉย ๆ
                    */
                    className="absolute inset-x-1 overflow-hidden rounded-sm border px-2 py-1.5"
                    style={{
                      top: `${verticalPercent(event.start)}%`,
                      height: `${heightPercent(event.start, event.end)}%`,
                      minHeight: '3.75rem',
                      ...EVENT_TONE[event.tone],
                    }}
                  >
                    <p className="text-sm leading-tight font-semibold tracking-[0.7px] text-[#1b1c1c]">
                      {event.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-tight font-medium text-[#605e5b]">
                      {event.meta}
                    </p>
                  </div>
                ))}

                {/*
                  เส้นบอกเวลาปัจจุบันวาดเฉพาะคอลัมน์ของวันนี้ ของเดิมวาดทุก
                  คอลัมน์ซึ่งอ่านแล้วไม่รู้ว่าหมายถึงวันไหน
                */}
                {nowPercent !== null && day.date === today && (
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t border-[#ba1a1a]"
                    style={{ top: `${nowPercent}%` }}
                    aria-hidden="true"
                  >
                    <span className="absolute -top-[3px] -left-[3px] size-1.5 rounded-full bg-[#ba1a1a]" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ScheduleTab() {
  const [reminders, setReminders] = useState<Reminder[]>(INITIAL_REMINDERS)
  const [adding, setAdding] = useState(false)
  const today = todayInBangkok()

  function addReminder(next: Reminder) {
    setReminders((current) => [
      ...current,
      { ...next, id: Math.max(0, ...current.map((r) => r.id)) + 1 },
    ])
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <WeekCalendar today={today} />

      <div className="flex flex-col gap-2">
        <h3 className="pb-2 font-heading text-2xl text-[#1b1c1c]">Recurring</h3>
        <div className="flex flex-col gap-4">
          {reminders.map((r) => {
            const chip = FREQUENCY_CHIP[r.frequency] ?? FREQUENCY_CHIP['One-time']
            const overdue = isReminderOverdue(r, today)
            return (
              <div
                key={r.id}
                className={`flex flex-col gap-2 rounded-lg border border-[rgba(233,212,191,0.5)] bg-white p-[17px] ${
                  r.active ? '' : 'opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="w-fit rounded-sm px-2 py-1 text-[10px] font-bold tracking-[0.5px] uppercase"
                      style={{ backgroundColor: chip.background, color: chip.color }}
                    >
                      {r.frequency}
                    </span>
                    {/*
                      US-14-S2 บอกว่าถึงกำหนดต้องแจ้งเตือน QA ทักว่าการ์ดที่เลย
                      กำหนดมาสองปีแล้วยังแสดงเฉย ๆ ไม่มีอะไรบอก
                    */}
                    {overdue && (
                      <span className="w-fit rounded-sm bg-[#ffdad6] px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-[#ba1a1a] uppercase">
                        Overdue
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Options for ${r.name}`}
                    className="-mr-1 shrink-0 rounded p-0.5 text-[#605e5b] hover:bg-black/5"
                  >
                    <DotsThreeVertical size={16} weight="bold" />
                  </button>
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.7px] text-[#1b1c1c]">{r.name}</p>
                  <p className="text-xs font-medium text-[#605e5b]">{r.notes}</p>
                </div>
                <p
                  className={`flex items-center gap-1.5 pt-1 text-base ${
                    overdue ? 'text-[#ba1a1a]' : r.active ? 'text-brand' : 'text-[#605e5b]'
                  }`}
                >
                  <CalendarBlank size={14} />
                  {reminderNextLabel(r, today)}
                </p>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-avatar-ring py-3 text-center text-sm font-semibold tracking-[0.7px] text-[#605e5b] hover:bg-black/5"
        >
          <Plus size={12} weight="bold" />
          Add Reminder
        </button>
      </div>

      {adding && <ReminderDialog onClose={() => setAdding(false)} onSave={addReminder} />}
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
  const log = useLoader(fetchMaintenanceLog, 'Could not load the maintenance log')

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
              aria-label="Search the maintenance log"
              className="w-full rounded-sm border border-[rgba(212,194,195,0.5)] bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-[#d4c2c3]"
            />
          </label>
        </div>

        <ExportLogButton tickets={filtered} />
      </div>

      {log.loading && <LoadingState label="Loading the maintenance log..." />}
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
                    ? 'No maintenance history yet'
                    : 'Nothing matches your filter'
                }
                hint={
                  tickets.length === 0
                    ? 'Tickets will appear here once maintenance is reported'
                    : 'Try another status or search term'
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
