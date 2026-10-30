import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package, TriangleAlert, ClipboardList, Plus, Search, FileText, Upload, Eye, ScanText, ShieldCheck, CalendarDays, Wrench } from 'lucide-react'
import { Card, Badge, Note, Field, Select, Table, Stats, Dialog, Actions, Tabs, PrimaryButton, SecondaryButton } from './shared'
import { nameDistance } from './model'
import { previewRoomNumbers, type PreviewDocument as Doc } from './phase1Data'
import { MaintenanceCalendar, MaintenanceWorkDesign } from './MaintenanceWorkDesign'

const initialSupplies = [
  { name: 'LED Bulbs 60W', sku: 'EL-001', category: 'Electrical', stock: 45, min: 20, max: 100 },
  { name: 'Air Filters 16×20×1', sku: 'HV-042', category: 'HVAC', stock: 8, min: 20, max: 80 },
  { name: 'Copper Pipe Fittings', sku: 'PL-018', category: 'Plumbing', stock: 30, min: 10, max: 60 },
  { name: 'Door Lock Sets', sku: 'HW-006', category: 'Hardware', stock: 3, min: 5, max: 20 },
]
export function MaintenanceDesign({ notify, view }: { notify: (s: string) => void; view: string }) {
  const [supplies, setSupplies] = useState(initialSupplies)
  const [low, setLow] = useState(false)
  const [search, setSearch] = useState('')
  const [restock, setRestock] = useState('')
  const [quantity, setQuantity] = useState('10')
  const [tasks, setTasks] = useState<string[]>([])
  const selected = supplies.find(s => s.sku === restock)
  const lowSupplies = supplies.filter(s => s.stock < s.min)
  return <>
    <div hidden={view !== 'tasks' && view !== 'log'} className="p2-section-body"><MaintenanceWorkDesign view={view} notify={notify} /></div>
    {view === 'supplies' ? <>
      <Stats items={[{label:'SUPPLY ITEMS',value:String(supplies.length),hint:'Across 4 categories',icon:<Package />},{label:'LOW STOCK ALERTS',value:String(lowSupplies.length),hint:'Below configured minimum stock',icon:<TriangleAlert />},{label:'TOTAL STOCK',value:String(supplies.reduce((n,s) => n+s.stock,0)),hint:'Sample pieces currently available',icon:<ClipboardList />}]} />
      {!!lowSupplies.length && <div className="p2-alert"><TriangleAlert size={21} aria-hidden="true" /><div><strong>{lowSupplies.length} items need restocking</strong><p>{lowSupplies.map(s => s.name).join(' · ')}</p></div><button className="p2-link" onClick={() => setLow(true)}>View low stock</button></div>}
      <Card title="Current Inventory" actions={<label className="p2-check"><input type="checkbox" checked={low} onChange={e => setLow(e.target.checked)} />Low stock only</label>}><div className="p2-filter-row"><label className="p2-search"><Search size={18} aria-hidden="true" /><input aria-label="Search supplies" placeholder="Search item or SKU" value={search} onChange={e => setSearch(e.target.value)} /></label></div><Table headers={['ITEM / SKU','CATEGORY','CURRENT STOCK','MIN / MAX','STATUS','ACTION']} rows={supplies.filter(s => (!low || s.stock < s.min) && `${s.name} ${s.sku}`.toLowerCase().includes(search.toLowerCase())).map(s => [<div><strong>{s.name}</strong><small className="p2-sub">{s.sku}</small></div>,s.category,s.stock,`${s.min} / ${s.max}`,<Badge tone={s.stock < s.min ? 'amber' : 'green'}>{s.stock < s.min ? 'Low stock' : 'In stock'}</Badge>,<button className="p2-link" onClick={() => { setRestock(s.sku); setQuantity(String(Math.min(s.max - s.stock, s.min))) }}><Plus size={17} />Restock</button>])} /></Card>
    </> : view === 'schedule' ? <>
      <MaintenanceCalendar />
      <Note>Bonus · Offline rule-based forecast: last completed service + service interval. Suggested dates require review before a task is created.</Note>
      <Stats items={[{label:'DUE SOON',value:'2 assets',hint:'Within the next 14 days',icon:<CalendarDays />},{label:'DRAFT TASKS',value:String(tasks.length),hint:'Created in preview memory',icon:<ClipboardList />},{label:'FORECAST METHOD',value:'Service cycle',hint:'No AI or external service',icon:<Wrench />}]} />
      <Card title="Suggested maintenance" description="Reference date: 30 Oct 2026 · Based on service history"><Table headers={['ASSET / UNIT','LAST COMPLETED','INTERVAL','SUGGESTED DATE','STATUS','ACTION']} rows={[['Air conditioner · 101','09 Aug 2026','90 days','07 Nov 2026'],['Water pump · Common area','15 Aug 2026','90 days','13 Nov 2026']].map(r => [...r,<Badge tone={tasks.includes(r[0]) ? 'green' : 'amber'}>{tasks.includes(r[0]) ? 'Draft created' : 'Due soon'}</Badge>,<SecondaryButton disabled={tasks.includes(r[0])} onClick={() => { setTasks(prev => [...prev,r[0]]); notify(`Draft maintenance task created for ${r[0]} in preview.`) }}>Create draft task</SecondaryButton>])} /></Card>
    </> : null}
    {selected && <Dialog title="Restock supply" subtitle={`${selected.name} · ${selected.sku}`} onClose={() => setRestock('')}><form onSubmit={e => { e.preventDefault(); setSupplies(prev => prev.map(s => s.sku === selected.sku ? { ...s, stock: s.stock + Number(quantity) } : s)); setRestock(''); notify('Sample inventory updated. Low-stock status recalculated.') }}><div className="p2-summary"><span>Current stock / maximum</span><strong>{selected.stock} / {selected.max}</strong></div><Field label="Quantity to add"><input type="number" min="1" max={selected.max - selected.stock} step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /></Field><p className="p2-card-foot">Stock after restock: {selected.stock + Number(quantity || 0)} pieces</p><Actions onCancel={() => setRestock('')} label="Confirm restock" /></form></Dialog>}
  </>
}

