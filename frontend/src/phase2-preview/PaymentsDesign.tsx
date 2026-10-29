import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CatalogItem, RentalRequest } from '../domain/appliance'
import { Banknote, Clock3, CircleCheck, Plus, Printer, Settings2, Search, ArrowUpRight, Paperclip, QrCode } from 'lucide-react'
import { Card, Badge, Note, Field, Select, Table, Stats, Dialog, Actions, Tabs, PrimaryButton, SecondaryButton } from './shared'
import { money } from './model'
import { NextInvoiceDraft } from './NextInvoiceDraft'
import type { PreviewContract } from './phase1Data'

const initialBills = [
  { id: 'INV-2026-1101', room: '101', tenant: 'Kant S.', current: 5300, carry: 2000, interest: 20, paid: 3000 },
  { id: 'INV-2026-1102', room: '102', tenant: 'Mali P.', current: 5450, carry: 0, interest: 0, paid: 5450 },
  { id: 'INV-2026-1103', room: '201', tenant: 'Narin K.', current: 5610, carry: 0, interest: 0, paid: 0 },
  { id: 'INV-2026-1104', room: '202', tenant: 'Pim W.', current: 6200, carry: 1500, interest: 15, paid: 0 },
]
type Bill = typeof initialBills[number]
const total = (b: Bill) => b.current + b.carry + b.interest
const status = (b: Bill) => b.paid >= total(b) ? 'Paid' : b.paid > 0 ? 'Partially paid' : b.carry > 0 ? 'Overdue' : 'Pending'

