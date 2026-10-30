import { useState } from 'react'
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Settings, ChevronRight, Menu, X, RotateCcw, ArrowUpRight } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { UnitsDesign } from './UnitsDesign'
import { PaymentsDesign } from './PaymentsDesign'
import { UtilitiesDesign, ReportsDesign } from './UtilitiesDesign'
import { DocumentsDesign, MaintenanceDesign, PeopleDesign } from './OperationsDesign'
import { SettingsDesign } from './SettingsDesign'
import { AppliancesDesign, ContractsDesign, DashboardDesign } from './Phase1Design'
import { initialCatalog, initialContracts, initialDocuments, initialRentals } from './phase1Data'
import { NAV_ITEMS } from '../layouts/nav'
import { Files } from '@phosphor-icons/react'
import { activeSectionView, documentTypes, legacyPreviewUrl, sectionUrl, sectionViews } from './navigation'
import './preview.css'

const pages = [
  { path: 'dashboard', label: 'Dashboard', title: 'Room Availability', description: 'An overview of your apartment, residents, and work that needs attention.', issues: 'Phase 1 · SSK-14 / SSK-15' },
  { path: 'units', label: 'Units', title: 'Unit Management', description: 'Manage room availability, effective rates, and room-specific charges.', issues: 'SSK-160 · SSK-162 · SSK-165 · SSK-166 · SSK-167' },
  { path: 'tenants', label: 'Tenants', title: 'Tenant Directory', description: 'Find tenants even when a name is not spelled exactly right.', issues: 'SSK-174 (Bonus)' },
  { path: 'payments', label: 'Payments', title: 'Payment Management', description: 'Keep track of invoices, partial payments, and outstanding balances.', issues: 'SSK-163 · SSK-164 · SSK-168 · SSK-169 · SSK-170' },
  { path: 'maintenance', label: 'Maintenance', title: 'Maintenance Management', description: 'Manage tasks, supplies, recurring reminders, and completed service records.', issues: 'SSK-171 · SSK-173 (Bonus)' },
  { path: 'contracts', label: 'Contracts', title: 'Contract Management', description: 'Manage resident agreements, lease periods, and their attached documents.', issues: 'Phase 1 · SSK-172 document links' },
  { path: 'appliances', label: 'Appliance Rental', title: 'Appliance Rental', description: 'Manage rental requests, appliance availability, and monthly rental fees.', issues: 'Phase 1 · Phase 2 billing' },
  { path: 'documents', label: 'Documents', title: 'Document Library', description: 'Find contracts, maintenance reports, and receipts across all units and tenants.', issues: 'SSK-161 · SSK-172 · SSK-175 (Bonus)' },
  { path: 'settings', label: 'Settings', title: 'Profile Settings', description: 'Manage your personal profile and your team’s access in one place.', issues: 'SSK-176 (Bonus)' },
]

const sampleProfile = { fullName: 'Waity S.', email: 'manager@example.com', phone: '080-000-1234' }
const previewNavItems = [...NAV_ITEMS, { path: '/documents', label: 'Documents', icon: Files }]

