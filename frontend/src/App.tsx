import { useEffect, useState } from 'react'
import { fetchRooms } from './api/client'

/**
 * หน้า placeholder ไม่ใช่ดีไซน์จริง
 *
 * มีไว้พิสูจน์อย่างเดียวว่าเส้นทาง React ไป nginx ไป Spring Boot ไป PostgreSQL ต่อกันติดแล้ว
 * หน้าจอจริงมาจาก Figma ที่ทีมทำไว้ ให้ลบไฟล์นี้ทิ้งแล้วเขียนใหม่ได้เลย
 *
 * ถ้าจะทำหลายหน้าต้องลง router เองก่อน ตอนนี้ยังไม่ได้ลงไว้ให้
 */
export default function App() {
  const [roomCount, setRoomCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRooms()
      .then((rooms) => {
        if (!cancelled) {
          setRoomCount(rooms.length)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Sakura Soul</h1>
      <p className="text-slate-600">ระบบจัดการหอพัก</p>

      <p className="mt-6">
        {error !== null
          ? `เรียก /api/rooms ไม่สำเร็จ ${error}`
          : roomCount === null
            ? 'กำลังเรียก /api/rooms'
            : `ต่อ backend ได้แล้ว มีห้องในระบบ ${roomCount} ห้อง`}
      </p>

      <p className="mt-6 text-sm text-slate-500">
        หน้านี้เป็น placeholder รอแทนที่ด้วย UI ที่แปลงมาจาก Figma
      </p>
    </main>
  )
}
