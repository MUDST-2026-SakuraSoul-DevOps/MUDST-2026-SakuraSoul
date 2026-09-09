import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import DashboardPage from './pages/DashboardPage'
import UnitsPage from './pages/UnitsPage'
import TenantsPage from './pages/TenantsPage'
import PaymentsPage from './pages/PaymentsPage'
import MaintenancePage from './pages/MaintenancePage'
import ContractsPage from './pages/ContractsPage'
import AppliancesPage from './pages/AppliancesPage'

/**
 * ตั้ง route หลักของฝั่งแอดมิน ทุกหน้าอยู่ใต้ AppLayout (sidebar) เดียวกัน
 * รายการหน้าตรงกับเมนูใน Figma sidebar ตรง ๆ (ดู src/layouts/nav.ts)
 * เพิ่มหน้าใหม่ที่นี่ และเพิ่มเมนูคู่กันที่ src/layouts/nav.ts
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="units" element={<UnitsPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="appliances" element={<AppliancesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
