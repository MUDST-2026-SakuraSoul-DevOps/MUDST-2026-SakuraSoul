import { Download } from 'lucide-react'
import { Modal } from '../components/Modal'
import { SecondaryButton } from '../components/Button'
import { ErrorState, LoadingState } from '../components/PageState'
import type { ScannedDocument } from '../api/types'
import { useAttachmentBlob } from '../hooks/useAttachmentBlob'
import { DOCUMENT_TYPE_LABEL, documentOwnerLabel, documentTitle, formatFileSize } from '../domain/documents'
import { downloadBlob } from '../lib/downloadFile'
import { displayDate, displayDateTime } from '../format'

interface ViewDocumentDialogProps {
  doc: ScannedDocument
  onClose: () => void
}

/**
 * ดูเอกสารสแกนหนึ่งฉบับ (SSK-172) ไฟล์โหลดผ่าน client เป็น blob แล้วโชว์ใน iframe (PDF) หรือ img (รูป)
 * ใส่ contentUrl ตรง ๆ ไม่ได้ เพราะ backend ตอบ X-Frame-Options: DENY (ดู useAttachmentBlob)
 */
export function ViewDocumentDialog({ doc, onClose }: ViewDocumentDialogProps) {
  const file = useAttachmentBlob(doc.attachmentId)
  const title = documentTitle(doc)
  const subtitle = [DOCUMENT_TYPE_LABEL[doc.type], `Unit ${doc.owner.roomNumber}`, doc.owner.tenantName]
    .filter(Boolean)
    .join(' · ')

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} width="wide">
      <div className="flex flex-col gap-4">
        <div className="min-h-[350px] max-h-[500px] overflow-auto rounded-xl border border-avatar-ring/60 bg-sand-60/30 p-4">
          {file.loading && <LoadingState label="Opening the file..." />}
          {file.error && <ErrorState message={file.error} />}
          {file.url &&
            (doc.contentType === 'application/pdf' ? (
              <iframe
                title={`File of ${title}`}
                src={file.url}
                className="w-full h-[450px] rounded-lg border border-sand-80 bg-white"
              />
            ) : (
              <div className="flex items-center justify-center p-2">
                <img
                  src={file.url}
                  alt={`Scan of ${title}`}
                  className="max-h-[450px] max-w-full rounded-lg object-contain shadow-xs"
                />
              </div>
            ))}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-body-muted">Attached to</dt>
            <dd className="font-semibold text-ink">{documentOwnerLabel(doc.owner)}</dd>
          </div>
          <div>
            <dt className="text-body-muted">Scan date</dt>
            <dd className="font-semibold text-ink">{displayDate(doc.scanDate)}</dd>
          </div>
          <div>
            <dt className="text-body-muted">File</dt>
            <dd className="font-semibold text-ink break-all">
              {doc.fileName} · {formatFileSize(doc.sizeBytes)}
            </dd>
          </div>
          <div>
            <dt className="text-body-muted">Uploaded</dt>
            <dd className="font-semibold text-ink">
              {displayDateTime(doc.uploadedAt)} by {doc.uploadedBy}
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-between pt-2 border-t border-sand-80">
          <button
            type="button"
            onClick={() => file.blob && downloadBlob(doc.fileName, file.blob)}
            disabled={file.blob === null}
            className="flex items-center gap-1.5 rounded-lg border border-avatar-ring bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-sand-60 transition disabled:opacity-40"
          >
            <Download size={14} />
            Download file
          </button>
          <SecondaryButton type="button" onClick={onClose}>
            Close
          </SecondaryButton>
        </div>
      </div>
    </Modal>
  )
}
