import { useMemo, useState } from 'react'
import {
  Wrench,
  Package,
  Plus,
  ClockCounterClockwise,
  CalendarBlank,
  DotsThreeVertical,
} from '@phosphor-icons/react'
import { Search, Pencil, Bell, Trash2 } from 'lucide-react'
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
import { DeleteSupplyDialog } from '../dialogs/DeleteSupplyDialog'
import { DeleteMaintenanceTaskDialog } from '../dialogs/DeleteMaintenanceTaskDialog'
import { ReminderDialog } from '../dialogs/ReminderDialog'
import { DeleteReminderDialog } from '../dialogs/DeleteReminderDialog'
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
import { displayDate, todayInBangkok } from '../format'

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

      <div className="inline-flex w-fit gap-2 rounded-md border border-avatar-ring/30 bg-sand-60 p-[9px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`rounded-sm px-6 py-2 text-sm font-semibold tracking-[0.7px] whitespace-nowrap ${
              tab === t.id
                ? 'border border-sand-80 bg-sidebar text-body-muted shadow-[0px_1px_1px_rgba(0,0,0,0.05)]'
                : 'text-body-muted hover:text-brand'
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
      <span className="inline-flex items-center rounded-sm bg-sand-100 px-2 py-1 text-xs font-semibold tracking-[0.6px] text-sand-580">
        {status}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-sm border border-avatar-ring px-2 py-1 text-xs font-semibold tracking-[0.6px] text-body-muted">
      {status}
    </span>
  )
}

