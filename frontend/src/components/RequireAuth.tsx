import { Navigate, Outlet } from 'react-router-dom'
import { fetchMe } from '../api/client'
import { useLoader } from '../hooks/useLoader'
import { LoadingState } from './PageState'

/**
 * ยามหน้าหลังบ้านทั้งหมด ถาม GET /api/auth/me ตอนเปิดแอปว่าจะให้เห็นหน้าไหน (US-01)
 *
 * ต้องถาม server ทุกครั้ง ห้ามเชื่อสิ่งที่จำไว้ใน localStorage เพราะฝั่งนั้นไม่มีทาง
 * รู้ว่า session ฝั่ง server หมดอายุไปแล้วหรือยัง คนที่รู้จริงมีแค่ server เจ้าของ session
 *
 * พลาดยังไงก็นับเป็น "ยังไม่ได้ล็อกอิน" ทั้งหมด ทั้ง 401 และ network หลุด เพราะพา
 * ไปหน้า Login ให้ล็อกอินใหม่ยังปลอดภัยกว่าปล่อยให้ค้างอยู่กับหน้าจอเปล่า ๆ
 *
 * useLoader ยุบ ApiError เหลือแค่ข้อความ ทิ้ง .status ไป ตรงนี้จึงแยก 401 ออกจาก 500
 * ไม่ได้ ซึ่งตั้งใจให้เป็นแบบนั้น ทั้งสองกรณีจบที่หน้า Login เหมือนกันอยู่แล้ว
 */
export function RequireAuth() {
  const { data, loading } = useLoader(fetchMe, 'Please sign in')

  if (loading) {
    // เต็มจอและจัดกึ่งกลาง เพราะตอนนี้ยังไม่มี AppLayout ครอบ ถ้าปล่อยตามค่าตั้งต้น
    // ของ LoadingState จะไปกองอยู่มุมซ้ายบนของหน้าเปล่า ๆ
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Checking your session..." />
      </div>
    )
  }
  if (!data) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
