import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import UnitsPage from './pages/UnitsPage'
import TenantsPage from './pages/TenantsPage'
import ContractsPage from './pages/ContractsPage'

/**
 * ตั้ง route หลักของฝั่งแอดมิน ทุกหน้าอยู่ใต้ AppLayout (sidebar) เดียวกัน
 * รอบนี้มีเฉพาะหน้าที่เกี่ยวกับ SSK-10 (Tenant Room Lease):
 *   - Units (ห้อง)
 *   - Tenants (ผู้เช่า)
 *   - Contracts (สัญญาเช่า)
 * หน้าอื่น ๆ จะเพิ่มเข้ามาตาม feature branch ของแต่ละคน
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<UnitsPage />} />
          <Route path="units" element={<UnitsPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="contracts" element={<ContractsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