function MaintenanceTasksTab() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>(INITIAL_TASKS)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MaintenanceTask | null>(null)
  const [deleting, setDeleting] = useState<MaintenanceTask | null>(null)

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

  /*
    ชื่อที่เคยใช้ในระบบ เอาไปเสนอในช่อง Assigned To / Report By ของป็อปอัป
    ระบบยังไม่มี API พนักงาน (SSK-94) จึงดึงจากงานที่มีอยู่แทน คนใช้จะได้เลือก
    ชื่อเดิมแทนการพิมพ์ใหม่ทุกครั้ง ซึ่งเป็นต้นเหตุที่ชื่อคนเดียวกันสะกดไม่ตรง
  */
  const knownNames = useMemo(() => {
    const pick = (get: (t: MaintenanceTask) => string) =>
      [...new Set(tasks.map(get).filter((name) => name !== ''))].sort((a, b) =>
        a.localeCompare(b),
      )
    return { assignees: pick((t) => t.assignTo), reporters: pick((t) => t.reportBy) }
  }, [tasks])

  function saveTask(next: MaintenanceTask) {
    setTasks((current) => {
      if (next.id !== 0) {
        return current.map((t) => (t.id === next.id ? next : t))
      }
      const nextId = Math.max(0, ...current.map((t) => t.id)) + 1
      return [...current, { ...next, id: nextId }]
    })
  }

  function deleteTask(id: number) {
    setTasks((current) => current.filter((t) => t.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-stretch gap-6">
        <MiniStatCard label="Total Tasks" value={String(counts.total)} valueClass="text-ink" />
        <MiniStatCard label="Pending" value={String(counts.pending)} valueClass="text-honey-600" />
        <MiniStatCard
          label="High Priority"
          value={String(counts.highPriority)}
          valueClass="text-alert-600"
          borderClass="border-blush-100"
        />
        <MiniStatCard label="In Progress" value={String(counts.inProgress)} valueClass="text-brand" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-64">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-avatar-ring" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Task..."
            aria-label="Search tasks"
            className="w-full rounded-sm border border-avatar-ring/50 bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-avatar-ring"
          />
        </label>
        <PrimaryButton onClick={() => setCreating(true)}>
          <Plus size={11} weight="bold" />
          New Task
        </PrimaryButton>
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-avatar-ring/30 bg-sidebar">
        <div className="flex items-center gap-2 border-b border-avatar-ring/30 px-4 py-4">
          <Wrench size={18} className="text-body-muted" />
          <h3 className="font-heading text-2xl text-ink">Task Overview</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-avatar-ring/30 bg-page-bg">
                {/*
                  คอลัมน์สุดท้ายเว้นขอบขวา 24px เท่ากับตาราง Current Inventory
                  ในหน้าเดียวกัน ของเดิมใช้ 16px เท่าคอลัมน์อื่น แต่คอลัมน์อื่น
                  เป็นข้อความชิดซ้ายจึงมีเนื้อที่ว่างด้านขวาอยู่แล้ว ส่วนคอลัมน์นี้
                  ชิดขวา ไอคอนจึงไปจ่ออยู่ที่ขอบการ์ดพอดี (SSK-95)
                */}
                {['Task', 'Unit', 'Assign To', 'Report By', 'Status', 'Action'].map((col, i) => (
                  <th
                    key={col}
                    className={`p-4 text-sm font-normal tracking-[0.7px] text-body-muted ${i === 5 ? 'pr-6 text-right' : ''}`}
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
                  className="border-b border-avatar-ring/20 bg-white last:border-b-0"
                >
                  <td className="px-4 py-4">
                    <p className="text-base text-ink">{t.task}</p>
                    <p className="text-sm text-body-muted">{t.detail}</p>
                  </td>
                  <td className="px-4 py-4 text-base text-ink">{t.unit}</td>
                  <td className="px-4 py-4 text-base text-ink">{t.assignTo || '-'}</td>
                  <td className="px-4 py-4 text-base text-ink">{t.reportBy || '-'}</td>
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
                      {/*
                        หน้าอื่น (Supplies & Inventory, Schedule &
                        Reminder) มีปุ่มลบอยู่แล้ว แต่แท็บ
                        นี้ยังไม่มี เพิ่มให้ครบตามทีมขอ
                      */}
                      <button
                        type="button"
                        onClick={() => setDeleting(t)}
                        aria-label={`Delete task ${t.task}`}
                        className="rounded p-1.5 text-alert-600 hover:bg-black/5 hover:text-wine-680"
                      >
                        <Trash2 size={18} />
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
          assignees={knownNames.assignees}
          reporters={knownNames.reporters}
          onClose={() => setCreating(false)}
          onSave={saveTask}
        />
      )}
      {deleting && (
        <DeleteMaintenanceTaskDialog
          task={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            deleteTask(deleting.id)
            setDeleting(null)
          }}
        />
      )}
      {editing && (
        <MaintenanceTaskDialog
          mode="edit"
          task={editing}
          assignees={knownNames.assignees}
          reporters={knownNames.reporters}
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
  valueClass,
  borderClass = 'border-avatar-ring/30',
}: {
  label: string
  value: string
  /** คลาสสีของตัวเลข ส่งเป็นคลาสไม่ใช่ค่าสี จะได้ไม่หลุดจากระบบ token */
  valueClass: string
  borderClass?: string
}) {
  return (
    <div
      role="group"
      aria-label={`${label} tasks`}
      className={`flex min-w-[160px] flex-1 flex-col justify-between gap-2 rounded-lg border bg-white p-[17px] ${borderClass}`}
    >
      <p className="text-sm font-semibold tracking-[0.7px] text-body-muted">{label}</p>
      <p className={`font-heading text-2xl ${valueClass}`}>{value}</p>
    </div>
  )
}

/* ---------------------------- Tab 2: Supplies & Inventory ---------------------------- */

const INITIAL_SUPPLIES: SupplyItem[] = [
  { id: 1, name: 'LED Bulbs 60W', sku: 'EL-001', category: 'Electrical', stock: 145, minStock: 50, maxStock: 200 },
  { id: 2, name: 'Air Filters 16x20x1', sku: 'HV-042', category: 'HVAC', stock: 8, minStock: 20, maxStock: 60 },
  {
    id: 3,
    name: 'Copper Pipe Fittings',
    sku: 'PL-108',
    category: 'Plumbing',
    stock: 85,
    minStock: 30,
    maxStock: 120,
  },
]

function SupplyStatusBadge({ item }: { item: SupplyItem }) {
  return supplyStatus(item) === 'In Stock' ? (
    <span className="inline-flex items-center rounded-sm bg-moss-50 px-2 py-1 text-xs font-medium text-moss-545">
      In Stock
    </span>
  ) : (
    <span className="inline-flex items-center rounded-sm bg-honey-140 px-2 py-1 text-xs font-medium text-honey-600">
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
  const [deleting, setDeleting] = useState<SupplyItem | null>(null)
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

  function deleteSupply(id: number) {
    setSupplies((current) => current.filter((s) => s.id !== id))
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
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-avatar-ring" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Item"
            aria-label="Search items"
            className="w-full rounded-sm border border-avatar-ring/50 bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-avatar-ring"
          />
        </label>
        <PrimaryButton onClick={() => setCreating(true)}>
          <Plus size={11} weight="bold" />
          New Supply Item
        </PrimaryButton>
      </div>

      <div className="w-full overflow-hidden rounded-sm border border-honey-140/50 bg-white">
        <div className="border-b border-honey-140/30 bg-sidebar px-6 py-6">
          <h3 className="font-heading text-2xl text-ink">Current Inventory</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-honey-140/50 bg-sidebar">
                {['ITEM NAME', 'CATEGORY', 'CURRENT STOCK', 'MIN STOCK', 'MAX STOCK', 'STATUS', 'ACTIONS'].map(
                  (col, i) => (
                    <th
                      key={col}
                      className={`px-6 py-4 text-xs font-medium tracking-[1.2px] text-ink-muted uppercase ${i === 6 ? 'text-right' : ''}`}
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-honey-140/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-sand-60">
                        <Package size={18} className="text-ink-muted" />
                      </div>
                      <div>
                        <p className="text-base font-medium text-ink">{s.name}</p>
                        <p className="text-xs font-medium text-ink-muted">SKU: {s.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-base text-ink-muted">{s.category}</td>
                  <td
                    className={`px-6 py-4 text-base font-medium ${s.stock < s.minStock ? 'text-alert-600' : 'text-ink'}`}
                  >
                    {s.stock}
                  </td>
                  <td className="px-6 py-4 text-base text-ink-muted">{s.minStock}</td>
                  <td className="px-6 py-4 text-base text-ink-muted">{s.maxStock}</td>
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
                      {/*
                        BUG-M6 ใน SSK-111 — ตารางนี้ไม่มีทางลบแถวเลยสักปุ่ม
                        ใช้สีแดงแยกจากปุ่มอื่นเพราะเป็นการกระทำที่ย้อนกลับไม่ได้
                      */}
                      <button
                        type="button"
                        onClick={() => setDeleting(s)}
                        aria-label={`Delete item ${s.name}`}
                        className="text-alert-600 hover:text-wine-680"
                      >
                        <Trash2 size={18} />
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
      {deleting && (
        <DeleteSupplyDialog
          item={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            deleteSupply(deleting.id)
            setDeleting(null)
          }}
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
  const valueClass = tone === 'danger' ? 'text-alert-600' : 'text-ink'
  const labelClass = tone === 'danger' ? 'text-alert-600' : 'text-ink-muted'
  const iconBg = tone === 'danger' ? 'bg-blush-100' : 'bg-sand-60'
  return (
    <div className="flex h-40 flex-col justify-between rounded-sm border border-honey-140/50 bg-white px-[25px] py-[19px]">
      <div className="flex items-start justify-between">
        <p className={`text-xs font-medium tracking-[1.2px] uppercase ${labelClass}`}>
          {label}
        </p>
        <span className={`flex size-8 items-center justify-center rounded-full ${iconBg}`}>
          <IconComp size={15} className={labelClass} />
        </span>
      </div>
      <div>
        <p className={`font-heading text-[40px] leading-none tracking-[-0.8px] ${valueClass}`}>
          {value}
        </p>
        <p className="mt-1 text-base text-ink-muted">{description}</p>
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

const EVENT_TONE: Record<ScheduleEvent['tone'], string> = {
  neutral: 'bg-sand-100/50 border-avatar-ring/30',
  rose: 'bg-accent-soft/30 border-blush-225/50',
  sand: 'bg-honey-140/30 border-honey-170/50',
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

const FREQUENCY_CHIP: Record<string, string> = {
  'One-time': 'bg-sand-60 text-ink-muted',
  Monthly: 'bg-sand-90 text-ink',
  Quarterly: 'bg-honey-140 text-honey-600',
  Annual: 'bg-sand-60 text-ink-muted',
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
    <div className="overflow-hidden rounded-lg border border-honey-140/50 bg-white shadow-[0px_4px_20px_0px_rgba(122,84,87,0.08)]">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[88px_repeat(5,1fr)] border-b border-honey-140/30 bg-page-bg">
            {/*
              ดีไซน์เขียนว่า GMT+9 ซึ่งเป็นเวลาญี่ปุ่น แต่อพาร์ตเมนต์อยู่ไทย
              QA ทักไว้ จึงแก้เป็น GMT+7 ให้ตรงกับเวลาที่ใช้จริงทั้งระบบ
            */}
            <div className="px-3 py-3 text-center text-xs font-medium text-ink-muted">GMT+7</div>
            {weekDays.map((day) => (
              <div
                key={day.date}
                className={`border-l border-honey-140/30 px-3 py-3 text-center text-sm font-semibold tracking-[0.7px] ${
                  day.date === today ? 'text-brand' : 'text-ink'
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
                  className="absolute right-3 -translate-y-1/2 text-xs font-medium text-ink-muted"
                  style={{ top: `${verticalPercent(mark)}%` }}
                >
                  {mark}
                </span>
              ))}
            </div>

            {weekDays.map((day, dayIndex) => (
              <div
                key={day.date}
                className="relative border-l border-honey-140/30"
                aria-label={`Schedule for ${day.label}`}
              >
                {HOUR_MARKS.map((mark) => (
                  <div
                    key={mark}
                    className="absolute inset-x-0 border-t border-honey-140/30"
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
                    className={`absolute inset-x-1 overflow-hidden rounded-sm border px-2 py-1.5 ${EVENT_TONE[event.tone]}`}
                    style={{
                      top: `${verticalPercent(event.start)}%`,
                      height: `${heightPercent(event.start, event.end)}%`,
                      minHeight: '3.75rem',
                    }}
                  >
                    <p className="text-sm leading-tight font-semibold tracking-[0.7px] text-ink">
                      {event.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-tight font-medium text-ink-muted">
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
                    className="pointer-events-none absolute inset-x-0 border-t border-alert-600"
                    style={{ top: `${nowPercent}%` }}
                    aria-hidden="true"
                  >
                    <span className="absolute -top-[3px] -left-[3px] size-1.5 rounded-full bg-alert-600" />
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
  const [deletingReminder, setDeletingReminder] = useState<Reminder | null>(null)
  const today = todayInBangkok()

  function addReminder(next: Reminder) {
    setReminders((current) => [
      ...current,
      { ...next, id: Math.max(0, ...current.map((r) => r.id)) + 1 },
    ])
  }

  function deleteReminder(id: number) {
    setReminders((current) => current.filter((r) => r.id !== id))
    setDeletingReminder(null)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <WeekCalendar today={today} />

      <div className="flex flex-col gap-2">
        <h3 className="pb-2 font-heading text-2xl text-ink">Recurring</h3>
        <div className="flex flex-col gap-4">
          {reminders.map((r) => {
            const chip = FREQUENCY_CHIP[r.frequency] ?? FREQUENCY_CHIP['One-time']
            const overdue = isReminderOverdue(r, today)
            return (
              <div
                key={r.id}
                className={`flex flex-col gap-2 rounded-lg border border-honey-140/50 bg-white p-[17px] ${
                  r.active ? '' : 'opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`w-fit rounded-sm px-2 py-1 text-[10px] font-bold tracking-[0.5px] uppercase ${chip}`}
                    >
                      {r.frequency}
                    </span>
                    {/*
                      US-14-S2 บอกว่าถึงกำหนดต้องแจ้งเตือน QA ทักว่าการ์ดที่เลย
                      กำหนดมาสองปีแล้วยังแสดงเฉย ๆ ไม่มีอะไรบอก
                    */}
                    {overdue && (
                      <span className="w-fit rounded-sm bg-blush-100 px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-alert-600 uppercase">
                        Overdue
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeletingReminder(r)}
                    aria-label={`Options for ${r.name}`}
                    className="-mr-1 shrink-0 rounded p-1 text-ink-muted hover:bg-black/5 hover:text-alert-600 transition-colors cursor-pointer"
                  >
                    <DotsThreeVertical size={16} weight="bold" />
                  </button>
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.7px] text-ink">{r.name}</p>
                  <p className="text-xs font-medium text-ink-muted">{r.notes}</p>
                </div>
                <p
                  className={`flex items-center gap-1.5 pt-1 text-base ${
                    overdue ? 'text-alert-600' : r.active ? 'text-brand' : 'text-ink-muted'
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
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-avatar-ring py-3 text-center text-sm font-semibold tracking-[0.7px] text-ink-muted hover:bg-black/5 cursor-pointer"
        >
          <Plus size={12} weight="bold" />
          Add Reminder
        </button>
      </div>

      {adding && <ReminderDialog onClose={() => setAdding(false)} onSave={addReminder} />}
      {deletingReminder && (
        <DeleteReminderDialog
          reminder={deletingReminder}
          onClose={() => setDeletingReminder(null)}
          onConfirm={() => deleteReminder(deletingReminder.id)}
        />
      )}
    </div>
  )
}

/* ---------------------------- Tab 4: Maintenance Log ---------------------------- */

/**
 * ตรงกับเฟรม "Maintenance log" ใน Figma
 *
 * ต่างจากสามแท็บบนที่ยังใช้ข้อมูลตัวอย่างจาก Figma ตรง ๆ แท็บนี้ดึงจาก API จริง
 * (GET /api/maintenance) ตัวเลขบนการ์ดสรุปจึงเป็นของจริงทั้งหมด
 *
 * แถบเครื่องมือมีช่องค้นหากับปุ่ม Export Log ตาม US-18 ที่ทีมยืนยันว่าต้องเก็บไว้
 * แอดมินต้อง export ประวัติงานซ่อมออกเป็นไฟล์ไปทำรายงานหรือส่งต่อให้คนอื่นได้
 *
 * ปุ่มกรองตามสถานะเดิมถูกตัดตามดีไซน์ การกรองเหลือช่องค้นหาอย่างเดียว
 * และส่งรายการที่ค้นหาแล้วให้ปุ่ม export ตาม US-18-S2 สิ่งที่เห็นกับสิ่งที่ได้ในไฟล์จึงตรงกันเสมอ
 */

const LOG_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: 'Wait for Assign',
  IN_PROGRESS: 'In Progress',
  DONE: 'Completed',
}

function LogStatusBadge({ status }: { status: MaintenanceStatus }) {
  // Figma: In Progress กับ Wait for Assign เป็นป้ายมีขอบ ส่วน Completed เป็นพื้นเขียว
  const tone =
    status === 'DONE'
      ? 'bg-moss-50 text-moss-545'
      : status === 'IN_PROGRESS'
        ? 'border border-avatar-ring text-body-muted'
        : 'bg-sand-100 text-sand-580'
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-semibold tracking-[0.6px] ${tone}`}>
      {LOG_STATUS_LABEL[status]}
    </span>
  )
}

function MaintenanceLogTab() {
  const [search, setSearch] = useState('')
  const log = useLoader(fetchMaintenanceLog, 'Could not load the maintenance log')

  const tickets = useMemo(() => log.data ?? [], [log.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q === '') {
      return tickets
    }
    return tickets.filter(
      (ticket) =>
        ticket.roomNumber.toLowerCase().includes(q) ||
        ticket.title.toLowerCase().includes(q) ||
        (ticket.detail ?? '').toLowerCase().includes(q),
    )
  }, [tickets, search])

  /*
    การ์ดสรุปสี่ใบตามดีไซน์ คำนวณจากใบแจ้งจริงทั้งหมด ไม่ใช่ชุดที่กรองแล้ว
    เพราะเป็นภาพรวมของทั้งระบบ ไม่ใช่ของผลการค้นหา

    Status Changes ในดีไซน์น่าจะหมายถึงจำนวนครั้งที่มีการเปลี่ยนสถานะ ซึ่งต้องมี
    ตารางเก็บประวัติการเปลี่ยน (audit trail) ที่ระบบยังไม่มีเลย ตอนนี้จึงนับ
    "ใบที่ขยับไปจากสถานะตั้งต้นแล้ว" คือไม่ใช่ OPEN ซึ่งเป็นค่าที่ตอบได้จริงจาก
    ข้อมูลที่มี พอ backend เก็บประวัติจริงค่อยเปลี่ยนมานับจากตารางนั้น
  */
  const summary = useMemo(() => {
    const today = todayInBangkok()
    return {
      total: tickets.length,
      today: tickets.filter((t) => t.reportedAt === today).length,
      changed: tickets.filter((t) => t.status !== 'OPEN').length,
      completed: tickets.filter((t) => t.status === 'DONE').length,
    }
  }, [tickets])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <label className="relative w-64">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-avatar-ring" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Log..."
            aria-label="Search the maintenance log"
            className="w-full rounded-sm border border-avatar-ring/50 bg-sidebar py-2.5 pr-4 pl-10 text-base text-ink outline-none placeholder:text-avatar-ring"
          />
        </label>

        {/*
          US-18-S2 ไฟล์ต้องมีเฉพาะรายการที่ตรงกับที่ค้นหา จึงส่งชุดเดียวกันกับที่
          ตารางแสดงให้ปุ่ม สิ่งที่ผู้ใช้เห็นกับสิ่งที่ได้ในไฟล์จะได้ตรงกันเสมอ
        */}
        <ExportLogButton tickets={filtered} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStatCard label="Total Logs" value={String(summary.total)} valueClass="text-ink" />
        <MiniStatCard label="Today's Activity" value={String(summary.today)} valueClass="text-ink" />
        <MiniStatCard
          label="Status Changes"
          value={String(summary.changed)}
          valueClass="text-alert-600"
          borderClass="border-blush-100"
        />
        <MiniStatCard label="Completed" value={String(summary.completed)} valueClass="text-ink" />
      </div>

      {log.loading && <LoadingState label="Loading the maintenance log..." />}
      {log.error && <ErrorState message={log.error} />}

      {!log.loading && !log.error && (
        <div className="w-full overflow-hidden rounded-lg border border-avatar-ring/30 bg-sidebar">
          <div className="flex items-center gap-2 border-b border-avatar-ring/30 px-4 py-4">
            <ClockCounterClockwise size={18} className="text-body-muted" />
            <h3 className="font-heading text-2xl text-ink">Maintenance Log History</h3>
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
                  <tr className="border-b border-avatar-ring/30 bg-page-bg">
                    {['Task', 'Unit', 'Assign To', 'Report By', 'Timestamp', 'Status'].map((col) => (
                      <th key={col} className="p-4 text-sm font-normal tracking-[0.7px] text-body-muted">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-avatar-ring/20 bg-white last:border-b-0">
                      <td className="px-4 py-4">
                        <p className="text-base text-ink">{ticket.title}</p>
                        {ticket.detail && <p className="text-sm text-body-muted">{ticket.detail}</p>}
                      </td>
                      <td className="px-4 py-4 text-base text-ink">{ticket.roomNumber}</td>
                      {/*
                        ดีไซน์มีคอลัมน์ผู้รับงานกับผู้แจ้ง แต่ GET /api/maintenance
                        ยังไม่ส่งสองฟิลด์นี้มาเลย จึงขึ้นขีดไว้ก่อนแบบเดียวกับแถว
                        Broken Blinds ในดีไซน์ที่ผู้รับงานยังว่าง พอ backend เพิ่ม
                        ฟิลด์ค่อยเปลี่ยนมาอ่านของจริง
                      */}
                      <td className="px-4 py-4 text-base text-ink">-</td>
                      <td className="px-4 py-4 text-base text-ink">-</td>
                      <td className="px-4 py-4 text-base text-ink">
                        {displayDate(ticket.reportedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <LogStatusBadge status={ticket.status} />
                      </td>
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
