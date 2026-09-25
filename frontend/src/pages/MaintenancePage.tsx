import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Wrench,
  Package,
  Plus,
  ClockCounterClockwise,
  CalendarBlank,
  DotsThreeVertical,
} from '@phosphor-icons/react'
import { Search, Pencil, Bell, Trash2 } from 'lucide-react'
import {
  createMaintenanceTicket,
  createReminder,
  createSupply,
  errorMessage,
  fetchMaintenanceLog,
  fetchReminders,
  fetchSupplies,
  fetchSupplySummary,
  restockSupply,
  setReminderActive,
  updateMaintenanceTicket,
  updateReminder,
  updateSupply,
} from '../api/client'
import type { MaintenanceTicket, SupplySummary } from '../api/types'
import {
  createTicketRequest,
  reminderRequest,
  reminderToView,
  supplyRequest,
  supplyToRow,
  taskStatusOf,
  ticketPatch,
  ticketToTask,
} from '../api/maintenanceMappers'
import { useLoader, type Loader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { ExportLogButton } from '../components/ExportLogButton'
import { DataTable } from '../components/DataTable'
import { MaintenanceTaskDialog } from '../dialogs/MaintenanceTaskDialog'
import { SupplyItemDialog } from '../dialogs/SupplyItemDialog'
import { RestockDialog } from '../dialogs/RestockDialog'
import { DeleteSupplyDialog } from '../dialogs/DeleteSupplyDialog'
import { DeleteMaintenanceTaskDialog } from '../dialogs/DeleteMaintenanceTaskDialog'
import { DetailDialog } from '../dialogs/DetailDialog'
import { ReminderDialog } from '../dialogs/ReminderDialog'
import { DeleteReminderDialog } from '../dialogs/DeleteReminderDialog'
import { ArrowClockwise } from '@phosphor-icons/react'
import type {
  MaintenanceTask,
  Reminder,
  ReminderView,
  ScheduleEvent,
  SupplyItem,
  SupplyRow,
  TaskStatus,
  TicketChip,
  WeekDay,
} from '../domain/maintenanceBoard'
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  heightPercent,
  reminderWeekEvents,
  ticketWeekChips,
  verticalPercent,
  workWeekOf,
} from '../domain/maintenanceBoard'
import { dateInBangkok, displayDate, todayInBangkok } from '../format'

