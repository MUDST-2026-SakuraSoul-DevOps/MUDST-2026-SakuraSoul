import { Navigate, Outlet } from 'react-router-dom'
import { fetchMe } from '../api/client'
import type { AuthUser } from '../api/types'
import { syncProfileWithUser } from '../domain/profileStore'
import { useLoader } from '../hooks/useLoader'
import { LoadingState } from './PageState'

/**
 * ถาม server ว่าใครล็อกอินอยู่ แล้วเติมโปรไฟล์ให้เป็นของคนนั้นก่อนคืนคำตอบ
 *
 * เติมในนี้ ไม่ใช่ใน useEffect เพราะ effect ทำงานหลัง commit และ effect ของลูก
 * ทำงานก่อนของแม่ พอ data กลายเป็นค่าจริง React จะ render Outlet ซึ่งพา AppLayout
 * ขึ้นมาใน commit เดียวกัน AppLayout อ่าน localStorage ตอน render ไปแล้วหนึ่งรอบ
 * ด้วยของเก่า ซึ่งบนเครื่องที่ใช้ร่วมกันคือชื่อกับรูปของคนก่อนหน้า ทำในนี้ทุกอย่าง
 * จบก่อน setData จึงไม่มีเฟรมไหนที่โชว์ของคนอื่นเลย
 *
 * และห้ามเติมตอน render การเขียน localStorage กับยิง window event ระหว่าง render
 * เป็นผลข้างเคียงที่ไปสั่ง setState ให้ component อื่นกลางคัน แถม StrictMode
 * (เปิดอยู่ใน main.tsx) เรียก render ซ้ำ ผลลัพธ์จะไม่แน่นอน
 *
 * ประกาศไว้นอก component เพื่อให้ตัวฟังก์ชันเป็นตัวเดิมทุกรอบ render
 */
async function loadSignedInUser(): Promise<AuthUser> {
  const user = await fetchMe()
  syncProfileWithUser(user)
  return user
}

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
  const { data, loading } = useLoader(loadSignedInUser, 'Please sign in')

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
