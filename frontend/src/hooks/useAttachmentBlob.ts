import { useEffect, useState } from 'react'
import { errorMessage, fetchAttachmentContent } from '../api/client'

export interface AttachmentBlob {
  blob: Blob | null
  /** object URL ของ blob ใช้กับ iframe หรือ img ถูก revoke เองตอนเปลี่ยนไฟล์หรือ component ถูกถอด */
  url: string | null
  error: string | null
  loading: boolean
}

/**
 * โหลดตัวไฟล์ของไฟล์แนบหรือเอกสารสแกน (SSK-161) มาเป็น object URL สำหรับดูตัวอย่าง
 *
 * ต้องโหลดผ่าน client ไม่ใส่ contentUrl ใน iframe ตรง ๆ เพราะ Spring Security ตอบ X-Frame-Options: DENY
 * และ session ที่หมดระหว่างดูจะถูกดักที่ send เหมือนคำขออื่น
 *
 * state จำ id ของไฟล์ที่โหลดได้ไว้ด้วย ตอนเปลี่ยนไฟล์จึงไม่โชว์ไฟล์เก่าค้าง และไม่ต้องล้าง state
 * ใน effect (กฎ react-hooks/set-state-in-effect)
 */
export function useAttachmentBlob(attachmentId: number | null): AttachmentBlob {
  const [loaded, setLoaded] = useState<{ id: number; blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    if (attachmentId === null) {
      return
    }
    let cancelled = false
    let url: string | null = null
    fetchAttachmentContent(attachmentId)
      .then((blob) => {
        if (!cancelled) {
          url = URL.createObjectURL(blob)
          setLoaded({ id: attachmentId, blob, url })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailed({ id: attachmentId, message: errorMessage(error, 'Could not open the file') })
        }
      })
    return () => {
      cancelled = true
      // กลับมาที่ไฟล์เดิม (A → B → A) ต้องไม่หยิบ URL ที่ revoke ไปแล้วหรือ error เก่ามาโชว์ระหว่างรอโหลดใหม่
      setFailed((current) => (current?.id === attachmentId ? null : current))
      if (url !== null) {
        URL.revokeObjectURL(url)
        const revoked = url
        setLoaded((current) => (current?.url === revoked ? null : current))
      }
    }
  }, [attachmentId])

  const current = loaded?.id === attachmentId ? loaded : null
  const error = failed?.id === attachmentId ? failed.message : null
  return {
    blob: current?.blob ?? null,
    url: current?.url ?? null,
    error,
    loading: attachmentId !== null && current === null && error === null,
  }
}