/**
 * ตรงกับเฟรม "Maintenance Management" ใน Figma มี 4 sub-tab
 * Maintenance Tasks, Supplies & Inventory, Schedule & Reminder, Maintenance Log
 *
 * แท็บ Maintenance Tasks กับ Maintenance Log ใช้ใบแจ้งซ่อมจาก API จริงชุดเดียวกัน
 * (GET /api/maintenance) ตั้งแต่ SSK-131 จึงโหลดครั้งเดียวที่ระดับหน้าแล้วส่งให้ทั้งสองแท็บ
 * สร้าง แก้ หรือลบงานในแท็บ Tasks แล้วแท็บ Log เห็นทันทีโดยไม่ต้องรีเฟรช
 *
 * แท็บ Supplies & Inventory ต่อ /api/supplies แล้วใน SSK-23 โหลดเองในแท็บ เพราะไม่มีแท็บอื่น
 * ใช้ข้อมูลชุดนี้ แท็บ Schedule & Reminder ต่อ /api/reminders ใน SSK-20 โหลดรอบแจ้งเตือนเอง
 * แต่ปฏิทินของแท็บนั้นใช้ใบแจ้งซ่อมชุดเดียวกับแท็บ Tasks และ Log จึงรับ loader ของหน้าไปด้วย
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
  // แท็บถูก mount ทีละแท็บ ถ้าแต่ละแท็บโหลดเอง แท็บ Log จะไม่รู้ว่าแท็บ Tasks เพิ่งเพิ่มงาน
  const log = useLoader(fetchMaintenanceLog, 'Could not load the maintenance log')

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

      {tab === 'tasks' && <MaintenanceTasksTab log={log} />}
      {tab === 'supplies' && <SuppliesTab />}
      {tab === 'schedule' && <ScheduleTab log={log} />}
      {tab === 'log' && <MaintenanceLogTab log={log} />}
    </div>
  )
}

/* ---------------------------- Tab 1: Maintenance Tasks ---------------------------- */

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  if (status === 'Wait for Assign') {
    return (
      <span className="inline-flex items-center rounded-sm bg-sand-100 px-2 py-1 text-xs font-semibold tracking-[0.6px] text-sand-580">
        {status}
      </span>
    )
  }
  // SSK-131 งานที่ปิดแล้วใช้พื้นเขียวแบบเดียวกับป้าย Completed ของแท็บ Log
  if (status === 'Done') {
    return (
      <span className="inline-flex items-center rounded-sm bg-moss-50 px-2 py-1 text-xs font-semibold tracking-[0.6px] text-moss-545">
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

/**
 * แท็บ Maintenance Tasks (SSK-131) ใช้ใบแจ้งซ่อมจาก API จริง เดิมเป็นข้อมูลตัวอย่างใน state
 * ของหน้า เพิ่มงานแล้วรีเฟรชก็หาย ตอนนี้สร้างด้วย POST แก้ด้วย PATCH ลบด้วย DELETE
 * แล้วโหลดใหม่ผ่าน loader ตัวเดียวกับแท็บ Log
 *
 * ตารางยังใช้ MaintenanceTask เป็นโมเดลของหน้าจอ แปลงจากใบของ API ด้วย ticketToTask
 * ใบที่ปิดเป็น Done แล้วยังอยู่ในตารางพร้อมป้าย Done ไม่หายไปเฉย ๆ
 */
function MaintenanceTasksTab({ log }: { log: Loader<MaintenanceTicket[]> }) {
  const tasks = useMemo(() => (log.data ?? []).map(ticketToTask), [log.data])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MaintenanceTask | null>(null)
  const [deleting, setDeleting] = useState<MaintenanceTask | null>(null)
  const [viewing, setViewing] = useState<MaintenanceTask | null>(null)

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
   * ใบที่สี่ในดีไซน์คือ Completed ตอนทำการ์ดชุดนี้งานยังไม่มีสถานะปิดงาน จึงนับ
   * In Progress แทน SSK-131 เพิ่มสถานะ Done แล้ว ถ้าทีมอยากได้ Completed ตามดีไซน์
   * เปลี่ยนแค่ป้ายกับตัวกรองของใบนี้
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

  /**
   * บันทึกจากป็อปอัป id 0 คืองานใหม่ (POST) นอกนั้นแก้งานเดิม (PATCH เฉพาะช่องที่เปลี่ยน)
   * error ปล่อยให้โยนกลับไปที่ป็อปอัป ป็อปอัปจะโชว์ข้อความของ backend และไม่ปิดตัวเอง
   */
  async function saveTask(next: MaintenanceTask) {
    if (next.id === 0) {
      await createMaintenanceTicket(createTicketRequest(next))
    } else if (editing) {
      const patch = ticketPatch(next, editing)
      // กด Confirm โดยไม่ได้แก้อะไร ไม่ต้องยิงคำขอเปล่าไปที่ backend
      if (Object.keys(patch).length === 0) {
        return
      }
      await updateMaintenanceTicket(next.id, patch)
    }
    log.reload()
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
        {/*
          โชว์กำลังโหลดเฉพาะรอบแรก รอบที่โหลดใหม่หลังบันทึก useLoader ยังเก็บข้อมูลเดิมไว้
          ตารางจึงไม่กระพริบหายระหว่างรอ
        */}
        {log.loading && log.data === null && <LoadingState label="Loading maintenance tasks..." />}
        {log.error && <ErrorState message={log.error} />}
        {log.data !== null && filtered.length === 0 && (
          <EmptyState
            title={tasks.length === 0 ? 'No maintenance tasks yet' : 'No tasks match your search'}
            hint={tasks.length === 0 ? "Click 'New Task' to create the first one." : undefined}
          />
        )}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            {/*
              คอลัมน์สุดท้ายเว้นขอบขวา 24px เท่ากับตาราง Current Inventory ในหน้า
              เดียวกัน ของเดิมใช้ 16px เท่าคอลัมน์อื่น แต่คอลัมน์อื่นเป็นข้อความชิด
              ซ้ายจึงมีเนื้อที่ว่างด้านขวาอยู่แล้ว ส่วนคอลัมน์นี้ชิดขวา ไอคอนจึงไป
              จ่ออยู่ที่ขอบการ์ดพอดี (SSK-95)

              SSK-117 ทั้งแถวกดเปิดรายละเอียดได้ ส่วนชื่องานเป็นปุ่มจริง คนใช้คีย์บอร์ด
              กับ screen reader จะได้เข้าถึงได้ เพราะแถวตารางโฟกัสด้วย Tab ไม่ได้
            */}
            <DataTable
              rows={filtered}
              rowKey={(t) => t.id}
              minWidth={880}
              onRowClick={(t) => setViewing(t)}
              headRowClass="border-b border-avatar-ring/30 bg-page-bg"
              headCellClass="p-4 text-sm font-normal tracking-[0.7px] text-body-muted"
              rowClass="cursor-pointer border-b border-avatar-ring/20 bg-white last:border-b-0 hover:bg-sidebar"
              cellClass="px-4 py-4"
              columns={[
                {
                  key: 'task',
                  header: 'Task',
                  cell: (t) => (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setViewing(t)
                        }}
                        aria-label={`View task ${t.task}`}
                        className="text-left text-base text-ink hover:underline"
                      >
                        {t.task}
                      </button>
                      <p className="text-sm text-body-muted">{t.detail}</p>
                    </>
                  ),
                },
                { key: 'unit', header: 'Unit', cellClass: 'text-base text-ink', cell: (t) => t.unit },
                {
                  key: 'assign',
                  header: 'Assign To',
                  cellClass: 'text-base text-ink',
                  cell: (t) => t.assignTo || '-',
                },
                {
                  key: 'report',
                  header: 'Report By',
                  cellClass: 'text-base text-ink',
                  cell: (t) => t.reportBy || '-',
                },
                {
                  key: 'date',
                  header: 'Date',
                  cellClass: 'text-base whitespace-nowrap text-ink',
                  cell: (t) => (t.date ? displayDate(t.date) : '-'),
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (t) => <TaskStatusBadge status={t.status} />,
                },
                {
                  key: 'action',
                  header: 'Action',
                  headerClass: 'pr-6 text-right',
                  cellClass: 'py-4 pr-6 pl-4',
                  // กดปุ่มแก้หรือลบต้องไม่เปิดป็อปอัปรายละเอียดซ้อนขึ้นมา
                  cell: (t) => (
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      {/*
                        ชื่อปุ่มต้องมีชื่องานอยู่ด้วย เพราะทุกแถวมีปุ่มดินสอเหมือนกัน
                        ถ้าใช้แค่คำว่าแก้ไขงาน คนใช้ screen reader กับตัวเทสจะแยก
                        ไม่ออกว่าปุ่มไหนของแถวไหน

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
                      <button
                        type="button"
                        onClick={() => setDeleting(t)}
                        aria-label={`Delete task ${t.task}`}
                        className="rounded p-1.5 text-alert-600 hover:bg-black/5 hover:text-wine-680"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
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
      {viewing && (
        <DetailDialog
          title={viewing.task}
          subtitle="Maintenance task details"
          description={viewing.detail}
          rows={[
            { label: 'Unit Number', value: viewing.unit },
            { label: 'Maintenance Type', value: viewing.maintenanceType || '-' },
            { label: 'Priority', value: viewing.priority },
            { label: 'Status', value: <TaskStatusBadge status={viewing.status} /> },
            { label: 'Assigned To', value: viewing.assignTo || '-' },
            { label: 'Report By', value: viewing.reportBy || '-' },
            { label: 'Date', value: viewing.date ? displayDate(viewing.date) : '-' },
          ]}
          onClose={() => setViewing(null)}
        />
      )}
      {deleting && (
        <DeleteMaintenanceTaskDialog
          task={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={log.reload}
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

/** ป้ายมาจาก status ของ backend (SSK-23) ไม่ได้คำนวณซ้ำฝั่งหน้าเว็บ ตามข้อ 4 ของสัญญา API */
function SupplyStatusBadge({ status }: { status: SupplyRow['status'] }) {
  return status === 'In Stock' ? (
    <span className="inline-flex items-center rounded-sm bg-moss-50 px-2 py-1 text-xs font-medium text-moss-545">
      In Stock
    </span>
  ) : (
    <span className="inline-flex items-center rounded-sm bg-honey-140 px-2 py-1 text-xs font-medium text-honey-600">
      Low Stock
    </span>
  )
}

/**
 * รายการกับตัวเลขบนการ์ดโหลดพร้อมกันเป็นก้อนเดียว (SSK-23) บันทึกสำเร็จแล้วโหลดใหม่ทั้งคู่
 * ตารางกับการ์ดจึงไม่มีทางเห็นตัวเลขคนละชุดกัน อยู่นอก component เพราะ useLoader เรียกฟังก์ชันเดิมทุกรอบ
 */
async function loadInventory(): Promise<{ items: SupplyRow[]; summary: SupplySummary }> {
  const [items, summary] = await Promise.all([fetchSupplies(), fetchSupplySummary()])
  return { items: items.map(supplyToRow), summary }
}

/**
 * แท็บ Supplies & Inventory (SSK-23) ใช้คลังอุปกรณ์จาก API จริง เดิมเก็บใน state ของหน้า
 * เพิ่มของแล้วรีเฟรชก็หาย ตอนนี้เพิ่มด้วย POST แก้ด้วย PUT เติมด้วย restock และลบด้วย DELETE
 * รหัส SKU ของใหม่ server เป็นคนออกให้ ไม่ได้ออกเองฝั่งหน้าเว็บแล้ว
 *
 * การ์ด RECENT RESTOCKS เดิมนับจำนวนครั้งที่กดในรอบที่เปิดแอป รีเฟรชแล้วกลับเป็นศูนย์ ตอนนี้เป็น
 * จำนวนชิ้นที่เติมในเจ็ดวันล่าสุด ซึ่ง backend นับจากประวัติการเติมจริง
 */
function SuppliesTab() {
  const inventory = useLoader(loadInventory, 'Could not load the inventory')
  const supplies = useMemo(() => inventory.data?.items ?? [], [inventory.data])
  const summary = inventory.data?.summary ?? null
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<SupplyRow | null>(null)
  const [restocking, setRestocking] = useState<SupplyRow | null>(null)
  const [deleting, setDeleting] = useState<SupplyRow | null>(null)
  const [viewing, setViewing] = useState<SupplyRow | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return supplies
    return supplies.filter(
      (s) => s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q),
    )
  }, [supplies, search])

  const categoryCount = new Set(supplies.map((s) => s.category)).size

  /**
   * บันทึกจากป็อปอัป id 0 คือของใหม่ (POST) นอกนั้นแก้ของเดิมทั้งก้อน (PUT)
   * error ปล่อยให้โยนกลับไปที่ป็อปอัป ป็อปอัปจะโชว์ข้อความของ backend และไม่ปิดตัวเอง
   */
  async function saveSupply(next: SupplyItem) {
    if (next.id === 0) {
      await createSupply(supplyRequest(next))
    } else {
      await updateSupply(next.id, supplyRequest(next))
    }
    inventory.reload()
  }

  /**
   * US-17-S2 บวกจำนวนที่เติมเข้ากับของเดิม backend ตรวจเพดานซ้ำ เพราะยอดที่ป็อปอัปเห็น
   * อาจเก่าไปแล้วถ้ามีคนเติมของชิ้นเดียวกันจากอีกเครื่อง
   */
  async function restock(id: number, addedAmount: number) {
    await restockSupply(id, addedAmount)
    inventory.reload()
  }

  /** ระหว่างโหลดรอบแรกยังไม่มีตัวเลข ขึ้นขีดแทนศูนย์ จะได้ไม่เข้าใจผิดว่าคลังว่าง */
  const cardValue = (value: number | undefined) => (value === undefined ? '—' : String(value))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <BentoMetricCard
          label="TOTAL ITEMS"
          value={cardValue(summary?.totalItems)}
          description={`Across ${categoryCount} categories`}
          icon={Package}
        />
        <BentoMetricCard
          label="LOW STOCK ALERTS"
          value={cardValue(summary?.lowStockItems)}
          description="Requires immediate attention"
          icon={Bell}
          tone="danger"
        />
        <BentoMetricCard
          label="RECENT RESTOCKS"
          value={cardValue(summary?.restockedThisWeek)}
          description="Units restocked in the last 7 days"
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
        {/* โชว์กำลังโหลดเฉพาะรอบแรก รอบที่โหลดใหม่หลังบันทึก useLoader ยังเก็บข้อมูลเดิมไว้ ตารางจึงไม่กระพริบ */}
        {inventory.loading && inventory.data === null && <LoadingState label="Loading inventory..." />}
        {inventory.error && <ErrorState message={inventory.error} />}
        {inventory.data !== null && filtered.length === 0 && (
          <EmptyState
            title={supplies.length === 0 ? 'No supply items yet' : 'No items match your search'}
            hint={supplies.length === 0 ? "Click 'New Supply Item' to add the first one." : undefined}
          />
        )}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <DataTable
              rows={filtered}
              rowKey={(s) => s.id}
              minWidth={820}
              onRowClick={(s) => setViewing(s)}
              headRowClass="border-b border-honey-140/50 bg-sidebar"
              headCellClass="px-6 py-4 text-xs font-medium tracking-[1.2px] text-ink-muted uppercase"
              rowClass="cursor-pointer border-t border-honey-140/30 hover:bg-sidebar"
              cellClass="px-6 py-4"
              columns={[
                {
                  key: 'name',
                  header: 'ITEM NAME',
                  cell: (s) => (
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-sand-60">
                        <Package size={18} className="text-ink-muted" />
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewing(s)
                          }}
                          aria-label={`View item ${s.name}`}
                          className="text-left text-base font-medium text-ink hover:underline"
                        >
                          {s.name}
                        </button>
                        <p className="text-xs font-medium text-ink-muted">SKU: {s.sku}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'category',
                  header: 'CATEGORY',
                  cellClass: 'text-base text-ink-muted',
                  cell: (s) => s.category,
                },
                {
                  key: 'stock',
                  header: 'CURRENT STOCK',
                  cellClass: 'text-base font-medium',
                  cell: (s) => (
                    <span className={s.status === 'Low Stock' ? 'text-alert-600' : 'text-ink'}>{s.stock}</span>
                  ),
                },
                {
                  key: 'min',
                  header: 'MIN STOCK',
                  cellClass: 'text-base text-ink-muted',
                  cell: (s) => s.minStock,
                },
                {
                  key: 'max',
                  header: 'MAX STOCK',
                  cellClass: 'text-base text-ink-muted',
                  cell: (s) => s.maxStock,
                },
                {
                  key: 'status',
                  header: 'STATUS',
                  cell: (s) => <SupplyStatusBadge status={s.status} />,
                },
                {
                  key: 'actions',
                  header: 'ACTIONS',
                  headerClass: 'text-right',
                  // ปุ่ม restock แก้ หรือลบ ต้องไม่เปิดป็อปอัปรายละเอียดซ้อนขึ้นมา
                  cell: (s) => (
                    <div className="flex justify-end gap-3" onClick={(e) => e.stopPropagation()}>
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
                        BUG-M6 ใน SSK-111 ตารางนี้ไม่มีทางลบแถวเลยสักปุ่ม ใช้สีแดง
                        แยกจากปุ่มอื่นเพราะเป็นการกระทำที่ย้อนกลับไม่ได้
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
                  ),
                },
              ]}
            />
          </div>
        )}
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
          onRestocked={restock}
        />
      )}
      {viewing && (
        <DetailDialog
          title={viewing.name}
          subtitle="Supply item details"
          rows={[
            { label: 'SKU', value: viewing.sku },
            { label: 'Category', value: viewing.category },
            { label: 'Current Stock', value: viewing.stock },
            { label: 'Status', value: <SupplyStatusBadge status={viewing.status} /> },
            { label: 'Min Stock', value: viewing.minStock },
            { label: 'Max Stock', value: viewing.maxStock },
          ]}
          onClose={() => setViewing(null)}
        />
      )}
      {deleting && (
        <DeleteSupplyDialog item={deleting} onClose={() => setDeleting(null)} onDeleted={inventory.reload} />
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
  // group ที่มีชื่อเท่ากับป้ายของการ์ด โปรแกรมอ่านหน้าจออ่านตัวเลขคู่กับป้ายได้ และเทสหาการ์ดแต่ละใบได้ตรงตัว
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-40 flex-col justify-between rounded-sm border border-honey-140/50 bg-white px-[25px] py-[19px]"
    >
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

/**
 * ปฏิทินรายสัปดาห์จากข้อมูลจริง (SSK-20) แทน WEEK_EVENTS ที่เคยฝังไว้ตายตัว (มี Unit 305 ที่ไม่มีจริง)
 *
 * บล็อกบนแกนเวลาคือรอบแจ้งเตือนที่ตรงกับสัปดาห์นี้ (reminderWeekEvents) ส่วนแถบใต้หัววันคือใบแจ้งซ่อม
 * ที่แอดมินเปิดเองแล้วนัดวันไว้ (ticketWeekChips) เพราะใบแจ้งซ่อมมีแค่วันที่ ไม่มีเวลาให้วางบนแกน
 */
function WeekCalendar({
  today,
  weekDays,
  events,
  chips,
}: {
  today: string
  weekDays: WeekDay[]
  events: ScheduleEvent[]
  chips: TicketChip[]
}) {
  const nowPercent = currentTimePercent()

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

          {/* ใบแจ้งซ่อมที่นัดวันไว้ มีแค่วันที่ จึงอยู่ในแถบนี้ ไม่ได้วางบนแกนเวลา */}
          <div className="grid grid-cols-[88px_repeat(5,1fr)] border-b border-honey-140/30">
            <div className="px-3 py-2 text-right text-xs font-medium text-ink-muted">Tickets</div>
            {weekDays.map((day, dayIndex) => (
              <div
                key={day.date}
                aria-label={`Tickets for ${day.label}`}
                className="flex min-h-10 flex-col gap-1 border-l border-honey-140/30 p-1"
              >
                {chips
                  .filter((chip) => chip.dayIndex === dayIndex)
                  .map(({ ticket }) => (
                    <div
                      key={ticket.id}
                      className={`rounded-sm border border-avatar-ring/30 bg-page-bg px-2 py-1 ${
                        ticket.status === 'DONE' ? 'opacity-60' : ''
                      }`}
                    >
                      <p className="truncate text-xs font-semibold text-ink">{ticket.title}</p>
                      <p className="truncate text-xs text-ink-muted">
                        Unit {ticket.roomNumber}
                        {ticket.assignedTo ? ` • ${ticket.assignedTo}` : ''}
                      </p>
                    </div>
                  ))}
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

                {events
                  .filter((event) => event.dayIndex === dayIndex)
                  .map((event) => (
                    <div
                      key={event.id}
                      /*
                        minHeight กันงานสั้น ๆ ไม่ให้บล็อกเตี้ยกว่าข้อความข้างใน
                        งานหนึ่งชั่วโมงได้ความสูงราว 48px ซึ่งไม่พอใส่ชื่อ
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

/**
 * ปุ่ม ⋮ บนการ์ดรอบแจ้งเตือนกับเมนูของมัน (SSK-20) เดิมกดแล้วเปิดป็อปอัปลบเลยอย่างเดียว ตอนนี้เป็นเมนู
 * Edit / Pause หรือ Resume / Delete เพราะรอบที่เคยสร้างใบแจ้งซ่อมแล้วลบไม่ได้ ต้องมีทางพักแทน
 *
 * ปุ่มกับเมนูอยู่ในกล่องเดียวกัน กดที่อื่นนอกกล่องหรือกด Escape เมนูปิด ส่วนกดปุ่ม ⋮ ซ้ำคือสลับเปิดปิด
 * การกดทั้งหมดในกล่องนี้ไม่ทะลุไปเปิดป็อปอัปรายละเอียดของการ์ด
 */
function ReminderActions({
  reminder,
  open,
  onToggleOpen,
  onClose,
  onEdit,
  onPauseResume,
  onDelete,
}: {
  reminder: ReminderView
  open: boolean
  onToggleOpen: () => void
  onClose: () => void
  onEdit: () => void
  onPauseResume: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    function handlePointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  const itemClass = 'px-3 py-2 text-left text-sm hover:bg-black/5 cursor-pointer'
  return (
    <div ref={ref} className="relative -mr-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={`Options for ${reminder.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded p-1 text-ink-muted hover:bg-black/5 hover:text-ink transition-colors cursor-pointer"
      >
        <DotsThreeVertical size={16} weight="bold" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${reminder.name}`}
          className="absolute top-full right-0 z-10 mt-1 flex w-36 flex-col overflow-hidden rounded-md border border-avatar-ring/40 bg-white py-1 shadow-lg"
        >
          <button type="button" role="menuitem" onClick={onEdit} className={`${itemClass} text-ink`}>
            Edit
          </button>
          <button type="button" role="menuitem" onClick={onPauseResume} className={`${itemClass} text-ink`}>
            {reminder.active ? 'Pause' : 'Resume'}
          </button>
          <button type="button" role="menuitem" onClick={onDelete} className={`${itemClass} text-alert-600`}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

/** โหลดแยกไว้นอก component เพราะ useLoader เรียกฟังก์ชันเดิมทุกรอบ */
async function loadReminders(): Promise<ReminderView[]> {
  return (await fetchReminders()).map(reminderToView)
}

/**
 * แท็บ Schedule & Reminder (SSK-20) ใช้รอบแจ้งเตือนจาก API จริง เดิมเก็บใน state ของหน้า เพิ่มแล้วรีเฟรชก็หาย
 *
 * การ์ดใช้ nextDueDate กับ overdue ที่ server คิดให้ตามข้อ 4 ของสัญญา API ปฏิทินใช้ทั้งรอบแจ้งเตือนชุดนี้
 * และใบแจ้งซ่อมจาก loader ของหน้า (ตัวเดียวกับแท็บ Tasks และ Log) งานที่เพิ่งเปิดในแท็บ Tasks จึงขึ้น
 * บนปฏิทินทันทีโดยไม่ต้องโหลดซ้ำ
 */
function ScheduleTab({ log }: { log: Loader<MaintenanceTicket[]> }) {
  const reminders = useLoader(loadReminders, 'Could not load reminders')
  const list = useMemo(() => reminders.data ?? [], [reminders.data])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ReminderView | null>(null)
  const [deleting, setDeleting] = useState<ReminderView | null>(null)
  const [viewing, setViewing] = useState<ReminderView | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const today = todayInBangkok()
  const weekDays = useMemo(() => workWeekOf(today), [today])
  const events = useMemo(() => reminderWeekEvents(list, weekDays), [list, weekDays])
  const chips = useMemo(() => ticketWeekChips(log.data ?? [], weekDays), [log.data, weekDays])
  const closeMenu = useCallback(() => setMenuFor(null), [])

  /**
   * บันทึกจากป็อปอัป id 0 คือรอบใหม่ (POST) นอกนั้นแก้ทั้งก้อน (PUT) server คิดครั้งถัดไปใหม่ให้
   * error ปล่อยให้โยนกลับไปที่ป็อปอัป ป็อปอัปจะโชว์ข้อความของ backend และไม่ปิดตัวเอง
   */
  async function saveReminder(draft: Reminder, roomId: number | null) {
    const body = reminderRequest(draft, roomId)
    if (draft.id === 0) {
      await createReminder(body)
    } else {
      await updateReminder(draft.id, body)
    }
    reminders.reload()
  }

  /** Pause / Resume จากเมนู error (เช่น 409 ของใบรอบเดียวที่ยิงไปแล้ว) ขึ้นใต้หัวแถบ Recurring */
  async function pauseOrResume(reminder: ReminderView) {
    setMenuFor(null)
    setActionError(null)
    try {
      await setReminderActive(reminder.id, !reminder.active)
      reminders.reload()
    } catch (err) {
      setActionError(
        errorMessage(err, reminder.active ? 'Could not pause the reminder' : 'Could not resume the reminder'),
      )
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <WeekCalendar today={today} weekDays={weekDays} events={events} chips={chips} />

      <div className="flex flex-col gap-2">
        <h3 className="pb-2 font-heading text-2xl text-ink">Recurring</h3>
        {actionError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </p>
        )}
        {reminders.loading && reminders.data === null && <LoadingState label="Loading reminders..." />}
        {reminders.error && <ErrorState message={reminders.error} />}
        {reminders.data !== null && list.length === 0 && (
          <EmptyState title="No reminders yet" hint="Click 'Add Reminder' to set up the first one." />
        )}
        <div className="flex flex-col gap-4">
          {list.map((r) => {
            const chip = FREQUENCY_CHIP[r.frequency] ?? FREQUENCY_CHIP['One-time']
            return (
              <div
                key={r.id}
                onClick={() => setViewing(r)}
                className={`flex cursor-pointer flex-col gap-2 rounded-lg border border-honey-140/50 bg-white p-[17px] hover:border-honey-140/90 ${
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
                      กำหนดมาสองปีแล้วยังแสดงเฉย ๆ ไม่มีอะไรบอก ตั้งแต่ SSK-20 ใช้ overdue ของ server
                    */}
                    {r.overdue && (
                      <span className="w-fit rounded-sm bg-blush-100 px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-alert-600 uppercase">
                        Overdue
                      </span>
                    )}
                    {!r.active && (
                      <span className="w-fit rounded-sm border border-avatar-ring/50 px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-ink-muted uppercase">
                        Paused
                      </span>
                    )}
                  </div>
                  <ReminderActions
                    reminder={r}
                    open={menuFor === r.id}
                    onToggleOpen={() => setMenuFor((current) => (current === r.id ? null : r.id))}
                    onClose={closeMenu}
                    onEdit={() => {
                      setMenuFor(null)
                      setEditing(r)
                    }}
                    onPauseResume={() => pauseOrResume(r)}
                    onDelete={() => {
                      setMenuFor(null)
                      setDeleting(r)
                    }}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewing(r)
                    }}
                    aria-label={`View reminder ${r.name}`}
                    className="text-left text-sm font-semibold tracking-[0.7px] text-ink hover:underline"
                  >
                    {r.name}
                  </button>
                  <p className="text-xs font-medium text-ink-muted">{r.notes}</p>
                </div>
                <p
                  className={`flex items-center gap-1.5 pt-1 text-base ${
                    r.overdue ? 'text-alert-600' : r.active ? 'text-brand' : 'text-ink-muted'
                  }`}
                >
                  <CalendarBlank size={14} />
                  Next: {r.nextDueDate}
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

      {adding && <ReminderDialog onClose={() => setAdding(false)} onSave={saveReminder} />}
      {editing && (
        <ReminderDialog mode="edit" reminder={editing} onClose={() => setEditing(null)} onSave={saveReminder} />
      )}
      {viewing && (
        <DetailDialog
          title={viewing.name}
          subtitle="Reminder details"
          description={viewing.notes}
          rows={[
            { label: 'Frequency', value: viewing.frequency },
            {
              label: 'Status',
              value: viewing.overdue ? 'Overdue' : viewing.active ? 'Active' : 'Paused',
            },
            { label: 'Start Date', value: displayDate(viewing.startDate) },
            { label: 'Next Date', value: displayDate(viewing.nextDueDate) },
            { label: 'Time', value: viewing.time },
            { label: 'Priority', value: viewing.priority },
            { label: 'Assigned Unit', value: viewing.unit ?? 'All units' },
          ]}
          onClose={() => setViewing(null)}
        />
      )}
      {deleting && (
        <DeleteReminderDialog reminder={deleting} onClose={() => setDeleting(null)} onDeleted={reminders.reload} />
      )}
    </div>
  )
}


/* ---------------------------- Tab 4: Maintenance Log ---------------------------- */

/**
 * ป้ายสถานะของแท็บ Log ใช้ taskStatusOf ตัวเดียวกับแท็บ Tasks (SSK-131) ใบ OPEN ที่มีช่าง
 * รับแล้วขึ้น Pending ตรงกันทั้งสองแท็บ เดิมแท็บนี้ขึ้น Wait for Assign ให้ใบ OPEN ทุกใบ
 * ต่างกันแค่ใบที่ปิดแล้ว แท็บนี้ใช้คำว่า Completed ตามเฟรม Maintenance log ใน Figma
 */
function LogStatusBadge({ ticket }: { ticket: MaintenanceTicket }) {
  const label = taskStatusOf(ticket)
  // Figma: In Progress กับ Pending เป็นป้ายมีขอบ Wait for Assign เป็นพื้นเทา Completed เป็นพื้นเขียว
  const tone =
    label === 'Done'
      ? 'bg-moss-50 text-moss-545'
      : label === 'Wait for Assign'
        ? 'bg-sand-100 text-sand-580'
        : 'border border-avatar-ring text-body-muted'
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-semibold tracking-[0.6px] ${tone}`}>
      {label === 'Done' ? 'Completed' : label}
    </span>
  )
}

/**
 * ตรงกับเฟรม "Maintenance log" ใน Figma
 *
 * แท็บนี้กับแท็บ Maintenance Tasks ใช้ใบแจ้งซ่อมชุดเดียวกันจาก API จริง (GET /api/maintenance)
 * โหลดครั้งเดียวที่ MaintenancePage แล้วส่ง loader ลงมา (SSK-131) สร้าง แก้ หรือลบงานในแท็บ Tasks
 * แล้วแท็บนี้เห็นทันทีโดยไม่ต้องรีเฟรช ตัวเลขบนการ์ดสรุปจึงเป็นของจริงทั้งหมด
 *
 * แถบเครื่องมือมีช่องค้นหากับปุ่ม Export Log ตาม US-18 ที่ทีมยืนยันว่าต้องเก็บไว้
 * แอดมินต้อง export ประวัติงานซ่อมออกเป็นไฟล์ไปทำรายงานหรือส่งต่อให้คนอื่นได้
 *
 * ปุ่มกรองตามสถานะเดิมถูกตัดตามดีไซน์ การกรองเหลือช่องค้นหาอย่างเดียว
 * และส่งรายการที่ค้นหาแล้วให้ปุ่ม export ตาม US-18-S2 สิ่งที่เห็นกับสิ่งที่ได้ในไฟล์จึงตรงกันเสมอ
 */
function MaintenanceLogTab({ log }: { log: Loader<MaintenanceTicket[]> }) {
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<MaintenanceTicket | null>(null)

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
      // reportedAt เป็นเวลาเต็มแบบ ISO ต้องเทียบเป็นวันไทย เดิมเทียบสตริงตรง ๆ ได้ศูนย์เสมอ (SSK-131)
      today: tickets.filter((t) => dateInBangkok(t.reportedAt) === today).length,
      changed: tickets.filter((t) => t.status !== 'OPEN').length,
      completed: tickets.filter((t) => t.status === 'DONE').length,
    }
  }, [tickets])

  return (
    <div className="flex flex-col gap-4">
      {/*
        SSK-124 การ์ดสรุปขึ้นก่อน แล้วค่อยเป็นแถบค้นหากับปุ่ม เรียงแบบเดียวกับแท็บ
        Maintenance Tasks เดิมแท็บนี้เอาช่องค้นหาขึ้นก่อน ช่อง Search ของสองแท็บ
        จึงอยู่คนละตำแหน่ง สลับแท็บแล้วตากระโดด
      */}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-64">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-avatar-ring" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Log"
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

      {/* loader ใช้ร่วมกับแท็บ Tasks ตอนโหลดซ้ำหลังบันทึกยังโชว์ข้อมูลเดิมไว้ ไม่กระพริบเป็นหน้าโหลด */}
      {log.loading && log.data === null && <LoadingState label="Loading the maintenance log..." />}
      {log.error && <ErrorState message={log.error} />}

      {log.data !== null && (
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
              {/* SSK-117 ทั้งแถวกดเปิดรายละเอียดได้ ชื่องานเป็นปุ่มจริงให้คีย์บอร์ดเข้าถึงได้ */}
              <DataTable
                rows={filtered}
                rowKey={(ticket) => ticket.id}
                minWidth={720}
                onRowClick={(ticket) => setViewing(ticket)}
                headRowClass="border-b border-avatar-ring/30 bg-page-bg"
                headCellClass="p-4 text-sm font-normal tracking-[0.7px] whitespace-nowrap text-body-muted"
                rowClass="cursor-pointer border-b border-avatar-ring/20 bg-white last:border-b-0 hover:bg-sidebar"
                cellClass="px-4 py-4"
                columns={[
                  {
                    key: 'task',
                    header: 'Task',
                    cell: (ticket) => (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewing(ticket)
                          }}
                          aria-label={`View log ${ticket.title}`}
                          className="text-left text-base text-ink hover:underline"
                        >
                          {ticket.title}
                        </button>
                        {ticket.detail && <p className="text-sm text-body-muted">{ticket.detail}</p>}
                      </>
                    ),
                  },
                  {
                    key: 'unit',
                    header: 'Unit',
                    cellClass: 'text-base text-ink',
                    cell: (ticket) => ticket.roomNumber,
                  },
                  // ใบที่ยังไม่มีช่างรับขึ้นขีด แบบเดียวกับแถว Broken Blinds ในดีไซน์
                  {
                    key: 'assign',
                    header: 'Assign To',
                    cellClass: 'text-base whitespace-nowrap text-ink',
                    cell: (ticket) => ticket.assignedTo || '-',
                  },
                  {
                    key: 'report',
                    header: 'Report By',
                    cellClass: 'text-base whitespace-nowrap text-ink',
                    cell: (ticket) => ticket.reportedBy || '-',
                  },
                  {
                    key: 'timestamp',
                    header: 'Timestamp',
                    cellClass: 'text-base whitespace-nowrap text-ink',
                    cell: (ticket) => displayDate(ticket.reportedAt),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (ticket) => <LogStatusBadge ticket={ticket} />,
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {viewing && (
        <DetailDialog
          title={viewing.title}
          subtitle="Maintenance log details"
          description={viewing.detail}
          rows={[
            { label: 'Unit Number', value: viewing.roomNumber },
            { label: 'Status', value: <LogStatusBadge ticket={viewing} /> },
            { label: 'Reported', value: displayDate(viewing.reportedAt) },
            { label: 'Assigned To', value: viewing.assignedTo || '-' },
            { label: 'Report By', value: viewing.reportedBy || '-' },
          ]}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
