import { useMemo, useState } from 'react'
import { Wrench, Plus } from '@phosphor-icons/react'
import { Search, Pencil } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { EmptyState } from '../components/PageState'

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
      {tab === 'supplies' && (
        <EmptyState
          title="Supplies & Inventory ยังไม่ทำในรอบ SSK-18"
          hint="ตามสโคปของ ticket นี้ (บันทึกประวัติการซ่อม) ทำแค่แท็บ Maintenance Tasks — แท็บนี้จะถูกเติมใน ticket ที่เกี่ยวกับคลังอุปกรณ์"
        />
      )}
      {tab === 'schedule' && (
        <EmptyState
          title="Schedule & Reminder ยังไม่ทำในรอบ SSK-18"
          hint="ตามสโคปของ ticket นี้ (บันทึกประวัติการซ่อม) ทำแค่แท็บ Maintenance Tasks — แท็บนี้จะถูกเติมใน ticket ที่เกี่ยวกับตารางแจ้งเตือน"
        />
      )}
      {tab === 'log' && (
        <EmptyState
          title="ยังไม่มี design context สำหรับ Maintenance Log"
          hint="เฟรมนี้เห็นแค่ใน tab bar ของ Figma ยังไม่ได้ดึงรายละเอียดเนื้อหาข้างใน"
        />
      )}
    </div>
  )
}

/* ---------------------------- Tab 1: Maintenance Tasks ---------------------------- */

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
