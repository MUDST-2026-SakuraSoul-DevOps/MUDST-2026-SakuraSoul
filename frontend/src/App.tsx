import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'

/**
 * SSK-7: Admin Login
 * ตอนนี้แสดง LoginPage เป็นหน้าแรก (/) เมื่อ login สำเร็จจะ redirect
 * ไปหน้า dashboard (ยังไม่ทำ — รอ feature อื่นเพิ่มเข้ามา)
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  )
}
