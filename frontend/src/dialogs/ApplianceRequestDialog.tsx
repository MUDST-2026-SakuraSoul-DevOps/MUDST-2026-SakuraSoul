import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { DateField, SelectField } from '../components/Field'
import { fetchRooms } from '../api/client'
import { useLoader } from '../hooks/useLoader'
import { yenAmount } from '../format'
import type { CatalogItem, RentalRequest, RentalStatus } from '../domain/appliance'
import { RENTAL_STATUSES, validateRentalRequest } from '../domain/appliance'

/**
 * ป็อปอัป New / Edit Appliance Request ตรงกับเฟรม "New Appliance Request" กับ
 * "Edit Appliance Request" ใน Figma
 *
 * ช่อง Monthly Fee กับ Deposit เป็นช่องอ่านอย่างเดียว ดีไซน์เขียนกำกับไว้ว่า
 * "From catalog rate" ค่าจึงมาจากรายการในแคตตาล็อกที่เลือก ไม่ให้แก้เอง
 * เพราะถ้าแก้ได้ ราคาที่คิดกับผู้เช่าจะไม่ตรงกับที่ประกาศไว้ในแคตตาล็อก
 *
 * Contract ID ดีไซน์เขียนว่า "Auto-filled" ซึ่งต้องมาจากสัญญาเช่าของห้องนั้น
 * ตอนนี้ยังไม่มี endpoint ผูกใบเช่าเครื่องใช้กับสัญญา จึงแสดงเลขสัญญาจากห้อง
 * ที่เลือกถ้ามี และขึ้นว่ายังไม่มีสัญญาถ้าห้องนั้นว่างอยู่
 */
export function ApplianceRequestDialog({
  mode,
  request,
  catalog,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit'
  /** ใบที่กำลังแก้ ใช้เฉพาะโหมด edit */
  request?: RentalRequest
  catalog: CatalogItem[]
  onClose: () => void
  onSave: (request: RentalRequest) => void
}) {
  const [room, setRoom] = useState(request?.room ?? '')
  const [sku, setSku] = useState(request?.sku ?? '')
  const [startDate, setStartDate] = useState(request?.startDate ?? '')
  const [status, setStatus] = useState<RentalStatus>(request?.status ?? 'Pending')
  const [error, setError] = useState<string | null>(null)

  const roomsLoader = useLoader(fetchRooms, 'Could not load rooms')
  const rooms = useMemo(() => roomsLoader.data ?? [], [roomsLoader.data])

  const selected = catalog.find((c) => c.sku === sku) ?? null
  const selectedRoom = rooms.find((r) => r.roomNumber === room) ?? null

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const draft: RentalRequest = {
      id: request?.id ?? 0,
      room,
      sku,
      // ล็อกราคาไว้ตอนสร้าง ราคาใหม่ในแคตตาล็อกจะไม่ย้อนมาเปลี่ยนใบที่ออกไปแล้ว
      monthlyFee: selected?.monthlyFee ?? request?.monthlyFee ?? 0,
      deposit: selected?.deposit ?? request?.deposit ?? 0,
      startDate,
      status,
    }
    const message = validateRentalRequest(draft)
    if (message !== null) {
      setError(message)
      return
    }
    onSave(draft)
    onClose()
  }

  return (
    <Modal
      title={mode === 'create' ? 'New Appliance Request' : 'Edit Appliance Request'}
      subtitle={
        mode === 'create'
          ? 'Rent an extra appliance into a room'
          : 'Update this rental request'
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">Room *</span>
            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">Select room</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.roomNumber}>
                  {r.roomNumber}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">Contract ID</span>
            <input
              type="text"
              readOnly
              value={
                selectedRoom === null
                  ? ''
                  : (selectedRoom.currentLease?.id.toString() ?? 'No active lease')
              }
              placeholder="Auto-filled"
              className="rounded-lg border border-card-border bg-chip-bg px-3 py-2 text-sm text-ink-muted outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-muted">Appliance *</span>
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="rounded-lg border border-card-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="">Select from catalog</option>
            {catalog.map((c) => (
              <option key={c.sku} value={c.sku}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">Monthly Fee</span>
            <input
              type="text"
              readOnly
              value={selected === null ? '' : yenAmount(selected.monthlyFee)}
              className="rounded-lg border border-card-border bg-chip-bg px-3 py-2 text-sm text-ink-muted outline-none"
            />
            <span className="text-xs text-body-muted">From catalog rate</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-muted">Deposit</span>
            <input
              type="text"
              readOnly
              value={selected === null ? '' : yenAmount(selected.deposit)}
              className="rounded-lg border border-card-border bg-chip-bg px-3 py-2 text-sm text-ink-muted outline-none"
            />
            <span className="text-xs text-body-muted">Refunded on return</span>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="Start Date *" value={startDate} onChange={setStartDate} />
          <SelectField
            label="Status"
            value={status}
            onChange={(value) => setStatus(value as RentalStatus)}
            options={RENTAL_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>

        {/* ข้อความอธิบายผลของการอนุมัติ ลอกจากดีไซน์ ค่าเงินเติมจากรายการที่เลือกจริง */}
        <p className="rounded-lg border border-[#f0d9d9] bg-[#fdf4f4] px-4 py-3 text-sm text-[#6b4f4f]">
          Once approved, {selected === null ? 'the fee' : yenAmount(selected.monthlyFee)} is added
          as an <strong className="font-semibold">Appliance Fee</strong> line on this room&apos;s
          monthly bill until the item is returned.
        </p>

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
            {mode === 'create' ? 'Create Request' : 'Save Changes'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