/** SSK-177: one restrained direction, using the existing theme. In-memory design review only. */
export default function Phase2Preview() {
  const { section = 'dashboard' } = useParams()
  const current = pages.find(p => p.path === section) ?? pages[0]
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const view = activeSectionView(section, params)
  const views = sectionViews[section] ?? []
  const viewLabel = views.find(i => i.value === view)?.label
  const legacy = legacyPreviewUrl(section, params.toString())
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState('')
  const [reset, setReset] = useState(0)
  const [profile, setProfile] = useState(sampleProfile)
  const [contracts, setContracts] = useState(initialContracts)
  const [documents, setDocuments] = useState(initialDocuments)
  const [catalog, setCatalog] = useState(initialCatalog)
  const [rentals, setRentals] = useState(initialRentals)
  function notify(message: string) { setToast(message) }
  if (legacy) return <Navigate to={legacy} replace />
  return <div className="p2-app">
    <a className="p2-skip" href="#p2-main">Skip to content</a>
    {menu && <button className="p2-menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`p2-sidebar ${menu ? 'is-open' : ''}`}>
      <div className="p2-brand"><span>Sakura Soul</span><small>Admin Management</small><button className="p2-mobile icon-button" onClick={() => setMenu(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <nav aria-label="Apartment management">{previewNavItems.map(p => { const path = p.path === '/' ? 'dashboard' : p.path.slice(1); const Icon = p.icon; return <NavLink key={path} to={`/phase2-preview/${path}`} className={path === current.path ? 'active' : ''} onClick={() => { setMenu(false); setToast('') }}><Icon size={21} aria-hidden="true" />{p.label}</NavLink> })}</nav>
      <div className="p2-sidebar-bottom"><NavLink to="/phase2-preview/settings" aria-label="Profile settings" className={({ isActive }) => `p2-profile-link${isActive ? ' active' : ''}`} onClick={() => { setMenu(false); setToast('') }}><div className="p2-avatar">{profile.fullName.split(/\s+/).map(part => part[0]).slice(0,2).join('')}</div><div><strong>{profile.fullName}</strong><small>Manager · Profile settings</small></div><Settings size={18} aria-hidden="true" /></NavLink></div>
    </aside>
    <div className="p2-workspace">
      <header className="p2-review-bar"><button className="p2-mobile icon-button" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={21} /></button><span><strong>Phase 2 design preview</strong><span className="p2-review-detail"> · Sample data · Local UI only</span></span><button className="p2-reset" onClick={() => { setReset(v => v + 1); setProfile(sampleProfile); setContracts(initialContracts); setDocuments(initialDocuments); setCatalog(initialCatalog); setRentals(initialRentals); setToast('Preview data reset.') }}><RotateCcw size={15} aria-hidden="true" />Reset</button></header>
      <main id="p2-main" className="p2-main">
        <div className="p2-breadcrumb">Sakura Soul <ChevronRight size={14} aria-hidden="true" /> {current.label}{viewLabel && <><ChevronRight size={14} aria-hidden="true" />{viewLabel}</>}<span className="p2-issue">{current.issues}</span></div>
        <div className="p2-page-header"><PageHeader title={current.title} description={current.description} actions={documentTypes[current.path] && <Link className="p2-nav-button" to={`/phase2-preview/documents?${new URLSearchParams({type:documentTypes[current.path]})}`}><Files size={18} aria-hidden="true" />View all documents</Link>} /></div>
        <div key={reset} className="p2-content">
          {!!views.length && <nav className="p2-tabs p2-section-tabs" aria-label={`${current.label} sections`}>{views.map(item => <Link key={item.value} to={sectionUrl(section,item.value,params)} aria-label={item.label} aria-current={view === item.value ? 'page' : undefined}>{item.compactLabel ? <><span className="p2-section-label-full">{item.label}</span><span className="p2-section-label-short">{item.compactLabel}</span></> : item.label}</Link>)}</nav>}
          {current.path === 'dashboard' && <DashboardDesign contracts={contracts} />}
          {current.path === 'units' && <><div hidden={view === 'utilities'} className="p2-section-body"><UnitsDesign view={view} onViewChange={next => navigate(sectionUrl(section,next,params))} notify={notify} /></div>{view === 'utilities' && <UtilitiesDesign notify={notify} />}</>}
          {current.path === 'payments' && <><div hidden={view === 'reports'} className="p2-section-body"><PaymentsDesign view={view} rentals={rentals} catalog={catalog} contracts={contracts} notify={notify} /></div>{view === 'reports' && <ReportsDesign notify={notify} />}</>}
          {current.path === 'maintenance' && <MaintenanceDesign view={view} notify={notify} />}
          {current.path === 'contracts' && <ContractsDesign contracts={contracts} setContracts={setContracts} documents={documents} notify={notify} />}
          {current.path === 'appliances' && <AppliancesDesign rentals={rentals} setRentals={setRentals} catalog={catalog} setCatalog={setCatalog} notify={notify} />}
          {current.path === 'tenants' && <PeopleDesign permissions={false} notify={notify} />}
          {current.path === 'documents' && <DocumentsDesign key={params.toString()} docs={documents} setDocs={setDocuments} notify={notify} />}
          {current.path === 'settings' && <SettingsDesign profile={profile} onProfileChange={setProfile} notify={notify} />}
        </div>
        <footer className="p2-review-footer"><span>SSK-177 / Design review · All amounts in THB</span><a href="https://wishza2549.atlassian.net/browse/SSK-177" target="_blank" rel="noreferrer">View Jira <ArrowUpRight size={14} aria-hidden="true" /></a></footer>
      </main>
      {toast && <div className="p2-toast" role="status"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={18} /></button></div>}
    </div>
  </div>
}
