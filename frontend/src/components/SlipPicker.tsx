import { useRef, useState, type ChangeEvent } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { checkUploadFile, UPLOAD_ACCEPT, UPLOAD_HINT } from '../lib/fileSignature'
import { formatFileSize } from '../domain/documents'

/**
 * ช่องเลือกไฟล์สลิปการชำระ (SSK-163) ใช้ทั้งตอนบันทึกการชำระและตอนแนบภายหลังจากประวัติ
 *
 * ตรวจไฟล์ก่อนส่งด้วยกฎเดียวกับ backend (PDF/PNG/JPEG ตามเนื้อไฟล์ ไม่เกิน 5 MB) ไฟล์ที่ไม่ผ่านไม่ถูกส่งต่อ
 * ไฟล์ที่เลือกทีหลังชนะเสมอ แม้ไฟล์ก่อนหน้าจะตรวจเสร็จช้ากว่า (แบบเดียวกับ UploadContractDialog)
 * ระหว่างตรวจไฟล์บอกผ่าน onChecking ให้ป็อปอัปรอก่อนส่ง ไม่งั้นกดบันทึกเร็ว ๆ จะได้การชำระที่ไม่มีสลิปโดยไม่รู้ตัว
 *
 * input ของไฟล์ซ่อนไว้ ชื่อของปุ่มที่เห็นจึงขึ้นต้นด้วย label โปรแกรมอ่านหน้าจอจะได้รู้ว่าเป็นช่องอะไร
 * ข้อความปัญหาของไฟล์อยู่ใน live region ที่วางไว้ตลอด (เปลี่ยนแค่ข้อความ) จึงถูกอ่านออกเสียงเมื่อมีปัญหา
 * ไม่ใช้ role="alert" เพราะป็อปอัปที่ใช้ช่องนี้มีกล่อง alert ของตัวเองอยู่แล้ว
 */
export function SlipPicker({
  label,
  file,
  onChange,
  onChecking,
  disabled = false,
}: {
  label: string
  file: File | null
  onChange: (file: File | null) => void
  onChecking?: (checking: boolean) => void
  disabled?: boolean
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const latestPick = useRef(0)

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    // ล้างค่าใน input ให้เลือกไฟล์เดิมซ้ำได้หลังกดเอาไฟล์ออก
    e.target.value = ''
    const pick = ++latestPick.current
    setProblem(null)
    if (!selected) {
      // ไฟล์ที่กำลังตรวจอยู่ถูกยกเลิกไปแล้ว (pick ใหม่กว่า) ต้องปลดการรอด้วย ไม่งั้นปุ่มบันทึกจะกดไม่ได้ค้างไว้
      onChecking?.(false)
      return
    }
    onChecking?.(true)
    const found = await checkUploadFile(selected)
    if (pick !== latestPick.current) {
      return
    }
    onChecking?.(false)
    onChange(found ? null : selected)
    setProblem(found)
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        ref={inputRef}
        aria-label={label}
        accept={UPLOAD_ACCEPT}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      {file ? (
        <div className="flex items-center justify-between rounded-lg border border-avatar-ring/40 bg-white p-3">
          <div className="flex items-center gap-2.5">
            <FileText aria-hidden="true" className="ui-icon size-icon-inline text-brand" />
            <div>
              <p className="break-all text-xs font-semibold text-ink">{file.name}</p>
              <p className="text-xs text-body-muted">{formatFileSize(file.size)}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={() => onChange(null)}
            disabled={disabled}
            className="icon-button rounded p-1 text-sand-530 hover:bg-black/5 hover:text-rose-600"
          >
            <X aria-hidden="true" className="ui-icon size-icon-control" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={`${label}: Choose a slip file`}
          disabled={disabled}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-avatar-ring/60 bg-sand-50/50 px-3 py-3 text-xs font-medium text-brand hover:border-brand disabled:opacity-50"
        >
          <Upload aria-hidden="true" className="ui-icon size-icon-inline" />
          Choose a slip file
        </button>
      )}
      <p className="text-[11px] text-body-muted">{UPLOAD_HINT}</p>
      <p aria-live="polite" className={problem ? 'rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700' : 'sr-only'}>
        {problem ?? ''}
      </p>
    </div>
  )
}