function UploadedFile({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return file.type === 'application/pdf' ? <iframe title={file.name} src={url} className="p2-file-frame" /> : <img src={url} alt={`Uploaded document: ${file.name}`} className="p2-document-image" />
}
export function DocumentsDesign({ docs, setDocs, notify, scope }: { docs: Doc[]; setDocs: Dispatch<SetStateAction<Doc[]>>; notify: (s: string) => void; scope?: 'Contract' | 'Maintenance report' | 'Receipt' }) {
  const [params] = useSearchParams()
  const initialType = ['Contract','Maintenance report','Receipt'].find(type => type === params.get('type'))
  const [category, setCategory] = useState(scope ?? initialType ?? 'All documents')
  const [search, setSearch] = useState(params.get('unit') ?? '')
  const [dialog, setDialog] = useState(params.get('upload') === '1' ? 'upload' : '')
  const [viewing, setViewing] = useState<Doc | null>(null)
  const [file, setFile] = useState<File | undefined>()
  const [type, setType] = useState<string>(scope ?? initialType ?? 'Contract')
  const [unit, setUnit] = useState(params.get('unit') ?? '101')
  const [ocr, setOcr] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const filtered = docs.filter(d => (category === 'All documents' || d.category === category) && `${d.name} ${d.unit} ${d.tenant} ${d.date}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <>
    <div className="p2-toolbar">{!scope ? <Tabs options={['All documents','Contract','Maintenance report','Receipt']} active={category} onChange={setCategory} /> : <p className="p2-design-note">{scope === 'Contract' ? 'Scanned agreements and supporting contract files' : scope === 'Receipt' ? 'Scanned receipts and payment documents' : 'Service reports and supporting maintenance files'}</p>}<PrimaryButton onClick={() => { setDialog('upload'); setOcr(false); setFile(undefined); setError('') }}><Upload size={18} />Upload document</PrimaryButton></div>
    {!scope && <Stats items={[{label:'STORED DOCUMENTS',value:String(docs.length),hint:'Linked to units and tenants',icon:<FolderIcon />},{label:'CONTRACTS',value:String(docs.filter(d => d.category === 'Contract').length),hint:'Scanned and uploaded copies',icon:<FileText />},{label:'LOCAL OCR',value:'Review first',hint:'Bonus flow · sample extraction only',icon:<ScanText />}]} />}
    <Card title={scope === 'Contract' ? 'Contract documents' : scope === 'Receipt' ? 'Receipts & payment documents' : scope === 'Maintenance report' ? 'Maintenance documents' : 'Stored documents'} description="Search by filename, unit, tenant or date."><div className="p2-filter-row"><label className="p2-search"><Search size={18} aria-hidden="true" /><input aria-label="Search documents" placeholder="Search filename, unit, tenant or date" value={search} onChange={e => setSearch(e.target.value)} /></label></div><Table headers={['DOCUMENT','TYPE','UNIT / TENANT','ADDED','ACTION']} rows={filtered.map(d => [<span className="p2-inline"><FileText size={19} />{d.name}</span>,<Badge>{d.category}</Badge>,<div>{d.unit}<small className="p2-sub">{d.tenant}</small></div>,d.date,<button className="p2-link" onClick={() => setViewing(d)}><Eye size={17} />View</button>])} /><p className="p2-card-foot">PDF, JPG, PNG · Maximum 10 MB per file · Preview files stay in browser memory.</p></Card>
    {viewing && <Dialog title={viewing.name} subtitle={`${viewing.category} · Unit ${viewing.unit}`} onClose={() => setViewing(null)}>{viewing.file ? <UploadedFile file={viewing.file} /> : <div className="p2-sample-paper"><FileText size={36} /><h3>{viewing.category}</h3><p>Sakura Soul Apartment</p><hr /><p>Unit {viewing.unit} · {viewing.tenant}</p><p>{viewing.date}</p><Note>Sample document representation. Upload your own file to test the real document viewer.</Note></div>}<div className="p2-actions"><SecondaryButton onClick={() => setViewing(null)}>Close</SecondaryButton></div></Dialog>}
    {dialog === 'upload' && <Dialog title="Upload document" subtitle="SSK-161 · SSK-172 · Optional local OCR flow (SSK-175)" onClose={() => setDialog('')}><form onSubmit={e => { e.preventDefault(); if (!file) { setError('Choose a PDF, JPG or PNG file first.'); return } setDocs(prev => [...prev,{id:Math.max(...prev.map(d => d.id))+1,name:file.name,category:type,unit,tenant:unit === '101' ? 'Kant S.' : unit === '102' ? 'Mali P.' : unit === '201' ? 'Narin K.' : unit === '202' ? 'Pim W.' : '—',date:'30 Oct 2026',file}]); setDialog(''); notify('Document added to this preview only. No upload was sent to a server.') }}><Field label="Document file" hint="PDF, JPG or PNG · Up to 10 MB"><input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => { const f = e.target.files?.[0]; setError(''); setFile(undefined); if (f && (f.size > 10 * 1024 * 1024 || !['application/pdf','image/png','image/jpeg'].includes(f.type))) { setError('Choose a PDF, JPG or PNG file no larger than 10 MB.'); return } setFile(f) }} /></Field>{error && <p className="p2-error" role="alert">{error}</p>}<div className="p2-form-grid p2-pad-y"><>{scope ? <Field label="Document type"><input readOnly value={scope} /></Field> : <Select label="Document type" value={type} onChange={setType} options={['Contract','Maintenance report','Receipt']} />}</><Select label="Linked unit" value={unit} onChange={setUnit} options={previewRoomNumbers} /></div>
      {type === 'Contract' && <div className="p2-ocr"><div className="p2-toolbar"><div><strong>Auto-fill tenant details</strong><p>Local OCR · Bonus design</p></div><SecondaryButton onClick={() => { setOcr(true); setName('Kant Srisuk') }}><ScanText size={17} />Preview sample extraction</SecondaryButton></div><small>This button uses sample text, not the contents of your document. OCR is not connected.</small>{ocr && <div className="p2-pad-y"><Badge tone="amber">Needs manual review</Badge><div className="p2-form-grid p2-pad-y"><Field label="Tenant name"><input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="National ID" hint="Example masked for review"><input placeholder="Verify from original document" /></Field><Field label="Phone number"><input placeholder="Check extracted digits" /></Field><Field label="Lease start"><input type="date" defaultValue="2026-11-01" /></Field></div><p>Extracted details are a draft. Confirm every field before creating a tenant in the final system.</p></div>}</div>}
      <Actions onCancel={() => setDialog('')} label="Add to preview library" /></form></Dialog>}
  </>
}
function FolderIcon() { return <FileText /> }

const defaultAccess = [[true,true,true],[true,false,true],[true,false,true],[true,true,false],[true,true,false],[true,true,true],[true,false,false]]
const capabilities = ['View unit & tenant details','Manage invoices & payments','View financial reports','Manage maintenance tasks','Restock supplies','View linked documents','Manage team & roles']
export function PeopleDesign({ permissions, notify }: { permissions: boolean; notify: (s: string) => void }) {
  const [query, setQuery] = useState('')
  const [fuzzy, setFuzzy] = useState(true)
  const [role, setRole] = useState('Manager')
  const [access, setAccess] = useState(defaultAccess)
  const [assigned, setAssigned] = useState('Accountant')
  const people = [{name:'Kant Srisuk',room:'101',phone:'xxx-xxx-4101'},{name:'Mali Prasert',room:'102',phone:'xxx-xxx-4102'},{name:'Narin K.',room:'201',phone:'xxx-xxx-4201'}]
  const q = query.toLowerCase().trim()
  const matching = people.filter(p => p.name.toLowerCase().includes(q) || p.room.includes(q) || (fuzzy && q.length >= 3 && nameDistance(q,p.name.toLowerCase().split(' ')[0]) <= 1))
  if (!permissions) return <>
    <Card><div className="p2-filter-row"><label className="p2-search"><Search size={18} aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search tenants" placeholder="Try kant, kart, krant, or a unit number" /></label><label className="p2-check"><input type="checkbox" checked={fuzzy} onChange={e => setFuzzy(e.target.checked)} />Include similar names</label></div>{q && <p className="p2-table-caption">{matching.length} results for “{query}”{fuzzy ? ' · Exact and similar matches' : ' · Exact text only'}</p>}<Table headers={['TENANT','UNIT','PHONE','MATCH']} rows={matching.map(p => [<strong>{p.name}</strong>,p.room,p.phone,<Badge tone={p.name.toLowerCase().includes(q) || p.room.includes(q) ? 'green' : 'amber'}>{p.name.toLowerCase().includes(q) || p.room.includes(q) ? 'Exact' : 'Similar name'}</Badge>])} /></Card><Note>SSK-174 · Offline edit-distance matching. “kart” and “krant” both find “Kant”. Similar results are labeled so admins can verify the correct person.</Note>
  </>
  return <>
    <div className="p2-toolbar"><Badge>Bonus · RBAC design</Badge><Select label="Preview as role" value={role} onChange={setRole} options={['Manager','Maintenance Staff','Accountant']} /></div>
    <Note>{role === 'Manager' ? 'Managers can manage role assignments. Review the permission matrix before saving.' : `Viewing as ${role}. Role configuration is read-only. Switch back to Manager to edit.`} This is a UI simulation; backend authorization is not implemented.</Note>
    <Card title="Team members" description="Role assignments apply to the selected team member."><Table headers={['TEAM MEMBER','ROLE','STATUS']} rows={[[<span className="p2-inline"><ShieldCheck size={19} />Waity S.</span>,<Badge>Manager</Badge>,<Badge tone="green">Active</Badge>],['Nok T.',<select aria-label="Role for Nok T." disabled={role !== 'Manager'} value={assigned} onChange={e => setAssigned(e.target.value)}><option>Accountant</option><option>Maintenance Staff</option></select>,<Badge tone="green">Active</Badge>]]} /></Card>
    <Card title="Permission matrix" description="Check permissions by responsibility. Documents are limited to those linked to permitted work."><Table headers={['PERMISSION','MANAGER','MAINTENANCE STAFF','ACCOUNTANT']} rows={capabilities.map((c,i) => [c,...['Manager','Maintenance Staff','Accountant'].map((r,j) => <input type="checkbox" aria-label={`${r}: ${c}`} checked={access[i][j]} disabled={role !== 'Manager' || j === 0} onChange={e => setAccess(prev => prev.map((row,k) => k === i ? row.map((v,l) => l === j ? e.target.checked : v) : row))} />)])} /><div className="p2-pad p2-button-row"><SecondaryButton disabled={role !== 'Manager'} onClick={() => setAccess(defaultAccess)}>Reset permissions</SecondaryButton><PrimaryButton disabled={role !== 'Manager'} onClick={() => notify('Role assignments and permissions saved in this preview only. No account access was changed.')}>Save permissions</PrimaryButton></div></Card>
  </>
}
