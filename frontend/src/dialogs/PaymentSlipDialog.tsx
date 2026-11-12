import { useState } from 'react'
import { Download } from 'lucide-react'
import type { Attachment } from '../api/types'
import { Modal } from '../components/Modal'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { ErrorState, LoadingState } from '../components/PageState'
import { SlipPicker } from '../components/SlipPicker'
import { errorMessage, fetchAttachments, uploadAttachment } from '../api/client'
import { useLoader } from '../hooks/useLoader'
import { useAttachmentBlob } from '../hooks/useAttachmentBlob'
import { formatFileSize } from '../domain/documents'
import { downloadBlob } from '../lib/downloadFile'
import { displayDateTime } from '../format'

/**
 * สลิปของการชำระหนึ่งก้อน (SSK-163 แนบสลิปได้แต่ไม่บังคับ)
 *
 * โหลดรายการไฟล์ตอนเปิดป็อปอัป (GET /api/attachments?ownerType=PAYMENT) ไม่โหลดล่วงหน้าทุกแถวของประวัติ
 * เพราะ backend ไม่มีธงบอกว่าการชำระไหนมีสลิป การถามทีละแถวจะเป็นคำขอหนึ่งครั้งต่อแถว
 * ไม่มีสลิปก็แนบได้จากที่นี่ ซึ่งเป็นทางแนบใหม่เมื่ออัปโหลดตอนบันทึกการชำระไม่ผ่าน
 * กรณีนั้นหน้า Payments เปิดป็อปอัปนี้ให้เอง พร้อม notice บอกเหตุผลและไฟล์เดิมที่เลือกไว้ กด Attach slip ลองใหม่ได้เลย
 * การชำระที่ void แล้วเปิดดูสลิปเดิมได้ (หลักฐานยังอยู่) แต่แนบเพิ่มไม่ได้
 */
