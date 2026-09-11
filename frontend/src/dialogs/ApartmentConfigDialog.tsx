import { useState, type FormEvent } from 'react'
import { errorMessage, fetchApartmentConfig, updateApartmentConfig } from '../api/client'
import type { ApartmentConfigRequest } from '../api/types'
import { validateApartmentConfig } from '../domain/apartmentConfig'
import { useLoader } from '../hooks/useLoader'
import { Modal } from '../components/Modal'
import { NumberField } from '../components/Field'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { LoadingState, ErrorState } from '../components/PageState'
import { thaiDate } from '../format'

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
  const config = useLoader(fetchApartmentConfig, 'เรียกอัตราค่าบริการไม่สำเร็จ')

  return (
    <Modal
      title="Apartment Config"
      subtitle="อัตราค่าสาธารณูปโภคที่ใช้คำนวณใบเสร็จ"
      onClose={onClose}
      footer={
        config.data ? undefined : <SecondaryButton onClick={onClose}>ปิด</SecondaryButton>
      }
    >
      {config.loading && <LoadingState label="กำลังโหลดอัตราค่าบริการ..." />}
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
      setFormError(errorMessage(error, 'บันทึกอัตราค่าบริการไม่สำเร็จ'))
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
          label="ค่าไฟต่อหน่วย (บาท)"
          value={electricRatePerUnit}
          onChange={setElectric}
          hint="คิดตามหน่วยที่ใช้จริงในรอบบิล"
        />
        <NumberField
          label="ค่าน้ำต่อหน่วย (บาท)"
          value={waterRatePerUnit}
          onChange={setWater}
          hint="คิดตามหน่วยที่ใช้จริงในรอบบิล"
        />
        <NumberField
          label="ค่าส่วนกลาง (บาท/เดือน)"
          value={commonAreaFee}
          onChange={setCommonArea}
          hint="คิดเท่ากันทุกห้อง"
        />
        <NumberField
          label="ค่าอินเทอร์เน็ต (บาท/เดือน)"
          value={internetFee}
          onChange={setInternet}
          hint="คิดเท่ากันทุกห้อง"
        />
      </div>

      <p className="text-xs text-body-muted">แก้ไขล่าสุดเมื่อ {thaiDate(updatedAt)}</p>

      <p className="rounded-lg border border-[rgba(238,217,196,0.6)] bg-[#faf9f6] px-4 py-3 text-sm text-body-muted">
        อัตราใหม่จะมีผลกับใบเสร็จที่ออกหลังจากนี้เท่านั้น ใบเสร็จที่ออกไปแล้วยังคงอัตราเดิมไว้
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
          บันทึกอัตราใหม่แล้ว
        </p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <SecondaryButton onClick={onClose} disabled={submitting}>
          ยกเลิก
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? 'กำลังบันทึก...' : 'บันทึกอัตรา'}
        </PrimaryButton>
      </div>
    </form>
  )
}
