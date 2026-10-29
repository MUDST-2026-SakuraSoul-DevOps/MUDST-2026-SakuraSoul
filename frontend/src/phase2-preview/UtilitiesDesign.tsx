import { useState } from 'react'
import { Droplets, Zap, Upload, Download, FileSpreadsheet, CheckCircle2, Banknote, Wallet, Clock3 } from 'lucide-react'
import { Card, Badge, Note, Field, Select, Table, Stats, Dialog, Tabs, PrimaryButton, SecondaryButton } from './shared'
import { money, download, parseUsageCsv, sampleCsv, type UsageRow } from './model'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const water = [9, 10, 13, 12, 11, 9, 10, 12, 11, 10, 10, 11]
const electricity = [110, 118, 140, 152, 145, 130, 126, 128, 122, 124, 124, 118]

export function UtilitiesDesign({ notify }: { notify: (s: string) => void }) {
  const [utility, setUtility] = useState('Water')
  const [period, setPeriod] = useState('Monthly')
  const [group, setGroup] = useState('Room')
  const [unit, setUnit] = useState('101')
  const [dialog, setDialog] = useState(false)
  const [step, setStep] = useState(1)
  const [fileName, setFileName] = useState('')
  const [csv, setCsv] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<UsageRow[]>([])
  const [imported, setImported] = useState<UsageRow[]>([])
  const factors: Record<string, number> = { '101': 1, '102': 1.2, '201': 0.9, '202': 0.95 }
  const roomNumbers = group === 'Floor' ? Object.keys(factors).filter(r => r.startsWith(unit)) : [unit]
  const factor = roomNumbers.reduce((sum,r) => sum + factors[r],0)
  const base = utility === 'Water' ? water : electricity
  const values = period === 'Monthly' ? base.map((v,i) => {
    const month = `2026-${String(i + 1).padStart(2, '0')}`
    return Math.round(roomNumbers.reduce((sum,room) => {
      const update = imported.find(r => r.month === month && r.room === room)
      return sum + (update ? utility === 'Water' ? update.water : update.electricity : v * factors[room])
    },0))
  }) : [base.reduce((a,b) => a + b,0) * factor * 0.88, base.reduce((a,b) => a + b,0) * factor * 0.94, base.reduce((a,b) => a + b,0) * factor].map(Math.round)
  const labels = period === 'Monthly' ? months : ['2024', '2025', '2026']
  const unitLabel = utility === 'Water' ? 'm³' : 'kWh'
  const maximum = Math.max(...values, 1)
  const points = values.map((v,i) => `${55 + i * 770 / (values.length - 1)},${220 - v / maximum * 170}`).join(' ')
  async function loadFile(file?: File) {
    if (!file) return
    setError(''); setFileName(file.name)
    if (file.size > 2 * 1024 * 1024) { setError('Choose a CSV smaller than 2 MB.'); setCsv(''); return }
    try { setCsv(await file.text()) } catch { setError('Could not read the selected file. Please choose it again.') }
  }
  return <>
    <div className="p2-toolbar"><Tabs options={['Water', 'Electricity']} active={utility} onChange={setUtility} /><PrimaryButton onClick={() => { setDialog(true); setStep(1); setError('') }}><Upload size={18} />Import usage CSV</PrimaryButton></div>
    <div className="p2-filters"><Select label="View" value={group} onChange={v => { setGroup(v); setUnit(v === 'Floor' ? '1' : '101') }} options={['Room', 'Floor']} /><Select label={group === 'Room' ? 'Unit' : 'Floor'} value={unit} onChange={setUnit} options={group === 'Room' ? ['101', '102', '201', '202'] : ['1','2']} /><Select label="Period" value={period} onChange={setPeriod} options={['Monthly', 'Yearly']} /><Field label={period === 'Monthly' ? 'Year' : 'Year range'}><input readOnly value={period === 'Monthly' ? '2026' : '2024–2026'} /></Field></div>
    <Stats items={[{ label: `${utility.toUpperCase()} USAGE`, value: `${values.reduce((n,v) => n + v,0).toLocaleString()} ${unitLabel}`, hint: `${group} ${unit} · ${period === 'Monthly' ? '2026' : '2024–2026'}`, icon: utility === 'Water' ? <Droplets /> : <Zap /> }, { label: 'MONTHLY AVERAGE', value: `${Math.round(values.reduce((n,v) => n + v,0) / (period === 'Monthly' ? 12 : 36))} ${unitLabel}`, hint: 'Based on the displayed sample period', icon: <FileSpreadsheet /> }, { label: 'LATEST IMPORT', value: imported.length ? `${imported.length} rows` : 'No imports', hint: 'Import a sample CSV to preview the flow', icon: <Upload /> }]} />
    <Card title={`${utility} consumption`} description={`${group} ${unit} · ${period === 'Monthly' ? 'January–December 2026' : '2024–2026'} · ${unitLabel}`} actions={<SecondaryButton onClick={() => download('usage-preview.csv', `period,${utility.toLowerCase()}_${unitLabel}\n${labels.map((l,i) => `${l},${values[i]}`).join('\n')}`)}><Download size={17} />Export CSV</SecondaryButton>}>
      <div className="p2-chart"><svg viewBox="0 0 880 275" role="img" aria-label={`${utility} consumption for ${group.toLowerCase()} ${unit}. Values are listed in the table below.`}>
        {[0,1,2,3,4].map(i => <g key={i}><line x1="55" x2="825" y1={50 + i * 42.5} y2={50 + i * 42.5} className="p2-gridline" /><text x="42" y={55 + i * 42.5} textAnchor="end">{Math.round(maximum * (1 - i / 4))}</text></g>)}
        <polyline points={points} className="p2-chart-line" />{values.map((v,i) => <g key={labels[i]}><circle cx={55 + i * 770 / (values.length - 1)} cy={220 - v / maximum * 170} r="4" className="p2-chart-dot"><title>{labels[i]}: {v} {unitLabel}</title></circle><text x={55 + i * 770 / (values.length - 1)} y="252" textAnchor="middle">{labels[i]}</text></g>)}
      </svg></div><details className="p2-details"><summary>View usage data table</summary><Table headers={['PERIOD', `${utility.toUpperCase()} (${unitLabel})`]} rows={labels.map((l,i) => [l, values[i]])} /></details>
    </Card>
    <Note>Water and electricity use separate charts and units. Floor totals include the two sampled rooms per floor. Imported rows update the relevant room/month; yearly sample history is a separate illustration.</Note>
    {dialog && <Dialog title="Import water & electricity usage" subtitle="SSK-166 · Monthly consumption, not cumulative meter readings." onClose={() => setDialog(false)}>
      <ol className="p2-steps"><li className={step === 1 ? 'active' : ''}>1. Select file</li><li className={step === 2 ? 'active' : ''}>2. Review rows</li><li className={step === 3 ? 'active' : ''}>3. Complete</li></ol>
      {step === 1 && <><Note>One row per room and billing month. Water in m³, electricity in kWh. Download the template for the exact column format.</Note><div className="p2-button-row p2-pad-y"><SecondaryButton onClick={() => download('utility-template.csv', sampleCsv)}><Download size={17} />Download template</SecondaryButton><SecondaryButton onClick={() => { setCsv(sampleCsv); setFileName('sample-usage.csv'); setError('') }}>Use sample file</SecondaryButton></div><Field label="Choose CSV file" hint="CSV up to 2 MB. Preview uses rooms 101, 102, 201, 202 and year 2026."><input type="file" accept=".csv,text/csv" onChange={e => void loadFile(e.target.files?.[0])} /></Field>{fileName && <p className="p2-file-selected"><FileSpreadsheet size={18} />{fileName}</p>}<div className="p2-actions"><SecondaryButton onClick={() => setDialog(false)}>Cancel</SecondaryButton><PrimaryButton disabled={!csv || !!error} onClick={() => { try { setPreview(parseUsageCsv(csv)); setStep(2); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Invalid CSV.') } }}>Review rows</PrimaryButton></div></>}
      {error && <p role="alert" className="p2-error">{error}</p>}
      {step === 2 && <><Badge tone="green">{preview.length} valid rows · No rows saved yet</Badge><Table headers={['ROOM', 'BILLING MONTH', 'WATER (m³)', 'ELECTRICITY (kWh)']} rows={preview.map(r => [r.room,r.month,r.water,r.electricity])} /><Note>Existing preview values for the same room/month will be replaced. Issued invoices remain unchanged.</Note><div className="p2-actions"><SecondaryButton onClick={() => setStep(1)}>Back</SecondaryButton><PrimaryButton onClick={() => { setImported(prev => [...prev.filter(r => !preview.some(p => p.room === r.room && p.month === r.month)), ...preview]); setStep(3); notify('Usage rows imported into preview memory only.') }}>Import {preview.length} rows</PrimaryButton></div></>}
      {step === 3 && <div className="p2-complete"><CheckCircle2 size={40} /><h3>Import preview complete</h3><p>{preview.length} usage rows are ready to review in the chart. Nothing was sent to the server.</p><PrimaryButton onClick={() => setDialog(false)}>View usage</PrimaryButton></div>}
    </Dialog>}
  </>
}

const reportRows = [
  { unit: '101', tenant: 'Kant S.', month: 'Nov 2026', charges: 5300, collected: 3000, balance: 4320 },
  { unit: '102', tenant: 'Mali P.', month: 'Nov 2026', charges: 5450, collected: 5450, balance: 0 },
  { unit: '201', tenant: 'Narin K.', month: 'Nov 2026', charges: 5610, collected: 0, balance: 5610 },
  { unit: '202', tenant: 'Pim W.', month: 'Nov 2026', charges: 6200, collected: 0, balance: 7715 },
  { unit: '101', tenant: 'Kant S.', month: 'Oct 2026', charges: 4900, collected: 2900, balance: 2000 },
]
export function ReportsDesign({ notify }: { notify: (s: string) => void }) {
  const [group, setGroup] = useState('Unit')
  const [month, setMonth] = useState('Nov 2026')
  const [unit, setUnit] = useState('All units')
  const [tenant, setTenant] = useState('All tenants')
  const filtered = reportRows.filter(r => (month === 'All months' || r.month === month) && (unit === 'All units' || r.unit === unit) && (tenant === 'All tenants' || r.tenant === tenant))
  const grouped = new Map<string, { charges: number; collected: number; balance: number }>()
  filtered.forEach(r => { const key = group === 'Month' ? r.month : group === 'Tenant' ? r.tenant : r.unit; const old = grouped.get(key) ?? { charges:0,collected:0,balance:0 }; grouped.set(key, { charges:old.charges+r.charges,collected:old.collected+r.collected,balance:old.balance+r.balance }) })
  const rows = [...grouped]
  return <>
    <div className="p2-toolbar"><Tabs options={['Unit', 'Tenant', 'Month']} active={group} onChange={setGroup} /><SecondaryButton onClick={() => { download('summary-report-preview.csv', `${group},current_charges,collections,closing_balance\n${rows.map(([k,v]) => `${k},${v.charges},${v.collected},${month === 'All months' && group !== 'Month' ? '' : v.balance}`).join('\n')}`); notify('Sample report exported with the current filters.') }}><Download size={17} />Export report</SecondaryButton></div>
    <div className="p2-filters"><Select label="Billing period" value={month} onChange={setMonth} options={['Nov 2026','Oct 2026','All months']} /><Select label="Unit" value={unit} onChange={setUnit} options={['All units','101','102','201','202']} /><Select label="Tenant" value={tenant} onChange={setTenant} options={['All tenants','Kant S.','Mali P.','Narin K.','Pim W.']} /></div>
    <Stats items={[{label:'CURRENT CHARGES', value:money(filtered.reduce((n,r) => n+r.charges,0)),hint:'New charges within the selected period',icon:<Banknote />},{label:'PAYMENTS RECEIVED',value:money(filtered.reduce((n,r) => n+r.collected,0)),hint:'Cash and bank transfer collections',icon:<Wallet />},{label:'CLOSING BALANCE',value:month === 'All months' ? 'By period below' : money(filtered.reduce((n,r) => n+r.balance,0)),hint:'Includes prior balances and interest',icon:<Clock3 />}]} />
    <Card title={`Summary by ${group.toLowerCase()}`} description={`${month} · ${unit} · ${tenant}`}><Table headers={[group.toUpperCase(),'CURRENT CHARGES','COLLECTED','CLOSING BALANCE']} rows={rows.map(([k,v]) => [<strong>{k}</strong>,money(v.charges),money(v.collected),month === 'All months' && group !== 'Month' ? 'Select one month' : money(v.balance)])} /></Card><Note>Closing balances are snapshots, not amounts to add across months. Current charges exclude prior debt so carried balances do not count as new revenue. The sample report is independent of edits on the Payments preview.</Note>
  </>
}
