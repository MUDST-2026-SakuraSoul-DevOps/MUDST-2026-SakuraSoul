import { useState, type FormEvent } from 'react'
import { createRoom, errorMessage } from '../api/client'
import type { CreateRoomRequest, RoomType } from '../api/types'
import { ROOM_TYPE_LABEL, ROOM_TYPES, validateRoom } from '../domain/room'
import { Modal } from '../components/Modal'
import { TextField, SelectField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'

/**
 * ป็อปอัปเพิ่มห้องใหม่ ตรงกับเฟรม "Add unit popup" ใน Figma
 *
 * เดิมปุ่ม Add Unit ในหน้า Units เป็นปุ่มเปล่า ไม่มี onClick เลย กดแล้วไม่มีอะไร
 * เกิดขึ้น (QA แจ้งมา) ป็อปอัปนี้กับ POST /api/rooms ที่เพิ่มเข้าสัญญาไว้ทำให้
 * ปุ่มทำงานได้จริง
 *
 * ช่อง Type บังคับเลือกตามดีไซน์ แต่ตั้งค่าตั้งต้นเป็น Single Bedroom ไว้เลย
 * แทนที่จะเป็นตัวเลือกว่าง เพราะ select ที่ว่างอยู่แล้วบังคับให้เลือกจะทำให้ต้อง
 * มีเคส validate เพิ่มโดยไม่ได้อะไรกลับมา ห้องส่วนใหญ่เป็นห้องเดี่ยวอยู่แล้ว
 */
export function AddUnitDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** เรียกเมื่อบันทึกสำเร็จ เพื่อให้ตารางห้องโหลดใหม่ */
  onCreated: () => void
}) {
  const [roomNumber, setRoomNumber] = useState('')
  const [floor, setFloor] = useState('')
  const [address, setAddress] = useState('')
  const [roomType, setRoomType] = useState<RoomType>('SINGLE')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const draft: CreateRoomRequest = {
      roomNumber: roomNumber.trim(),
      // ช่องว่างต้องได้ NaN ไม่ใช่ 0 ไม่งั้น Number('') = 0 จะหลุดผ่านไปเป็นชั้น 0
      floor: floor.trim() === '' ? Number.NaN : Number(floor),
      roomType,
      address: address.trim() || undefined,
    }

    const invalid = validateRoom(draft)
    if (invalid) {
      setFormError(invalid)
      return
    }

    setSubmitting(true)
    try {
      await createRoom(draft)
      onCreated()
      onClose()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not add the unit'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add New Unit"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" form="add-unit-form" disabled={submitting}>
            {submitting ? 'Saving...' : 'Add Unit'}
          </PrimaryButton>
        </>
      }
    >
      {/* noValidate ให้ข้อความเตือนมาจาก validateRoom ที่เดียว ไม่ปนกับฟองข้อความ
          ของเบราว์เซอร์ แบบเดียวกับฟอร์มเพิ่มผู้เช่า */}
      <form id="add-unit-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Unit Number *"
            value={roomNumber}
            onChange={setRoomNumber}
            placeholder="101"
          />
          <TextField label="Floor *" value={floor} onChange={setFloor} placeholder="1" />
        </div>
        <TextField
          label="Address"
          value={address}
          onChange={setAddress}
          placeholder="Building A, 123 Street"
        />
        <SelectField
          label="Type *"
          value={roomType}
          onChange={(value) => setRoomType(value as RoomType)}
          options={ROOM_TYPES.map((type) => ({ value: type, label: ROOM_TYPE_LABEL[type] }))}
        />

        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {formError}
          </p>
        )}
      </form>
    </Modal>
  )
}
