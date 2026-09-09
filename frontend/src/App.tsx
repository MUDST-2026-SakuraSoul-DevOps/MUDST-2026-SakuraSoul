import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import AppLayout from './layouts/AppLayout'
import DashboardPage from './pages/DashboardPage'
import UnitsPage from './pages/UnitsPage'
import TenantsPage from './pages/TenantsPage'
import PaymentsPage from './pages/PaymentsPage'
import MaintenancePage from './pages/MaintenancePage'
import ContractsPage from './pages/ContractsPage'
import AppliancesPage from './pages/AppliancesPage'

/**
 * SSK-7: Admin Login + ทุกหน้าแอดมิน
 * - /login → หน้า Login (SSK-7)
 * - / และหน้าอื่น ๆ อยู่ใต้ AppLayout (sidebar)
 * รายการหน้าตรงกับเมนูใน Figma sidebar ตรง ๆ (ดู src/layouts/nav.ts)
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
