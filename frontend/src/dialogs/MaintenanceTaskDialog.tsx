import { useState } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { ComboField, DateField, SelectField, TextAreaField, TextField } from '../components/Field'
import type { MaintenanceTask, TaskPriority } from '../domain/maintenanceBoard'
import { PRIORITIES, validateMaintenanceTask } from '../domain/maintenanceBoard'

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
  const [error, setError] = useState<string | null>(null)

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

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Unit Number" value={unit} onChange={setUnit} placeholder="101" />
          <SelectField
            label="Priority"
            value={priority}
            onChange={(value) => setPriority(value as TaskPriority)}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
        </div>

        <TextField label="Maintenance Type" value={type} onChange={setType} />
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