export function PaymentSlipDialog({
  payment,
  notice,
  initialFile = null,
  onClose,
}: {
  payment: { paymentId: number; label: string; roomNumber: string; receiptNo: string; voided?: boolean }
  /** บอกว่าทำไมป็อปอัปเปิดขึ้นเอง หายไปเมื่อผู้ใช้ลองแนบในป็อปอัปนี้แล้ว (ได้หรือไม่ได้ก็มีข้อความใหม่แทน) */
  notice?: string
  /** ไฟล์ที่เลือกไว้ตั้งแต่แรก ใช้ตอนเปิดให้ลองแนบไฟล์เดิมอีกครั้ง */
  initialFile?: File | null
  onClose: () => void
}) {
  const slips = useLoader(
    () => fetchAttachments('PAYMENT', payment.paymentId),
    'Could not load the slip',
    [payment.paymentId],
  )
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pick, setPick] = useState<File | null>(initialFile)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // ไฟล์ที่เพิ่งแนบสำเร็จ โชว์ทันทีโดยไม่ต้องรอโหลดรายการใหม่ โหลดใหม่ไม่ผ่านก็ยังเห็นว่าแนบแล้ว ไม่หลอกให้แนบซ้ำ
  const [added, setAdded] = useState<Attachment[]>([])

  const fromServer = slips.data ?? []
  // backend เรียงไฟล์ใหม่สุดก่อน ไฟล์ที่เพิ่งแนบใหม่กว่าทุกไฟล์ จึงอยู่หน้าสุด
  const list = [...added.filter((a) => !fromServer.some((s) => s.id === a.id)), ...fromServer]
  const current = list.find((a) => a.id === selectedId) ?? list[0] ?? null
  const file = useAttachmentBlob(current?.id ?? null)
  const loaded = slips.data !== null || added.length > 0

  async function attach() {
    if (!pick) return
    setUploading(true)
    setUploadError(null)
    try {
      const created = await uploadAttachment(pick, 'PAYMENT', payment.paymentId)
      setPick(null)
      setAdded((previous) => [created, ...previous])
      setSelectedId(created.id)
      slips.reload()
    } catch (err) {
      setUploadError(errorMessage(err, 'Could not upload the slip'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal
      title="Payment slip"
      subtitle={`${payment.label} · Unit ${payment.roomNumber} · ${payment.receiptNo}`}
      onClose={onClose}
      width="wide"
    >
      <div className="flex flex-col gap-4">
        {notice && uploadError === null && added.length === 0 && (
          <p role="alert" className="rounded-lg bg-honey-20 p-3 text-xs text-honey-350">
            {notice}
          </p>
        )}
        {uploadError && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            {uploadError}
          </p>
        )}
        {added.length > 0 && (
          <p role="status" className="rounded-lg bg-moss-50 p-3 text-xs text-moss-545">
            Slip attached.
          </p>
        )}
        {slips.error && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ErrorState message={slips.error} />
            <SecondaryButton type="button" onClick={slips.reload}>
              Retry
            </SecondaryButton>
          </div>
        )}
        {slips.loading && !loaded && <LoadingState label="Loading the slip..." />}
        {slips.data && list.length === 0 && <p className="text-sm text-body-muted">No slip attached to this payment yet.</p>}
        {payment.voided && (
          <p className="text-xs text-body-muted">This payment was voided. Its slips stay here for the record and no new slip can be attached.</p>
        )}

        {current && (
          <>
            <div className="min-h-[300px] max-h-[460px] overflow-auto rounded-xl border border-avatar-ring/60 bg-sand-60/30 p-4">
              {file.loading && <LoadingState label="Opening the slip..." />}
              {file.error && <ErrorState message={file.error} />}
              {file.url &&
                (current.contentType === 'application/pdf' ? (
                  <iframe
                    title={`Payment slip ${current.fileName}`}
                    src={file.url}
                    className="h-[420px] w-full rounded-lg border border-sand-80 bg-white"
                  />
                ) : (
                  <div className="flex items-center justify-center p-2">
                    <img
                      src={file.url}
                      alt={`Payment slip ${current.fileName}`}
                      className="max-h-[420px] max-w-full rounded-lg object-contain shadow-xs"
                    />
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <p className="text-body-muted">
                <span className="font-semibold text-ink break-all">{current.fileName}</span> · {formatFileSize(current.sizeBytes)} ·
                uploaded {displayDateTime(current.uploadedAt)} by {current.uploadedBy}
              </p>
              <button
                type="button"
                onClick={() => file.blob && downloadBlob(current.fileName, file.blob)}
                disabled={file.blob === null}
                className="flex items-center gap-1.5 rounded-lg border border-avatar-ring bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-sand-60 transition disabled:opacity-40"
              >
                <Download size={14} aria-hidden="true" />
                Download slip
              </button>
            </div>
          </>
        )}

        {list.length > 1 && (
          <div role="group" aria-label="Attached slips" className="flex flex-wrap gap-2">
            {list.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={current?.id === a.id}
                onClick={() => setSelectedId(a.id)}
                className="rounded border border-avatar-ring/60 bg-white px-2.5 py-1 text-xs text-ink aria-pressed:border-brand aria-pressed:text-brand"
              >
                {a.fileName}
              </button>
            ))}
          </div>
        )}

        {loaded && !payment.voided && (
          <div className="flex flex-col gap-2 border-t border-sand-80 pt-4">
            <p className="text-xs font-medium text-body-muted">{list.length === 0 ? 'Attach a slip' : 'Attach another slip'}</p>
            <SlipPicker label="Slip file to attach" file={pick} onChange={setPick} disabled={uploading} />
          </div>
        )}
        <div className="flex justify-end gap-3 border-t border-sand-80 pt-4">
          <SecondaryButton type="button" onClick={onClose}>
            Close
          </SecondaryButton>
          {loaded && !payment.voided && (
            <PrimaryButton type="button" onClick={attach} disabled={!pick || uploading}>
              {uploading ? 'Uploading...' : 'Attach slip'}
            </PrimaryButton>
          )}
        </div>
      </div>
    </Modal>
  )
}