export function PaymentsDesign({ notify, rentals, catalog, contracts }: { notify: (s: string) => void; rentals: RentalRequest[]; catalog: CatalogItem[]; contracts: PreviewContract[] }) {
  const [params] = useSearchParams()
  const [bills, setBills] = useState(initialBills)
  const [tab, setTab] = useState('Invoices')
  const [filter, setFilter] = useState('All statuses')
  const [search, setSearch] = useState(params.get('room') ?? '')
  const [selected, setSelected] = useState<string[]>([])
  const [dialog, setDialog] = useState(params.has('draft') ? 'draft' : '')
  const [billId, setBillId] = useState(initialBills[0].id)
  const [amount, setAmount] = useState('1000')
  const [method, setMethod] = useState('Bank transfer')
  const [date, setDate] = useState('2026-11-05')
  const [slip, setSlip] = useState('')
  const [interest, setInterest] = useState('1')
  const [interestEnabled, setInterestEnabled] = useState(true)
  const [bank, setBank] = useState('Kasikornbank')
  const [account, setAccount] = useState('xxx-x-12345-x')
  const [qr, setQr] = useState('')
  const [history, setHistory] = useState([{ id: 'RC-2026-1101', invoice: initialBills[0].id, room: '101', amount: 3000, date: '2026-11-03', method: 'Bank transfer', slip: 'transfer-101.jpg' }, { id: 'RC-2026-1102', invoice: initialBills[1].id, room: '102', amount: 5450, date: '2026-11-04', method: 'Cash', slip: '' }])
  const bill = bills.find(b => b.id === billId) ?? bills[0]
  const outstanding = total(bill) - bill.paid
  const rows = bills.filter(b => (filter === 'All statuses' || status(b) === filter) && `${b.tenant} ${b.room} ${b.id}`.toLowerCase().includes(search.toLowerCase()))
  const selectedReceipts = history.filter(h => selected.includes(h.invoice))
  function openPayment(b: Bill) { setBillId(b.id); setAmount(String(Math.min(1000, total(b) - b.paid))); setSlip(''); setDialog('payment') }
  return <>
    <Stats items={[
      { label: 'COLLECTED THIS MONTH', value: money(bills.reduce((n,b) => n + b.paid, 0)), hint: `${history.length} payment records · November 2026`, icon: <Banknote /> },
      { label: 'OUTSTANDING BALANCE', value: money(bills.reduce((n,b) => n + total(b) - b.paid, 0)), hint: `${bills.filter(b => status(b) !== 'Paid').length} invoices awaiting payment`, icon: <Clock3 /> },
      { label: 'PAID IN FULL', value: `${bills.filter(b => status(b) === 'Paid').length} / ${bills.length}`, hint: 'Partial payments remain in the ledger', icon: <CircleCheck /> },
    ]} />
    <div className="p2-toolbar"><Tabs options={['Invoices', 'Payment history']} active={tab} onChange={setTab} /><div className="p2-button-row"><SecondaryButton onClick={() => setDialog('settings')}><Settings2 size={18} />Billing settings</SecondaryButton><PrimaryButton onClick={() => setDialog('draft')}><Plus size={18} />Next invoice draft</PrimaryButton></div></div>
    {tab === 'Invoices' ? <Card>
      <div className="p2-filter-row"><label className="p2-search"><Search size={18} aria-hidden="true" /><input aria-label="Search invoices" placeholder="Search by tenant, unit or invoice" value={search} onChange={e => setSearch(e.target.value)} /></label><Select label="Payment status" value={filter} onChange={setFilter} options={['All statuses', 'Paid', 'Partially paid', 'Pending', 'Overdue']} /></div>
      {selected.length > 0 && <div className="p2-selection"><span>{selected.length} invoices selected · {selectedReceipts.length} payment receipts</span><SecondaryButton disabled={!selectedReceipts.length} onClick={() => setDialog('print')}><Printer size={17} />Bulk print receipts</SecondaryButton></div>}
      <Table headers={['SELECT', 'TENANT / UNIT', 'TOTAL DUE', 'PAID', 'BALANCE', 'STATUS', 'ACTIONS']} rows={rows.map(b => [<input type="checkbox" aria-label={`Select invoice ${b.room}`} checked={selected.includes(b.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id))} />, <div><strong>{b.tenant}</strong><small className="p2-sub">Unit {b.room} · Nov 2026</small></div>, money(total(b)), money(b.paid), <strong>{money(total(b) - b.paid)}</strong>, <Badge tone={status(b) === 'Paid' ? 'green' : status(b) === 'Partially paid' ? 'amber' : status(b) === 'Overdue' ? 'rose' : 'neutral'}>{status(b)}</Badge>, <div className="p2-row-actions"><SecondaryButton onClick={() => { setBillId(b.id); setDialog('invoice') }} aria-label={`View invoice ${b.room}`}><ArrowUpRight size={16} aria-hidden="true" />View</SecondaryButton>{status(b) !== 'Paid' && <PrimaryButton onClick={() => openPayment(b)} aria-label={`Record payment for unit ${b.room}`}><Banknote size={16} aria-hidden="true" />Record payment</PrimaryButton>}</div>])} />
      <p className="p2-card-foot">Showing {rows.length} of {bills.length} sample invoices · Due 05 Nov 2026</p>
    </Card> : <Card title="Payment history" description="One receipt for each payment received. Original invoice balances remain traceable."><Table headers={['RECEIPT', 'UNIT / INVOICE', 'RECEIVED', 'AMOUNT', 'METHOD', 'PROOF']} rows={history.map(h => [h.id, <div>{h.room}<small className="p2-sub">{h.invoice}</small></div>, h.date, money(h.amount), h.method, h.slip ? <span className="p2-inline"><Paperclip size={15} />{h.slip}</span> : 'Not attached (optional)'])} /></Card>}
    <Note>Carried balances reference the original invoice. A payment is recorded once; carrying a debt forward must never create a second debt.</Note>
    {dialog === 'draft' && <NextInvoiceDraft room={params.get('draft') ?? '101'} rentals={rentals} catalog={catalog} contracts={contracts} onClose={() => setDialog('')} />}
    {dialog === 'invoice' && <Dialog title="Invoice details" subtitle={`${bill.id} · Unit ${bill.room} · November 2026`} onClose={() => setDialog('')}>
      <div className="p2-invoice"><header><div><h3>Sakura Soul Apartment</h3><p>Monthly invoice · {bill.tenant}</p></div><Badge tone={status(bill) === 'Paid' ? 'green' : 'amber'}>{status(bill)}</Badge></header>
        <div className="p2-ledger"><p><span>Current month charges</span><strong>{money(bill.current)}</strong></p>{bill.room === '101' && <small>Rent ฿4,500.00 · Water ฿180.00 · Electricity ฿620.00</small>}<p><span>Previous unpaid balance <small className="p2-sub">Linked to October invoice · no duplicate charge</small></span><strong>{money(bill.carry)}</strong></p><p><span>Late interest <small className="p2-sub">Snapshot: 1% × carried principal · one month</small></span><strong>{money(bill.interest)}</strong></p><p className="p2-total"><span>Total due</span><strong>{money(total(bill))}</strong></p><p><span>Payments received</span><strong>− {money(bill.paid)}</strong></p><p className="p2-total"><span>Remaining balance</span><strong>{money(outstanding)}</strong></p></div>
        <div className="p2-bank"><QrCode size={48} aria-hidden="true" /><div><strong>Bank transfer / PromptPay</strong><p>{bank} · {account}</p><small>Sakura Soul Apartment · Reference: {bill.id}</small><p className="p2-sub">{qr ? `QR file selected: ${qr} (preview only)` : 'Payment QR will appear here after configuration.'}</p></div></div>
      </div><div className="p2-actions"><SecondaryButton onClick={() => setDialog('')}>Close</SecondaryButton>{outstanding > 0 && <PrimaryButton onClick={() => openPayment(bill)}>Record payment</PrimaryButton>}</div>
    </Dialog>}
    {dialog === 'payment' && <Dialog title="Record payment" subtitle={`${bill.id} · Unit ${bill.room} · ${bill.tenant}`} onClose={() => setDialog('')}><form onSubmit={e => {
      e.preventDefault()
      const paid = Math.round(Number(amount) * 100) / 100
      if (!(paid > 0 && paid <= outstanding)) return
      setBills(prev => prev.map(b => b.id === bill.id ? { ...b, paid: Math.round((b.paid + paid) * 100) / 100 } : b))
      setHistory(prev => [...prev, { id: `RC-DEMO-${prev.length + 1}`, invoice: bill.id, room: bill.room, amount: paid, date, method, slip }])
      setDialog(''); notify(`Sample payment of ${money(paid)} recorded. Remaining: ${money(outstanding - paid)}.`)
    }}><div className="p2-summary"><span>Outstanding balance</span><strong>{money(outstanding)}</strong></div><div className="p2-form-grid"><Field label="Amount received (THB)" hint="A partial payment is allowed."><input type="number" min="0.01" max={outstanding} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></Field><Field label="Payment date"><input type="date" required value={date} onChange={e => setDate(e.target.value)} /></Field><Select label="Payment method" value={method} onChange={setMethod} options={['Bank transfer', 'Cash', 'PromptPay']} /><Field label="Payment proof (optional)"><input type="file" accept="image/*,application/pdf" onChange={e => setSlip(e.target.files?.[0]?.name ?? '')} /></Field></div><div className="p2-summary"><span>Balance after this payment</span><strong>{money(Math.max(0, outstanding - (Number(amount) || 0)))}</strong></div><Note>A receipt is created for the amount received, not the full invoice. Selected proof remains in this preview only.</Note><Actions onCancel={() => setDialog('')} label="Record payment" /></form></Dialog>}
    {dialog === 'settings' && <Dialog title="Billing settings" subtitle="SSK-164 · SSK-168" onClose={() => setDialog('')}><form onSubmit={e => { e.preventDefault(); setDialog(''); notify('Billing settings updated in the preview. Existing invoice snapshots stay unchanged.') }}><h3 className="p2-section-title">Carryover & late interest</h3><label className="p2-check"><input type="checkbox" checked={interestEnabled} onChange={e => setInterestEnabled(e.target.checked)} />Apply interest to overdue principal</label><div className="p2-form-grid"><Field label="Interest per month (%)"><input type="number" value={interest} onChange={e => setInterest(e.target.value)} min="0" max="100" step="0.01" disabled={!interestEnabled} required /></Field><Field label="Interest basis"><input value="Simple interest · principal only" readOnly /></Field></div><Note>Illustration: ฿2,000 overdue × {interestEnabled ? interest || '0' : '0'}% = {money(interestEnabled ? 2000 * (Number(interest) || 0) / 100 : 0)} for one month. Existing invoices keep their original interest. Interest calculation rules still need approval before backend implementation.</Note><h3 className="p2-section-title">Bank transfer details</h3><div className="p2-form-grid"><Field label="Bank name"><input required value={bank} onChange={e => setBank(e.target.value)} /></Field><Field label="Account number"><input required value={account} onChange={e => setAccount(e.target.value)} /></Field><Field label="Account holder"><input defaultValue="Sakura Soul Apartment" /></Field><Field label="Payment QR image (optional)"><input type="file" accept="image/png,image/jpeg" onChange={e => setQr(e.target.files?.[0]?.name ?? '')} /></Field></div><Actions onCancel={() => setDialog('')} /></form></Dialog>}
    {dialog === 'print' && <Dialog title="Bulk print receipts" subtitle="SSK-169 · Only payments actually received become receipts." onClose={() => setDialog('')}><div className="p2-print-content">{selectedReceipts.map(h => <article className="p2-invoice p2-print-receipt" key={h.id}><h3>Sakura Soul Apartment</h3><p>PAYMENT RECEIPT · {h.id}</p><div className="p2-ledger"><p><span>Unit / invoice</span><span>{h.room} / {h.invoice}</span></p><p><span>Received on</span><span>{h.date} · {h.method}</span></p><p className="p2-total"><span>Amount received</span><strong>{money(h.amount)}</strong></p></div></article>)}</div><div className="p2-actions"><SecondaryButton onClick={() => setDialog('')}>Close</SecondaryButton><PrimaryButton onClick={() => window.print()}><Printer size={18} />Print {selectedReceipts.length} receipts</PrimaryButton></div></Dialog>}
  </>
}
