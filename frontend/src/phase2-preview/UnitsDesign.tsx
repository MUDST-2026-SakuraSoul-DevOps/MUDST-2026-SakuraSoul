import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Layers3, CalendarDays, Plus, Settings2, History, Pencil } from 'lucide-react'
import { RowAction, Card, Badge, Note, Field, Select, Table, Stats, Dialog, Actions, PrimaryButton, SecondaryButton } from './shared'
import { money } from './model'
import { previewRoomNumbers } from './phase1Data'

const initialRooms = [
  { room: '101', floor: '1', type: 'Single', tenant: 'Kant S.', rent: 4500, state: 'Occupied' },
  { room: '102', floor: '1', type: 'Single', tenant: 'Mali P.', rent: 4700, state: 'Occupied' },
  { room: '103', floor: '1', type: 'Double', tenant: '—', rent: 5800, state: 'Available' },
  { room: '201', floor: '2', type: 'Single', tenant: 'Narin K.', rent: 4800, state: 'Occupied' },
]
export function UnitsDesign({ notify, view, onViewChange }: { notify: (s: string) => void; view: string; onViewChange: (view: string) => void }) {
  const [params] = useSearchParams()
  const tab = view === 'rates' ? 'Rate history' : view === 'charges' ? 'Extra charges' : 'All units'
  const setTab = (label: string) => onViewChange(label === 'Rate history' ? 'rates' : label === 'Extra charges' ? 'charges' : 'rooms')
  const [floor, setFloor] = useState('All floors')
  const [room, setRoom] = useState(params.get('room') ?? '101')
  const [floors, setFloors] = useState(2)
  const [perFloor, setPerFloor] = useState(12)
  const [draftFloors, setDraftFloors] = useState('2')
  const [draftRooms, setDraftRooms] = useState('12')
  const [dialog, setDialog] = useState('')
  const [rates, setRates] = useState([{ room: '101', date: '2026-11-01', rent: 4500, note: 'New monthly rate' }, { room: '101', date: '2026-01-01', rent: 4000, note: 'Original rate' }])
  const [charges, setCharges] = useState([{ room: '101', name: 'Parking space', amount: 300, cycle: 'Monthly' }])
  const [rate, setRate] = useState('4800')
  const [effective, setEffective] = useState('2026-12-01')
  const [charge, setCharge] = useState('')
  const [amount, setAmount] = useState('200')
  const [cycle, setCycle] = useState('One-time')
  const [reason, setReason] = useState('')
  return <>
    <div className="p2-toolbar"><span /><SecondaryButton onClick={() => { setDraftFloors(String(floors)); setDraftRooms(String(perFloor)); setDialog('config') }}><Settings2 size={18} />Apartment settings</SecondaryButton></div>
    <Stats items={[{ label: 'TOTAL UNITS', value: String(floors * perFloor), hint: `${perFloor} rooms per floor`, icon: <Building2 /> }, { label: 'FLOORS', value: String(floors), hint: 'Configurable apartment layout', icon: <Layers3 /> }, { label: 'NEXT RATE CHANGE', value: '01 Dec', hint: 'Scheduled rates keep old invoices intact', icon: <CalendarDays /> }]} />
    {tab === 'All units' && <Card title="All Units" description="Individual room rates · November 2026" actions={<Select label="Floor" value={floor} onChange={setFloor} options={['All floors', '1', '2']} />}>
      <Table headers={['UNIT', 'TYPE / TENANT', 'FLOOR', 'MONTHLY RENT', 'STATUS', 'ACTION']} rows={initialRooms.filter(r => floor === 'All floors' || r.floor === floor).map(r => [<strong>{r.room}</strong>, <div>{r.type}<small className="p2-sub">{r.tenant}</small></div>, r.floor, money(r.rent), <Badge tone={r.state === 'Occupied' ? 'rose' : 'green'}>{r.state}</Badge>, <RowAction label={`View rates for unit ${r.room}`} onClick={() => { setRoom(r.room); setTab('Rate history') }}><History /></RowAction>])} />
      <p className="p2-card-foot">Showing 4 sample units of {floors * perFloor}. Layout changes are previewed in settings.</p>
    </Card>}
    {tab === 'Rate history' && <>
      <div className="p2-toolbar"><Select label="Unit" value={room} onChange={setRoom} options={previewRoomNumbers} /><PrimaryButton onClick={() => setDialog('rate')}><Plus size={18} />Schedule rate</PrimaryButton></div>
      <Note>New rates apply from their effective date. Previously issued invoices keep the rates captured when they were created.</Note>
      <Card title={`Rate history · Unit ${room}`}><Table headers={['EFFECTIVE FROM', 'RENT / MONTH', 'WATER / m³', 'ELECTRICITY / kWh', 'NOTE']} rows={rates.filter(r => r.room === room).map(r => [r.date, money(r.rent), money(18), money(5), r.note])} />{!rates.some(r => r.room === room) && <p className="p2-empty">No rate changes in this sample. Schedule a rate to preview one.</p>}</Card>
      <div className="p2-split"><Card title="October invoice · Locked rates"><div className="p2-pad p2-ledger"><p><span>Unit 101 · October rent</span><strong>{money(4000)}</strong></p><p><span>Rate captured</span><span>01 Jan 2026</span></p><Badge tone="green">Historical invoice unchanged</Badge></div></Card><Card title="November invoice · Current rates"><div className="p2-pad p2-ledger"><p><span>Unit 101 · November rent</span><strong>{money(4500)}</strong></p><p><span>Rate effective from</span><span>01 Nov 2026</span></p><Badge>Separate invoice snapshot</Badge></div></Card></div>
    </>}
    {tab === 'Extra charges' && <Card title="Room-specific charges" description="Optional charges appear as separate invoice line items." actions={<PrimaryButton onClick={() => setDialog('charge')}><Plus size={18} />Add charge</PrimaryButton>}><Table headers={['UNIT', 'DESCRIPTION', 'AMOUNT', 'FREQUENCY', 'STATUS']} rows={charges.map(c => [c.room, c.name, money(c.amount), c.cycle, <Badge tone="green">Active</Badge>])} /></Card>}
    {dialog === 'config' && <Dialog title="Apartment settings" subtitle="SSK-160 · Configure the layout before adding rooms." onClose={() => setDialog('')}><form onSubmit={e => { e.preventDefault(); setFloors(Number(draftFloors)); setPerFloor(Number(draftRooms)); setDialog(''); notify(`Preview layout saved: ${draftFloors} floors, ${Number(draftFloors) * Number(draftRooms)} rooms. Existing rooms preserved.`) }}><div className="p2-form-grid"><Field label="Number of floors"><input type="number" min="1" max="50" required value={draftFloors} onChange={e => setDraftFloors(e.target.value)} /></Field><Field label="Rooms per floor"><input type="number" min="1" max="100" required value={draftRooms} onChange={e => setDraftRooms(e.target.value)} /></Field></div><div className="p2-summary"><strong>{Number(draftFloors) * Number(draftRooms)} units</strong><span>Room numbers: floor + two-digit room number</span></div><Note>Reducing the layout requires a separate review of occupied rooms and their history. This design never deletes existing rooms automatically.</Note><Actions onCancel={() => setDialog('')} label="Preview layout" /></form></Dialog>}
    {dialog === 'rate' && <Dialog title="Schedule room rate" subtitle="SSK-162 · Change future rates without editing past invoices." onClose={() => setDialog('')}><form onSubmit={e => { e.preventDefault(); setRates(prev => [{ room, date: effective, rent: Number(rate), note: reason || 'Scheduled rate' }, ...prev].sort((a,b) => b.date.localeCompare(a.date))); setDialog(''); notify(`Rate scheduled for unit ${room} from ${effective}.`) }}><div className="p2-form-grid"><Select label="Unit" value={room} onChange={setRoom} options={previewRoomNumbers} /><Field label="Effective from"><input type="date" min="2026-12-01" required value={effective} onChange={e => setEffective(e.target.value)} /></Field><Field label="Monthly rent (THB)"><input type="number" min="0" step="0.01" required value={rate} onChange={e => setRate(e.target.value)} /></Field><Field label="Reason / note"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Annual rate adjustment" /></Field><Field label="Water rate (THB / m³)"><input type="number" defaultValue="18" min="0" step="0.01" /></Field><Field label="Electricity rate (THB / kWh)"><input type="number" defaultValue="5" min="0" step="0.01" /></Field></div><Note>Illustrative rate form. This preview saves rent and the effective date; utility-rate persistence will be connected with the backend.</Note><Actions onCancel={() => setDialog('')} label="Schedule rate" /></form></Dialog>}
    {dialog === 'charge' && <Dialog title="Add extra charge" subtitle="SSK-165 · Add an optional line item to a room." onClose={() => setDialog('')}><form onSubmit={e => { e.preventDefault(); setCharges(prev => [...prev, { room, name: charge, amount: Number(amount), cycle }]); setDialog(''); notify('Extra charge added to the preview.') }}><div className="p2-form-grid"><Select label="Unit" value={room} onChange={setRoom} options={previewRoomNumbers} /><Select label="Frequency" value={cycle} onChange={setCycle} options={['One-time', 'Monthly']} /><Field label="Charge description"><input required value={charge} onChange={e => setCharge(e.target.value)} placeholder="e.g. Replacement key card" /></Field><Field label="Amount (THB)"><input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></Field></div><Actions onCancel={() => setDialog('')} label="Add charge" /></form></Dialog>}
    <p className="p2-design-note"><Pencil size={14} /> Design scope: layout configuration, effective rates, and optional charges.</p>
  </>
}
