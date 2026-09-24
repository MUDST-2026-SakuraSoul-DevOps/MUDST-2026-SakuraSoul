import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { ComboField, DateField, SelectField, TextAreaField, TextField } from '../components/Field'
import { fetchRooms } from '../api/client'
import { useLoader } from '../hooks/useLoader'
import type { MaintenanceTask, TaskPriority } from '../domain/maintenanceBoard'
import { PRIORITIES, validateMaintenanceTask } from '../domain/maintenanceBoard'
import { MAINTENANCE_TYPES } from '../domain/maintenanceTicket'

/**
 * ป็อปอัป Create / Edit Maintenance Task ตามดีไซน์รอบล่าสุดที่ทีมส่งมา
 *
 * ใช้คอมโพเนนต์เดียวทำทั้งสองโหมด เพราะดีไซน์ของสองใบนี้มีช่องกรอกชุดเดียวกัน
 * เป๊ะ ต่างกันแค่หัวเรื่องกับปุ่มยืนยัน แยกเป็นสองไฟล์แล้วจะกลายเป็นโค้ดซ้ำที่
 * ต้องแก้สองที่ทุกครั้งที่ดีไซน์ขยับ
 *
 * หมายเหตุเรื่องดีไซน์: ในภาพ ช่องล่างสุดสองช่องติดป้ายว่า "Assigned To"
 * เหมือนกันทั้งคู่ ซึ่งทำให้ผู้ใช้แยกไม่ออกว่าต้องกรอกอะไรลงช่องไหน และตาราง
 * Task Overview มีคอลัมน์ Assign To กับ Report By อยู่แล้ว จึงตีความว่าช่องที่
 * สองคือ Report By รอทีมออกแบบยืนยัน ถ้าไม่ใช่แก้แค่ป้ายบรรทัดเดียว
 */
