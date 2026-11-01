import { useState } from 'react'
import { ClipboardList, Clock3, CircleCheck, Plus, Search, Paperclip, Upload, Pencil } from 'lucide-react'
import { RowAction, Actions, Badge, Card, Dialog, Field, PrimaryButton, Select, Stats, Table } from './shared'
import { money } from './model'
import { previewRoomNumbers } from './phase1Data'

const initialTickets = [
  {id:'MT-205',room:'205',issue:'Air conditioner not cooling',type:'HVAC',assignee:'Maintenance Staff',date:'2026-10-28',status:'In progress',cost:0},
  {id:'MT-201',room:'201',issue:'Leaking bathroom tap',type:'Plumbing',assignee:'Unassigned',date:'2026-10-30',status:'Open',cost:0},
  {id:'MT-101',room:'101',issue:'Air conditioner service',type:'HVAC',assignee:'Maintenance Staff',date:'2026-08-09',status:'Done',cost:1500},
]

export function MaintenanceWorkDesign({ view, notify }: { view: string; notify: (message: string) => void }) {
  const [tickets, setTickets] = useState(initialTickets)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<typeof initialTickets[number] | null>(null)
  const history = view === 'log'
  const rows = tickets.filter(t => (history ? t.status === 'Done' : t.status !== 'Done') && `${t.id} ${t.room} ${t.issue}`.toLowerCase().includes(search.toLowerCase()))
  return <>
    <Stats items={[{label:'OPEN REQUESTS',value:String(tickets.filter(t => t.status === 'Open').length),hint:'Awaiting assignment',icon:<ClipboardList />},{label:'IN PROGRESS',value:String(tickets.filter(t => t.status === 'In progress').length),hint:'Assigned maintenance work',icon:<Clock3 />},{label:'COMPLETED',value:String(tickets.filter(t => t.status === 'Done').length),hint:'Available in Maintenance Log',icon:<CircleCheck />}]} />
    <Card title={history ? 'Maintenance Log' : 'Maintenance Tasks'} description={history ? 'Completed work, recorded costs, and linked service documents.' : 'Create requests, assign staff, and track work status.'} actions={!history && <PrimaryButton onClick={() => setDraft({id:'',room:'101',issue:'',type:'General',assignee:'Unassigned',date:'2026-11-01',status:'Open',cost:0})}><Plus size={18} />Create task</PrimaryButton>}>
      <div className="p2-filter-row"><label className="p2-search"><Search size={18} aria-hidden="true" /><input aria-label="Search maintenance work" placeholder="Search task or room" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      <Table headers={['TASK / ISSUE','UNIT','ASSIGNED TO','DATE','STATUS','COST','ACTION']} rows={rows.map(t => [<div><strong>{t.issue}</strong><small className="p2-sub">{t.id} · {t.type}</small></div>,t.room,t.assignee,t.date,<Badge tone={t.status === 'Done' ? 'green' : 'amber'}>{t.status}</Badge>,money(t.cost),<div className="p2-inline-actions"><RowAction label={`View or update task ${t.id}`} onClick={() => setDraft({...t})}><Pencil /></RowAction><RowAction label={`Files for task ${t.id}`} to={`/phase2-preview/documents?type=Maintenance+report&unit=${t.room}`}><Paperclip /></RowAction><RowAction label={`Attach report for task ${t.id}`} to={`/phase2-preview/documents?type=Maintenance+report&unit=${t.room}&upload=1`}><Upload /></RowAction></div>])} />
    </Card>
    {draft && <Dialog title={draft.id ? 'Maintenance task' : 'Create maintenance task'} subtitle="Sample request · Changes stay within this preview." onClose={() => setDraft(null)}><form onSubmit={e => { e.preventDefault(); if (!draft.issue.trim()) return; const item = {...draft,id:draft.id || `MT-DEMO-${tickets.length+1}`,issue:draft.issue.trim()}; setTickets(prev => draft.id ? prev.map(t => t.id === draft.id ? item : t) : [...prev,item]); setDraft(null); notify(item.status === 'Done' ? 'Task completed. View its record in Maintenance Log.' : 'Maintenance task saved in the preview.') }}><div className="p2-form-grid"><Select label="Unit" value={draft.room} onChange={room => setDraft({...draft,room})} options={previewRoomNumbers} /><Select label="Type" value={draft.type} onChange={type => setDraft({...draft,type})} options={['General','HVAC','Plumbing','Electrical']} /><Field label="Issue description"><input required pattern=".*\S.*" value={draft.issue} onChange={e => setDraft({...draft,issue:e.target.value})} /></Field><Select label="Assigned to" value={draft.assignee} onChange={assignee => setDraft({...draft,assignee})} options={['Unassigned','Maintenance Staff']} /><Select label="Task status" value={draft.status} onChange={status => setDraft({...draft,status})} options={['Open','In progress','Done']} /><Field label="Recorded cost (THB)"><input type="number" required min="0" step="0.01" value={draft.cost} onChange={e => setDraft({...draft,cost:Number(e.target.value)})} /></Field></div><Actions onCancel={() => setDraft(null)} label="Save task" /></form></Dialog>}
  </>
}

export function MaintenanceCalendar() {
  return <Card title="Schedule & Reminder" description="November 2026 · Upcoming recurring service dates"><div className="p2-calendar-wrap"><table className="p2-calendar" aria-label="November 2026 maintenance calendar"><thead><tr>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead><tbody>{Array.from({length:5},(_,week) => <tr key={week}>{Array.from({length:7},(_,weekday) => {const day=week*7+weekday+1; return <td key={weekday}>{day <= 30 && <><span>{day}</span>{day === 7 && <small>AC service · 101</small>}{day === 13 && <small>Water pump service</small>}</>}</td>})}</tr>)}</tbody></table></div></Card>
}
