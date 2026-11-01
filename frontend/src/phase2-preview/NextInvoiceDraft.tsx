import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogItem, RentalRequest } from '../domain/appliance'
import { rentalLinesForDraft, type PreviewContract } from './phase1Data'
import { Badge, Dialog, Field, Note, SecondaryButton, Select } from './shared'
import { money } from './model'

export function NextInvoiceDraft({ room, rentals, catalog, contracts, onClose }: {
  room: string; rentals: RentalRequest[]; catalog: CatalogItem[]; contracts: PreviewContract[]; onClose: () => void
}) {
  const [unit, setUnit] = useState(['101','102','201','202'].includes(room) ? room : '101')
  const [month, setMonth] = useState('2026-12')
  const [water, setWater] = useState('10')
  const [electricity, setElectricity] = useState('124')
  const lease = contracts.find(c => c.room === unit && c.start <= `${month}-01` && (!c.end || c.end >= `${month}-01`))
  const rentalLines = rentalLinesForDraft(rentals,unit,month)
  const usageValid = [water,electricity].every(v => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0)
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= '2026-12'
  const waterCharge = Math.round(Number(water) * 18 * 100) / 100
  const electricityCharge = Math.round(Number(electricity) * 5 * 100) / 100
  const subtotal = (lease?.rent ?? 0) + waterCharge + electricityCharge + rentalLines.reduce((n,r) => n+r.monthlyFee,0)

  return <Dialog title="Next invoice draft" subtitle="Review the next month's charges. Previously issued invoices remain unchanged." onClose={onClose}>
    <div className="p2-form-grid"><Select label="Unit" value={unit} onChange={setUnit} options={['101','102','201','202']} /><Field label="Billing month"><input type="month" min="2026-12" required value={month} onChange={e => setMonth(e.target.value)} /></Field><Field label="Water usage (m³)"><input type="number" min="0" step="0.01" required value={water} onChange={e => setWater(e.target.value)} /></Field><Field label="Electricity usage (kWh)"><input type="number" min="0" step="0.01" required value={electricity} onChange={e => setElectricity(e.target.value)} /></Field></div>
    {!monthValid || !usageValid ? <p className="p2-error" role="alert">Choose December 2026 or later and enter non-negative usage.</p> : !lease ? <p className="p2-error" role="alert">No lease covers this billing month. Review the agreement in Contracts before generating a bill.</p> : <div className="p2-invoice p2-pad-y p2-draft-invoice"><header><div><h3>Unit {unit} · {month}</h3><p>{lease.tenant}</p></div><Badge tone="amber">Draft only</Badge></header><div className="p2-ledger"><p><span>Monthly rent</span><strong>{money(lease.rent)}</strong></p><p><span>Water · {water} m³ × ฿18</span><strong>{money(waterCharge)}</strong></p><p><span>Electricity · {electricity} kWh × ฿5</span><strong>{money(electricityCharge)}</strong></p>{rentalLines.map(r => <p key={r.id}><span>Appliance rental · {catalog.find(c => c.sku === r.sku)?.name ?? r.sku}<small className="p2-sub">Rental #{r.id} · Agreed monthly fee</small></span><strong>{money(r.monthlyFee)}</strong></p>)}{!rentalLines.length && <small>No approved appliance rentals for this room/month.</small>}<p className="p2-total"><span>Current charges subtotal</span><strong>{money(subtotal)}</strong></p></div></div>}
    <Note>Preview uses full-month rental fees and sample utility rates. Deposits, prior debt, interest and other room charges are reviewed separately before issuance. No invoice is created by opening this draft.</Note>
    <div className="p2-actions"><SecondaryButton onClick={onClose}>Close draft</SecondaryButton><Link className="p2-nav-button" to="/phase2-preview/appliances">Manage appliance rentals</Link></div>
  </Dialog>
}
