import { useState } from 'react'
import { Download } from 'lucide-react'
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
 */
export function PaymentSlipDialog({
  payment,
  onClose,
}: {
  payment: { paymentId: number; label: string; roomNumber: string; receiptNo: string }
  onClose: () => void
}) {
  const slips = useLoader(
    () => fetchAttachments('PAYMENT', payment.paymentId),
    'Could not load the slip',
    [payment.paymentId],
  )
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pick, setPick] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const list = slips.data ?? []
  // backend เรียงไฟล์ใหม่สุดก่อน ค่าตั้งต้นจึงเป็นสลิปล่าสุด
  const current = list.find((a) => a.id === selectedId) ?? list[0] ?? null
  const file = useAttachmentBlob(current?.id ?? null)

  async function attach() {
    if (!pick) return
    setUploading(true)
    setUploadError(null)
    try {
      const created = await uploadAttachment(pick, 'PAYMENT', payment.paymentId)
      setPick(null)
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
        {uploadError && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            {uploadError}
          </p>
        )}
        {slips.error && <ErrorState message={slips.error} />}
        {slips.loading && !slips.data && <LoadingState label="Loading the slip..." />}
        {slips.data && list.length === 0 && <p className="text-sm text-body-muted">No slip attached to this payment yet.</p>}

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

        {slips.data && (
          <div className="flex flex-col gap-2 border-t border-sand-80 pt-4">
            <p className="text-xs font-medium text-body-muted">{list.length === 0 ? 'Attach a slip' : 'Attach another slip'}</p>
            <SlipPicker label="Slip file to attach" file={pick} onChange={setPick} disabled={uploading} />
            <div className="flex justify-end gap-3">
              <SecondaryButton type="button" onClick={onClose}>
                Close
              </SecondaryButton>
              <PrimaryButton type="button" onClick={attach} disabled={!pick || uploading}>
                {uploading ? 'Uploading...' : 'Attach slip'}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
