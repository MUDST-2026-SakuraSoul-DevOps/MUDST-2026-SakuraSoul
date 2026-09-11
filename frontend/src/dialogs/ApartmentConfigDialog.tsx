import { useState, type FormEvent } from 'react'
import { errorMessage, fetchApartmentConfig, updateApartmentConfig } from '../api/client'
import type { ApartmentConfigRequest } from '../api/types'
import { validateApartmentConfig } from '../domain/apartmentConfig'
import { useLoader } from '../hooks/useLoader'
import { Modal } from '../components/Modal'
import { NumberField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { LoadingState, ErrorState } from '../components/PageState'
import { displayDate } from '../format'

/**
 * ตั้งอัตราค่าไฟ ค่าน้ำ ค่าส่วนกลาง และค่าอินเทอร์เน็ต (US-16)
 * ตรงกับเฟรม "Apartment Config" ใน Figma (node 27:1115)
 *
 * เปิดจากปุ่ม Config ในหน้า Unit Management เพราะเป็นการตั้งค่าระดับตึก
 * ไม่ใช่ของห้องใดห้องหนึ่ง และปุ่มนั้นมีอยู่ในดีไซน์แล้ว จึงไม่ต้องเพิ่มเมนูใหม่
 * ใน sidebar ซึ่งเป็นไฟล์ที่คนอื่นก็แก้อยู่และ conflict ง่าย
 *
 * ตรวจค่าติดลบสองชั้นเหมือนกฎสัญญาเช่า ฝั่งฟอร์มเตือนทันทีที่กดบันทึก และ
 * backend ตอบ 400 เป็นตาข่ายชั้นสุดท้าย ถ้าอัตราติดลบหลุดไปถึงการคำนวณ
 * ใบเสร็จจะออกใบเสร็จติดลบให้ผู้เช่า ซึ่งกว่าจะรู้ตัวก็ส่งไปแล้ว
 */
export function ApartmentConfigDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved?: () => void
}) {
  const config = useLoader(fetchApartmentConfig, 'Could not load the utility rates')

  return (
    <Modal
      title="Apartment Config"
      subtitle="Utility rates used to calculate receipts"
      onClose={onClose}
      footer={
        config.data ? undefined : <SecondaryButton onClick={onClose}>Close</SecondaryButton>
      }
    >
      {config.loading && <LoadingState label="Loading utility rates..." />}
      {config.error && <ErrorState message={config.error} />}
      {config.data && (
        <ConfigForm
          initial={config.data}
          updatedAt={config.data.updatedAt}
          onClose={onClose}
          onSaved={() => {
            onSaved?.()
            onClose()
          }}
        />
      )}
    </Modal>
  )
}

function ConfigForm({
  initial,
  updatedAt,
  onClose,
  onSaved,
}: {
  initial: ApartmentConfigRequest
  updatedAt: string
  onClose: () => void
  onSaved: () => void
}) {
  const [electricRatePerUnit, setElectric] = useState(initial.electricRatePerUnit)
  const [waterRatePerUnit, setWater] = useState(initial.waterRatePerUnit)
  const [commonAreaFee, setCommonArea] = useState(initial.commonAreaFee)
  const [internetFee, setInternet] = useState(initial.internetFee)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setSaved(false)

    const draft: ApartmentConfigRequest = {
      electricRatePerUnit,
      waterRatePerUnit,
      commonAreaFee,
      internetFee,
    }

    const invalid = validateApartmentConfig(draft)
    if (invalid) {
      setFormError(invalid)
      return
    }

    setSubmitting(true)
    try {
      await updateApartmentConfig(draft)
      setSaved(true)
      onSaved()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not save the utility rates'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // noValidate เพื่อปิดการเตือนของเบราว์เซอร์ ให้ข้อความเตือนมาจาก
    // validateApartmentConfig ที่เดียว ไม่งั้นผู้ใช้จะเจอสองแบบปนกัน
    // ทั้งฟองข้อความภาษาอังกฤษของเบราว์เซอร์และข้อความไทยของเราเอง
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Electricity Rate per Unit (¥)"
          value={electricRatePerUnit}
          onChange={setElectric}
          hint="Charged on actual usage for the billing cycle"
        />
        <NumberField
          label="Water Rate per Unit (¥)"
          value={waterRatePerUnit}
          onChange={setWater}
          hint="Charged on actual usage for the billing cycle"
        />
        <NumberField
          label="Common Area Fee (¥/month)"
          value={commonAreaFee}
          onChange={setCommonArea}
          hint="The same for every unit"
        />
        <NumberField
          label="Internet Fee (¥/month)"
          value={internetFee}
          onChange={setInternet}
          hint="The same for every unit"
        />
      </div>

      <p className="text-xs text-body-muted">Last updated {displayDate(updatedAt)}</p>

      <p className="rounded-lg border border-[rgba(238,217,196,0.6)] bg-[#faf9f6] px-4 py-3 text-sm text-body-muted">
        New rates only apply to receipts issued from now on. Receipts already issued keep their original rates.
      </p>

      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {formError}
        </p>
      )}
      {saved && !formError && (
        <p role="status" className="text-sm text-[#2e7d32]">
          Rates saved
        </p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <SecondaryButton onClick={onClose} disabled={submitting}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save Rates'}
        </PrimaryButton>
      </div>
    </form>
  )
}
