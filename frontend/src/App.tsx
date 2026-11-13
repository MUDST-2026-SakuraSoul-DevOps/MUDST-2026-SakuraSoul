import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import AppLayout from './layouts/AppLayout'
import DashboardPage from './pages/DashboardPage'
import UnitsPage from './pages/UnitsPage'
import TenantsPage from './pages/TenantsPage'
import PaymentsPage from './pages/PaymentsPage'
import MaintenancePage from './pages/MaintenancePage'
import ContractsPage from './pages/ContractsPage'
import AppliancesPage from './pages/AppliancesPage'
import DocumentsPage from './pages/DocumentsPage'
import AccountSettingsPage from './pages/AccountSettingsPage'
import UsagePage from './pages/UsagePage'
import { RequireAuth } from './components/RequireAuth'

/**
 * SSK-7: Admin Login + ทุกหน้าแอดมิน + SSK-101: Account Settings + SSK-176: Team & Access (RBAC)
 *
 * ทุกหน้าที่อยู่ใต้ AppLayout ถูกครอบด้วย RequireAuth ซึ่งถาม GET /api/auth/me
 * ก่อนว่ามี session อยู่จริงไหม ไม่มีก็เด้งไป /login (US-01)
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="units" element={<UnitsPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="tenants" element={<TenantsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="appliances" element={<AppliancesPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="settings" element={<AccountSettingsPage />} />
            <Route path="account-settings" element={<AccountSettingsPage />} />
            <Route path="account" element={<AccountSettingsPage />} />
            <Route path="permissions" element={<Navigate to="/settings?tab=team" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
