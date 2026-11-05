import { useEffect, useId, useRef, useState, type ReactNode, type FocusEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { X, Info } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { DataTable } from '../components/DataTable'
export { PrimaryButton, SecondaryButton }

/** One accessible icon control for all preview table actions. Tooltip escapes table clipping. */
export function RowAction({ label, children, to, onClick, disabled, primary = false }: { label: string; children: ReactNode; to?: string; onClick?: () => void; disabled?: boolean; primary?: boolean }) {
  const id = useId()
  const [position, setPosition] = useState<{left: number; top: number} | null>(null)
  function show(event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    setPosition({left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2)), top: rect.top >= 48 ? rect.top - 8 : rect.bottom + 40})
  }
  useEffect(() => {
    if (!position) return
    const hide = () => setPosition(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide) }
  }, [position])
  const props = { className: `p2-row-action${primary ? ' p2-row-action-primary' : ''}`, 'aria-label': label, 'aria-describedby': position ? id : undefined, onMouseEnter: show, onMouseLeave: () => setPosition(null), onFocus: show, onBlur: () => setPosition(null), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Escape') setPosition(null) }, onClick: () => { setPosition(null); onClick?.() } }
  return <>{to ? <Link {...props} to={to}><span aria-hidden="true">{children}</span></Link> : <button {...props} type="button" disabled={disabled}><span aria-hidden="true">{children}</span></button>}{position && createPortal(<span id={id} role="tooltip" className="p2-action-tooltip" style={position}>{label}</span>, document.body)}</>
}

export function Card({ title, description, actions, children }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="p2-card">{(title || actions) && <header className="p2-card-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions}</header>}{children}</section>
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'rose' }) {
  return <span className={`p2-badge p2-${tone}`}>{children}</span>
}
export function Note({ children }: { children: ReactNode }) {
  return <div className="p2-note"><Info size={18} aria-hidden="true" /><p>{children}</p></div>
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="p2-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o}>{o}</option>)}</select></Field>
}
export function Tabs({ options, active, onChange }: { options: string[]; active: string; onChange: (v: string) => void }) {
  return <div className="p2-tabs" aria-label="View options">{options.map(t => <button type="button" key={t} aria-pressed={t === active} onClick={() => onChange(t)}>{t}</button>)}</div>
}
export function Table({ headers, rows, caption }: { headers: string[]; rows: ReactNode[][]; caption?: string }) {
  return <div>{caption && <p className="p2-table-caption">{caption}</p>}<DataTable columns={headers.map((h, i) => ({ key: `${i}-${h}`, header: h, headerClass: /^(ACTIONS?|FILES)$/.test(h) ? 'p2-action-cell' : '', cellClass: /^(ACTIONS?|FILES)$/.test(h) ? 'p2-action-cell' : '', cell: (row: ReactNode[]) => row[i] }))} rows={rows} rowKey={row => rows.indexOf(row)} minWidth={600} headCellClass="p2-th" cellClass="p2-td" rowClass="p2-tr" empty={<p>No matching records.</p>} emptyCellClass="p2-empty" /></div>
}
export function Stats({ items }: { items: { label: string; value: string; hint: string; icon: ReactNode }[] }) {
  return <div className="p2-stats">{items.map(i => <div className="p2-stat" key={i.label}><span className="p2-stat-icon">{i.icon}</span><p>{i.label}</p><strong>{i.value}</strong><small>{i.hint}</small></div>)}</div>
}
export function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  return createPortal(<dialog ref={ref} className="p2-dialog" aria-label={title} onCancel={onClose}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={22} /></button></header><div className="p2-dialog-body">{children}</div></dialog>, document.body)
}
export function Actions({ onCancel, label = 'Save preview' }: { onCancel: () => void; label?: string }) {
  return <footer className="p2-actions"><SecondaryButton onClick={onCancel}>Cancel</SecondaryButton><PrimaryButton type="submit">{label}</PrimaryButton></footer>
}
