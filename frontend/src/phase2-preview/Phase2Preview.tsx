import { useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import { Building2, CreditCard, Droplets, ChartNoAxesCombined, FolderOpen, Wrench, Users, Settings, ChevronRight, Menu, X, RotateCcw, ArrowUpRight, LayoutDashboard, FileText, Refrigerator } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { UnitsDesign } from './UnitsDesign'
import { PaymentsDesign } from './PaymentsDesign'
import { UtilitiesDesign, ReportsDesign } from './UtilitiesDesign'
import { DocumentsDesign, MaintenanceDesign, PeopleDesign } from './OperationsDesign'
import { SettingsDesign } from './SettingsDesign'
import { AppliancesDesign, ContractsDesign, DashboardDesign } from './Phase1Design'
import { initialCatalog, initialContracts, initialDocuments, initialRentals } from './phase1Data'
import './preview.css'

const pages = [
  { path: 'dashboard', label: 'Dashboard', title: 'Room Availability', description: 'An overview of your apartment, residents, and work that needs attention.', issues: 'Phase 1 · SSK-14 / SSK-15', icon: LayoutDashboard },
  { path: 'units', label: 'Units', title: 'Unit Management', description: 'Manage room availability, effective rates, and room-specific charges.', issues: 'SSK-160 · SSK-162 · SSK-165', icon: Building2 },
  { path: 'tenants', label: 'Tenants', title: 'Tenant Directory', description: 'Find tenants even when a name is not spelled exactly right.', issues: 'SSK-174 (Bonus)', icon: Users },
  { path: 'payments', label: 'Payments', title: 'Payment Management', description: 'Keep track of invoices, partial payments, and outstanding balances.', issues: 'SSK-163 · SSK-164 · SSK-168 · SSK-169', icon: CreditCard },
  { path: 'maintenance', label: 'Maintenance', title: 'Maintenance Management', description: 'Manage supplies, low-stock alerts, and upcoming maintenance.', issues: 'SSK-171 · SSK-173 (Bonus)', icon: Wrench },
  { path: 'contracts', label: 'Contracts', title: 'Contract Management', description: 'Manage resident agreements, lease periods, and their attached documents.', issues: 'Phase 1 · SSK-172 document links', icon: FileText },
  { path: 'appliances', label: 'Appliance Rental', title: 'Appliance Rental', description: 'Manage rental requests, appliance availability, and monthly rental fees.', issues: 'Phase 1 · Phase 2 billing', icon: Refrigerator },
  { path: 'utilities', label: 'Utilities', title: 'Water & Electricity', description: 'Import monthly readings and understand usage across your apartment.', issues: 'SSK-166 · SSK-167', icon: Droplets },
  { path: 'reports', label: 'Reports', title: 'Summary Reports', description: 'A clear view of charges, collections, and outstanding balances.', issues: 'SSK-170', icon: ChartNoAxesCombined },
  { path: 'documents', label: 'Documents', title: 'Document Library', description: 'Keep contracts, maintenance reports, and receipts together.', issues: 'SSK-161 · SSK-172 · SSK-175 (Bonus)', icon: FolderOpen },
  { path: 'settings', label: 'Settings', title: 'Profile Settings', description: 'Manage your personal profile and your team’s access in one place.', issues: 'SSK-176 (Bonus)', icon: Settings },
]

const sampleProfile = { fullName: 'Waity S.', email: 'manager@example.com', phone: '080-000-1234' }

/** SSK-177: one restrained direction, using the existing theme. In-memory design review only. */
export default function Phase2Preview() {
  const { section = 'dashboard' } = useParams()
  const current = pages.find(p => p.path === section) ?? pages[0]
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState('')
  const [reset, setReset] = useState(0)
  const [profile, setProfile] = useState(sampleProfile)
  const [contracts, setContracts] = useState(initialContracts)
  const [documents, setDocuments] = useState(initialDocuments)
  const [catalog, setCatalog] = useState(initialCatalog)
  const [rentals, setRentals] = useState(initialRentals)
  function notify(message: string) { setToast(message) }
  if (section === 'permissions') return <Navigate to="/phase2-preview/settings?tab=team" replace />
  return <div className="p2-app">
    <a className="p2-skip" href="#p2-main">Skip to content</a>
    {menu && <button className="p2-menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`p2-sidebar ${menu ? 'is-open' : ''}`}>
      <div className="p2-brand"><span>Sakura Soul</span><small>Admin Management</small><button className="p2-mobile icon-button" onClick={() => setMenu(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <nav aria-label="Apartment management">{pages.filter(p => p.path !== 'settings').map(p => <NavLink key={p.path} to={`/phase2-preview/${p.path}`} className={p.path === current.path ? 'active' : ''} onClick={() => { setMenu(false); setToast('') }}><p.icon size={21} aria-hidden="true" />{p.label}</NavLink>)}</nav>
      <div className="p2-sidebar-bottom"><NavLink to="/phase2-preview/settings" aria-label="Profile settings" className={({ isActive }) => `p2-profile-link${isActive ? ' active' : ''}`} onClick={() => { setMenu(false); setToast('') }}><div className="p2-avatar">{profile.fullName.split(/\s+/).map(part => part[0]).slice(0,2).join('')}</div><div><strong>{profile.fullName}</strong><small>Manager · Profile settings</small></div><Settings size={18} aria-hidden="true" /></NavLink></div>
    </aside>
    <div className="p2-workspace">
      <header className="p2-review-bar"><button className="p2-mobile icon-button" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={21} /></button><span><strong>Phase 2 design preview</strong><span className="p2-review-detail"> · Sample data · Local UI only</span></span><button className="p2-reset" onClick={() => { setReset(v => v + 1); setProfile(sampleProfile); setContracts(initialContracts); setDocuments(initialDocuments); setCatalog(initialCatalog); setRentals(initialRentals); setToast('Preview data reset.') }}><RotateCcw size={15} aria-hidden="true" />Reset</button></header>
      <main id="p2-main" className="p2-main">
        <div className="p2-breadcrumb">Sakura Soul <ChevronRight size={14} aria-hidden="true" /> {current.label}<span className="p2-issue">{current.issues}</span></div>
        <div className="p2-page-header"><PageHeader title={current.title} description={current.description} /></div>
        <div key={reset} className="p2-content">
          {current.path === 'dashboard' && <DashboardDesign contracts={contracts} />}
          {current.path === 'units' && <UnitsDesign notify={notify} />}
          {current.path === 'payments' && <PaymentsDesign rentals={rentals} catalog={catalog} contracts={contracts} notify={notify} />}
          {current.path === 'utilities' && <UtilitiesDesign notify={notify} />}
          {current.path === 'reports' && <ReportsDesign notify={notify} />}
          {current.path === 'maintenance' && <MaintenanceDesign notify={notify} />}
          {current.path === 'documents' && <DocumentsDesign docs={documents} setDocs={setDocuments} notify={notify} />}
          {current.path === 'contracts' && <ContractsDesign contracts={contracts} setContracts={setContracts} documents={documents} notify={notify} />}
          {current.path === 'appliances' && <AppliancesDesign rentals={rentals} setRentals={setRentals} catalog={catalog} setCatalog={setCatalog} notify={notify} />}
          {current.path === 'tenants' && <PeopleDesign permissions={false} notify={notify} />}
          {current.path === 'settings' && <SettingsDesign profile={profile} onProfileChange={setProfile} notify={notify} />}
        </div>
        <footer className="p2-review-footer"><span>SSK-177 / Design review · All amounts in THB</span><a href="https://wishza2549.atlassian.net/browse/SSK-177" target="_blank" rel="noreferrer">View Jira <ArrowUpRight size={14} aria-hidden="true" /></a></footer>
      </main>
      {toast && <div className="p2-toast" role="status"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={18} /></button></div>}
    </div>
  </div>
}
