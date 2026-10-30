export const sectionViews: Record<string, { value: string; label: string; compactLabel?: string }[]> = {
  units: [{value:'rooms',label:'All units'},{value:'rates',label:'Rate history'},{value:'charges',label:'Extra charges'},{value:'utilities',label:'Water & Electricity'}],
  payments: [{value:'invoices',label:'Invoices'},{value:'history',label:'Payment history'},{value:'reports',label:'Summary reports'},{value:'documents',label:'Receipts & slips'}],
  maintenance: [{value:'tasks',label:'Maintenance Tasks',compactLabel:'Tasks'},{value:'supplies',label:'Supplies & Inventory',compactLabel:'Supplies'},{value:'schedule',label:'Schedule & Reminder',compactLabel:'Schedule'},{value:'log',label:'Maintenance Log',compactLabel:'Log'},{value:'documents',label:'Documents',compactLabel:'Files'}],
  contracts: [{value:'agreements',label:'Lease agreements'},{value:'documents',label:'Contract documents'}],
}

export function activeSectionView(section: string, params: URLSearchParams) {
  const items = sectionViews[section]
  return items?.find(i => i.value === params.get('view'))?.value ?? (section === 'units' && params.has('room') ? 'rates' : items?.[0]?.value ?? '')
}

export function sectionUrl(section: string, view: string, params: URLSearchParams) {
  const query = new URLSearchParams(params)
  query.set('view', view)
  query.delete('upload')
  query.delete('draft')
  return `/phase2-preview/${section}?${query}`
}

/** Retain old review links while giving each feature one canonical home. */
export function legacyPreviewUrl(section: string, search: string): string | null {
  const params = new URLSearchParams(search)
  let target: string
  let view: string
  if (section === 'utilities') { target = 'units'; view = 'utilities' }
  else if (section === 'reports') { target = 'payments'; view = 'reports' }
  else if (section === 'permissions') { target = 'settings'; view = ''; params.set('tab','team') }
  else return null
  if (view) params.set('view',view)
  return `/phase2-preview/${target}?${params}`
}
