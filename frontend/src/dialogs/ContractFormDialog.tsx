import { useState, type FormEvent } from 'react'
import { FileText, X } from 'lucide-react'
import { createLease, errorMessage, fetchApartmentConfig, updateLease } from '../api/client'
import type { BillingCycle, Lease, LeaseRequest, RoomSummary, Tenant } from '../api/types'
import { findConflictingLease, isBackwardsRange, overlapMessage } from '../domain/lease'
import { roomTypeLabel } from '../domain/room'
import { useLoader } from '../hooks/useLoader'
import { bahtAmount, todayInBangkok } from '../format'
import { CustomSelect } from '../components/CustomSelect'

/**
 * Dialog สร้าง/แก้ไขสัญญาเช่า — ตรงกับ Figma "Create Contract" และ "Edit Contract"
 */
export function ContractFormDialog({
  lease,
  rooms,
  tenants,
  existingLeases,
  onClose,
  onSaved,
}: {
  lease?: Lease
  rooms: RoomSummary[]
  tenants: Tenant[]
  existingLeases: Lease[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = lease !== undefined

  // Units ที่พร้อมให้เลือก (ถ้าสร้างใหม่ เอาเฉพาะห้องว่าง หรือห้องที่กำลังแก้)
  const availableRooms = isEdit
    ? rooms
    : rooms.filter((r) => r.status === 'AVAILABLE' || (lease ? r.id === (lease as Lease).roomId : false))

  const [roomId, setRoomId] = useState<number>(
    lease?.roomId ?? (availableRooms[0]?.id ?? rooms[0]?.id ?? 1),
  )
  /*
    SSK-127 ค่าเช่าฟิกตามประเภทห้อง (feedback อาจารย์ 13 ก.ย. ข้อ 5)

    ประเภทห้องกับค่าเช่าเป็นของห้อง ไม่ใช่ของฟอร์ม จึงแสดงอย่างเดียว แก้ไม่ได้
    - สร้างสัญญาใหม่: ค่าเช่าคือ baseRent ของห้องที่เลือก ซึ่ง backend คิดจากประเภทห้อง
    - แก้สัญญาเดิม: ค่าเช่าคือ monthlyRent ที่ล็อกไว้ตอนเซ็น ไม่เปลี่ยนตามราคาปัจจุบัน
    backend มองข้ามค่าเช่าที่ส่งมาอยู่แล้ว (LeaseService) ฟอร์มจึงไม่ส่งไปเลย
  */
  const selectedRoom = rooms.find((r) => r.id === roomId)
  const rent = isEdit ? lease.monthlyRent : (selectedRoom?.baseRent ?? 0)
  const [tenantId, setTenantId] = useState<number>(lease?.tenantId ?? tenants[0]?.id ?? 0)
  /*
    SSK-136 ช่อง ID / Phone / Line ID เป็นข้อมูลของผู้เช่า แสดงจากผู้เช่าที่เลือกอย่างเดียว
    เดิมเป็นช่องแก้ได้ที่เติมค่าปลอมไว้ (012-345-6789, 1-2345-67890-12-3) และไม่เคยถูกส่งไปไหน
    แก้แล้วเหมือนบันทึกได้ แต่ข้อมูลผู้เช่าไม่เปลี่ยน ตอนนี้แก้ได้ที่หน้า Tenants ที่เดียว
  */
  const selectedTenant = tenants.find((t) => t.id === tenantId)

  const [startDate, setStartDate] = useState(lease?.startDate ?? todayInBangkok())
  const [endDate, setEndDate] = useState(lease?.endDate ?? '')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(lease?.billingCycle ?? 'MONTHLY')
  // เงินมัดจำยังแก้ได้ ค่าตั้งต้นสองเท่าของค่าเช่า สัญญาเดิมใช้ค่าที่บันทึกไว้
  const [securityDeposit, setSecurityDeposit] = useState(lease?.securityDeposit ?? rent * 2)
  // undefined = ยังไม่ได้แก้ ใช้ค่าส่วนกลางจาก Apartment Config (ดู commonAreaFee ข้างล่าง)
  const [commonAreaFeeInput, setCommonAreaFeeInput] = useState<number | undefined>(undefined)

  /*
    BUG-C2 ใน SSK-112 — อัตราสองช่องนี้เดิมเขียนเป็นข้อความคงที่ ¥18.00 กับ
    ¥8.00 ไม่ตรงกับอัตราจริงที่ตั้งไว้ในหน้า Apartment Config (ที่หน้า Payment
    ก็อ่านค่าจากตรงนั้นเหมือนกัน) ตอนนี้โหลดอัตราจริงมาแทน

    SSK-136 ตัดตัวเลือก Flat rate (฿300 / ฿500) ออก ตัวเลขชุดนั้นเขียนตายตัว ไม่มีที่มา
    เลือกแล้วก็ไม่ถูกบันทึก เพราะระบบคิดค่าน้ำค่าไฟตามหน่วยอย่างเดียว
  */
  const apartmentConfig = useLoader(fetchApartmentConfig, 'Could not load utility rates')
  const [waterRate, setWaterRate] = useState<string | null>(null)
  const [electricRate, setElectricRate] = useState<string | null>(null)

  const waterPerUnitLabel = apartmentConfig.data
    ? `Per unit - ${bahtAmount(apartmentConfig.data.waterRatePerUnit)}`
    : 'Per unit - loading...'
  const electricPerUnitLabel = apartmentConfig.data
    ? `Per unit - ${bahtAmount(apartmentConfig.data.electricRatePerUnit)}`
    : 'Per unit - loading...'
  const resolvedWaterRate = waterRate ?? waterPerUnitLabel
  const resolvedElectricRate = electricRate ?? electricPerUnitLabel

  /*
    SSK-136 ค่าส่วนกลางตั้งต้นจาก Apartment Config แล้วส่งไปล็อกในสัญญาจริง เดิมตั้งตายตัว 200
    ป้ายเขียนว่ามาจาก Config แต่ไม่ใช่ และไม่เคยถูกส่งไป แอดมินยังแก้รายสัญญาได้ตอนสร้าง
    เว้นว่างแล้ว backend คัดลอกจาก Config เอง ส่วนสัญญาเดิมแสดงค่าที่ล็อกไว้อย่างเดียวเหมือนค่าเช่า
  */
  const commonAreaFee = commonAreaFeeInput ?? apartmentConfig.data?.commonAreaFee

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** เปลี่ยนห้องแล้วประเภทห้องกับค่าเช่าตามห้องใหม่เอง ส่วนมัดจำตั้งต้นใหม่ตามค่าเช่านั้น */
  function handleRoomChange(id: number) {
    setRoomId(id)
    const r = rooms.find((item) => item.id === id)
    if (r && !isEdit) {
      setSecurityDeposit(r.baseRent * 2)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // ไม่มีผู้เช่าในระบบเลย เดิมตกไปใช้ผู้เช่า id 1 ที่อาจไม่มีอยู่จริง ข้อความเดียวกับป็อปอัป check-in
    if (!selectedTenant) {
      setError('No tenants available in the system. Please add a tenant first.')
      return
    }

    const normalizedEnd = endDate === '' ? null : endDate
    if (isBackwardsRange(startDate, normalizedEnd)) {
      setError('End Date must not be earlier than Start Date.')
      return
    }

    const conflict = findConflictingLease(
      existingLeases,
      { roomId, startDate, endDate: normalizedEnd },
      lease?.id,
    )
    if (conflict) {
      setError(overlapMessage(conflict))
      return
    }

    /*
      ล็อกอัตราต่อหน่วยแค่ตอนสร้างสัญญาใหม่ จากตัวเลือก "Per unit" (ค่าจริงจาก
      Apartment Config ณ ตอนบันทึก) ถ้า Config ยังโหลดไม่เสร็จก็ไม่ส่ง ปล่อยให้ backend
      คัดลอกจาก Config เองตอนสร้าง ได้ผลเหมือนกัน

      ตอนแก้ไขสัญญาเดิม ไม่ส่งอัตราจากดรอปดาวน์ตรง ๆ เพราะดรอปดาวน์ผูกกับ
      Config ปัจจุบันเสมอ ถ้าส่งไปจะเผลอเปลี่ยนอัตราที่ล็อกไว้แต่แรกทุกครั้งที่
      แก้สัญญา ทั้งที่ผู้ใช้อาจจะมาแก้แค่ค่าเช่าหรือวันที่ จึงคงอัตราเดิมของ
      สัญญาไว้แทน
    */
    const payload: LeaseRequest = {
      roomId,
      tenantId,
      startDate,
      endDate: normalizedEnd,
      billingCycle,
      // ช่องว่างไม่ส่งไป ให้ backend ใช้ค่าตั้งต้นของมันเอง (สร้างใหม่ = 0, แก้ = ค่าเดิม)
      securityDeposit: Number.isNaN(securityDeposit) ? undefined : securityDeposit,
      electricRatePerUnit: isEdit
        ? lease.electricRatePerUnit
        : resolvedElectricRate === electricPerUnitLabel
          ? apartmentConfig.data?.electricRatePerUnit
          : undefined,
      waterRatePerUnit: isEdit
        ? lease.waterRatePerUnit
        : resolvedWaterRate === waterPerUnitLabel
          ? apartmentConfig.data?.waterRatePerUnit
          : undefined,
      // สัญญาเดิมไม่ส่ง backend คงค่าที่ล็อกไว้ ช่องว่างก็ไม่ส่ง ให้ backend คัดลอกจาก Config
      commonAreaFee:
        isEdit || commonAreaFee === undefined || Number.isNaN(commonAreaFee) ? undefined : commonAreaFee,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await updateLease(lease.id, payload)
      } else {
        await createLease(payload)
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, isEdit ? 'Failed to update contract.' : 'Failed to create contract.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit Contract' : 'Create Contract'}
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-honey-140/50 bg-white p-7 shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-sand-65">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blush-80 text-brand">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-sand-830">
                {isEdit ? 'Edit Contract' : 'Create Contract'}
              </h2>
              <p className="text-xs text-sand-530">Link a tenant to a unit and set the lease terms</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-sand-530 hover:bg-black/5 hover:text-sand-830"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form id="contract-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-5 pr-2">
          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Section 1: Unit & Tenant */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="unit-select" className="block text-xs font-semibold text-sand-830">
                Unit <span className="text-rose-500">*</span>
              </label>
              <CustomSelect
                id="unit-select"
                value={roomId}
                onChange={handleRoomChange}
                options={availableRooms.map((r) => ({
                  value: r.id,
                  label: `${r.roomNumber} · Floor ${r.floor}`,
                }))}
              />
              <span className="mt-0.5 block text-[11px] text-sand-320">Only vacant units are listed</span>
            </div>

            <div>
              <label htmlFor="room-type" className="block text-xs font-semibold text-sand-830">
                Room Type
              </label>
              {/* SSK-127 ประเภทห้องเป็นของห้อง เปลี่ยนที่ฟอร์มสัญญาไม่ได้ */}
              <input
                id="room-type"
                type="text"
                readOnly
                value={roomTypeLabel(selectedRoom?.roomType)}
                className="mt-1 w-full cursor-default rounded-lg border border-sand-110 bg-page-bg px-3 py-2 text-sm text-sand-830 outline-none"
              />
              <span className="mt-0.5 block text-[11px] text-sand-320">Follows the selected unit</span>
            </div>

            <div>
              <label htmlFor="tenant-select" className="block text-xs font-semibold text-sand-830">
                Tenant <span className="text-rose-500">*</span>
              </label>
              <CustomSelect
                id="tenant-select"
                value={tenantId}
                onChange={setTenantId}
                options={tenants.map((t) => ({
                  value: t.id,
                  label: t.fullName,
                }))}
              />
              <span className="mt-0.5 block text-[11px] text-sand-320">Search by name or phone</span>
            </div>

            {/* SSK-136 สามช่องนี้อ่านจากผู้เช่าที่เลือก แก้ได้ที่หน้า Tenants เท่านั้น */}
            {[
              { id: 'tenant-id', label: 'ID', value: selectedTenant?.nationalId },
              { id: 'tenant-phone', label: 'Phone', value: selectedTenant?.phone },
              { id: 'tenant-lineid', label: 'Line ID', value: selectedTenant?.lineId },
            ].map((field) => (
              <div key={field.id}>
                <label htmlFor={field.id} className="block text-xs font-semibold text-sand-830">
                  {field.label}
                </label>
                <input
                  id={field.id}
                  type="text"
                  readOnly
                  value={field.value || 'Not provided'}
                  className="mt-1 w-full cursor-default rounded-lg border border-sand-110 bg-page-bg px-3 py-2 text-sm text-sand-830 outline-none"
                />
                <span className="mt-0.5 block text-[11px] text-sand-320">From the tenant record</span>
              </div>
            ))}
          </div>

          {/* Section 2: Lease Period */}
          <div className="mt-6 border-t border-sand-65 pt-4">
            <h3 className="text-[11px] font-bold tracking-[0.8px] text-sand-320 uppercase">Lease Period</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="start-date" className="block text-xs font-semibold text-sand-830">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-sand-110 bg-white px-3 py-2 text-sm text-sand-830 outline-none focus:border-wine-750"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block text-xs font-semibold text-sand-830">
                  End Date <span className="text-rose-500">*</span>
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-sand-110 bg-white px-3 py-2 text-sm text-sand-830 outline-none focus:border-wine-750"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Lease Terms */}
          <div className="mt-6 border-t border-sand-65 pt-4">
            <h3 className="text-[11px] font-bold tracking-[0.8px] text-sand-320 uppercase">Lease Terms</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="billing-cycle" className="block text-xs font-semibold text-sand-830">
                  Billing Cycle <span className="text-rose-500">*</span>
                </label>
                <CustomSelect
                  id="billing-cycle"
                  value={billingCycle}
                  onChange={(val) => setBillingCycle(val as BillingCycle)}
                  options={[
                    { value: 'MONTHLY', label: 'Monthly' },
                    { value: 'YEARLY', label: 'Yearly' },
                  ]}
                />
              </div>

              <div>
                <label htmlFor="rent-amount" className="block text-xs font-semibold text-sand-830">
                  Rent Amount
                </label>
                {/*
                  SSK-127 ค่าเช่าฟิกตามประเภทห้อง ไม่ให้กรอก (feedback อาจารย์ข้อ 5)
                  สัญญาเดิมโชว์ค่าเช่าที่ล็อกไว้ตอนเซ็น ไม่ใช่ราคาปัจจุบันของประเภทห้อง
                */}
                <input
                  id="rent-amount"
                  type="text"
                  readOnly
                  value={bahtAmount(rent)}
                  className="mt-1 w-full cursor-default rounded-lg border border-sand-110 bg-page-bg px-3 py-2 text-sm font-semibold text-sand-830 outline-none"
                />
                <span className="mt-0.5 block text-[11px] text-sand-320">
                  {isEdit ? 'Locked when the contract was created' : 'Fixed by the room type of the unit'}
                </span>
              </div>

              <div>
                <label htmlFor="security-deposit" className="block text-xs font-semibold text-sand-830">
                  Security Deposit (฿) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="security-deposit"
                  type="number"
                  value={Number.isNaN(securityDeposit) ? '' : securityDeposit}
                  onChange={(e) => setSecurityDeposit(e.target.valueAsNumber)}
                  required
                  className="mt-1 w-full rounded-lg border border-sand-110 bg-white px-3 py-2 text-sm text-sand-830 outline-none [appearance:textfield] focus:border-wine-750 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="mt-0.5 block text-[11px] text-sand-320">Printed on the contract as [SECURITY_DEPOSIT]</span>
              </div>

              <div>
                <label htmlFor="common-fee" className="block text-xs font-semibold text-sand-830">
                  Common Area Fee (฿)
                </label>
                {isEdit ? (
                  <input
                    id="common-fee"
                    type="text"
                    readOnly
                    value={lease.commonAreaFee === undefined ? 'Not available' : bahtAmount(lease.commonAreaFee)}
                    className="mt-1 w-full cursor-default rounded-lg border border-sand-110 bg-page-bg px-3 py-2 text-sm text-sand-830 outline-none"
                  />
                ) : (
                  <input
                    id="common-fee"
                    type="number"
                    value={commonAreaFee === undefined || Number.isNaN(commonAreaFee) ? '' : commonAreaFee}
                    onChange={(e) => setCommonAreaFeeInput(e.target.valueAsNumber)}
                    className="mt-1 w-full rounded-lg border border-sand-110 bg-white px-3 py-2 text-sm text-sand-830 outline-none [appearance:textfield] focus:border-wine-750 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                )}
                <span className="mt-0.5 block text-[11px] text-sand-320">
                  {isEdit ? 'Locked when the contract was created' : 'From Apartment Config'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Utilities */}
          <div className="mt-6 border-t border-sand-65 pt-4">
            <h3 className="text-[11px] font-bold tracking-[0.8px] text-sand-320 uppercase">Utilities</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="water-billing" className="block text-xs font-semibold text-sand-830">
                  Water Billing Type <span className="text-rose-500">*</span>
                </label>
                <CustomSelect
                  id="water-billing"
                  value={resolvedWaterRate}
                  onChange={(val) => setWaterRate(val)}
                  options={[{ value: waterPerUnitLabel, label: waterPerUnitLabel }]}
                />
              </div>

              <div>
                <label htmlFor="electric-billing" className="block text-xs font-semibold text-sand-830">
                  Electric Billing Type <span className="text-rose-500">*</span>
                </label>
                <CustomSelect
                  id="electric-billing"
                  value={resolvedElectricRate}
                  onChange={(val) => setElectricRate(val)}
                  options={[{ value: electricPerUnitLabel, label: electricPerUnitLabel }]}
                />
              </div>
            </div>
            <span className="mt-1.5 block text-[11px] text-sand-320">
              Rates default from Apartment Config and are locked into this contract once saved.
            </span>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-5 border-t border-sand-65">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-sand-110 bg-white px-5 py-2 text-sm font-medium text-sand-530 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="contract-form"
            disabled={submitting}
            className="rounded-lg bg-wine-750 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-wine-800 focus:outline-none"
          >
            {submitting ? 'Saving...' : isEdit ? 'Confirm' : 'Create Contract'}
          </button>
        </div>
      </div>
    </div>
  )
}