export function MaintenanceTaskDialog({
  mode,
  task,
  assignees = [],
  reporters = [],
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit'
  /** งานที่กำลังแก้ ใช้เฉพาะโหมด edit */
  task?: MaintenanceTask
  /** ชื่อที่เคยใช้ในระบบ เอามาเสนอในช่อง Assigned To / Report By */
  assignees?: string[]
  reporters?: string[]
  onClose: () => void
  onSave: (task: MaintenanceTask) => void
}) {
  const [title, setTitle] = useState(task?.task ?? '')
  const [unit, setUnit] = useState(task?.unit ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'Medium')
  const [type, setType] = useState(task?.maintenanceType ?? '')
  const [detail, setDetail] = useState(task?.detail ?? '')
  const [assignTo, setAssignTo] = useState(task?.assignTo ?? '')
  const [reportBy, setReportBy] = useState(task?.reportBy ?? '')
  const [date, setDate] = useState(task?.date ?? '')
  const [billToTenant, setBillToTenant] = useState(task?.billToTenant ?? false)
  const [amount, setAmount] = useState(task?.amount ?? 0)
  const [error, setError] = useState<string | null>(null)

  const roomsLoader = useLoader(fetchRooms, 'Could not load units')
  const units = useMemo(
    () => (roomsLoader.data ?? []).map((room) => room.roomNumber).sort((a, b) => a.localeCompare(b)),
    [roomsLoader.data],
  )

  const draft: MaintenanceTask = {
    id: task?.id ?? 0,
    task: title.trim(),
    detail: detail.trim(),
    maintenanceType: type.trim(),
    unit: unit.trim(),
    priority,
    assignTo: assignTo.trim(),
    reportBy: reportBy.trim(),
    date,
    // งานที่เพิ่งสร้างยังไม่มีคนรับ จึงเริ่มที่ Wait for Assign เสมอ ส่วนงานที่
    // แก้อยู่ให้คงสถานะเดิมไว้ ป็อปอัปนี้ไม่มีช่องแก้สถานะตามดีไซน์
    status: task?.status ?? 'Wait for Assign',
    billToTenant,
    amount,
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const message = validateMaintenanceTask(draft)
    if (message !== null) {
      setError(message)
      return
    }
    onSave(draft)
    onClose()
  }

  return (
    <Modal
      title={mode === 'create' ? 'Create Maintenance Task' : 'Edit Maintenance Task'}
      onClose={onClose}
    >
      {/*
        noValidate เพื่อให้ข้อความเตือนมาจาก validateMaintenanceTask ที่เดียว
        ไม่งั้นผู้ใช้จะเจอฟองข้อความของเบราว์เซอร์ปนกับข้อความของเราเอง
      */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Task Title"
          value={title}
          onChange={setTitle}
          placeholder="Type title here"
        />

        {/*
          SSK-117 เดิม Unit Number เป็นช่องพิมพ์ รับเลข 3 หลักอะไรก็ได้ เช่น 999
          ที่ไม่มีห้องจริง และ Maintenance Type พิมพ์อิสระ ไม่ตรงกับป็อปอัป Create
          Maintenance ใน Dashboard ตอนนี้ทั้งสองช่องเลือกได้เฉพาะของที่มีจริง
          ห้องดึงจากระบบ ประเภทใช้รายการเดียวกับ Dashboard
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Unit Number"
            value={unit}
            onChange={setUnit}
            options={[
              { value: '', label: 'Select a unit...' },
              ...units.map((roomNumber) => ({ value: roomNumber, label: roomNumber })),
            ]}
          />
          <SelectField
            label="Priority"
            value={priority}
            onChange={(value) => setPriority(value as TaskPriority)}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
        </div>

        <SelectField
          label="Maintenance Type"
          value={type}
          onChange={setType}
          options={[
            { value: '', label: 'Select maintenance type' },
            ...MAINTENANCE_TYPES.map((t) => ({ value: t, label: t })),
          ]}
        />
        <TextAreaField label="Description" value={detail} onChange={setDetail} />

        <div className="grid gap-4 sm:grid-cols-2">
          {/*
            ดีไซน์วาดสองช่องนี้เป็น dropdown มีลูกศรลง แต่ระบบยังไม่มี API
            พนักงานเลยสักตัว (SSK-94) ถ้าทำเป็น select ปิดตายจะมอบหมายงานให้
            ช่างคนใหม่ไม่ได้เลย จึงใช้ combobox ที่เสนอชื่อที่เคยใช้ในระบบให้
            เลือก กันสะกดคนเดิมไม่ตรงกันตามที่ QA ห่วง แต่ยังรับชื่อใหม่ได้
            พอ backend มี endpoint พนักงานจริงค่อยเปลี่ยนเป็น SelectField
          */}
          <ComboField
            label="Assigned To"
            value={assignTo}
            onChange={setAssignTo}
            options={assignees}
            placeholder="Select or type a name..."
          />
          <ComboField
            label="Report By"
            value={reportBy}
            onChange={setReportBy}
            options={reporters}
            placeholder="Select or type a name..."
          />
        </div>

        <DateField label="Date" value={date} onChange={setDate} />

        {/*
          SSK-134 — ช่องนี้มีอยู่แล้วในป็อปอัป Create Maintenance ฝั่ง
          Dashboard แต่ฟอร์มของหน้า Maintenance เองไม่มี สร้าง/แก้งานซ่อมจาก
          สองที่นี้เลยได้ผลไม่ตรงกัน เพิ่มให้ตรงกันโดยใช้ label กับเงื่อนไข
          เดียวกับฝั่ง Dashboard (Section step={4} title="Maintenance Cost")
        */}
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-muted">
            Maintenance Cost <span className="font-normal text-body-muted">(Optional)</span>
          </span>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={billToTenant}
                onChange={(e) => setBillToTenant(e.target.checked)}
                className="size-4 accent-wine-610"
              />
              Bill this repair to the tenant
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted">Amount</span>
              <input
                type="number"
                min={0}
                step={1}
                value={Number.isNaN(amount) ? '' : amount}
                onChange={(e) => setAmount(e.target.valueAsNumber)}
                disabled={!billToTenant}
                aria-label="Amount"
                className="w-28 rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-chip-bg disabled:text-ink-muted"
              />
            </label>
          </div>
          <p className="pt-1 text-xs text-body-muted">
            Adds a Repair charge line to this room&apos;s next bill. Only tick for damage caused by
            the tenant — normal wear and tear is not billable.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit">
            {mode === 'create' ? 'Create Task' : 'Confirm'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
