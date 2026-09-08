import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../api/client'

/**
 * โหลดข้อมูลจาก API หนึ่งชุด พร้อมสถานะกำลังโหลด/error และปุ่มโหลดซ้ำ
 *
 * ทุกหน้าเคยเขียน useEffect + useState + ธง cancelled แบบเดียวกันซ้ำ ๆ
 * ย้ายมาไว้ที่เดียวเพื่อไม่ให้ลืมยกเลิกตอน component ถูกถอด ซึ่งเป็นที่มาของ
 * warning "state update on unmounted component" เวลาเปลี่ยนหน้าเร็ว ๆ
 *
 * reload() มีไว้ให้เรียกหลังบันทึกสำเร็จ เช่น หลังสร้างสัญญาเช่าเสร็จ
 * แดชบอร์ดต้องเห็นสถานะห้องใหม่ทันทีตาม US-08 ที่ขอว่าข้อมูลต้องตรงกับ database
 */
export interface Loader<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

export function useLoader<T>(
  load: () => Promise<T>,
  fallbackMessage: string,
  deps: unknown[] = [],
): Loader<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  // ตั้งสถานะกำลังโหลดที่นี่ ไม่ใช่ใน useEffect เพราะการเรียก setState ตรง ๆ
  // ในตัว effect ทำให้ render ซ้ำเป็นทอด ๆ (กฎ react-hooks/set-state-in-effect)
  // รอบแรกใช้ค่าตั้งต้น true อยู่แล้ว รอบถัดไปมาจากปุ่มที่ผู้ใช้กด
  const reload = useCallback(() => {
    setLoading(true)
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    load()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, fallbackMessage))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
    // load ถูกสร้างใหม่ทุกรอบ render จึงไม่เอามาเป็น dependency ตรง ๆ
    // ให้หน้าที่เรียกส่ง deps ที่แท้จริงมาเอง แล้วใช้ tick สั่งโหลดซ้ำ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])

  return { data, error, loading, reload }
}
