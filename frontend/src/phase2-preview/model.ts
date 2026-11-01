export type UsageRow = { room: string; month: string; water: number; electricity: number }
export const sampleCsv = 'room,billing_month,water_m3,electricity_kwh\n101,2026-11,10,124\n102,2026-11,12,138\n201,2026-11,9,116\n'

/** Deliberately limited to the documented four-column import template. No server writes. */
export function parseUsageCsv(text: string): UsageRow[] {
  const records: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell.trim()); cell = ''
      if (c === '\n') { if (row.some(Boolean)) records.push(row); row = [] }
    } else cell += c
  }
  if (quoted) throw new Error('Unclosed quote in CSV. Check the selected file.')
  row.push(cell.trim()); if (row.some(Boolean)) records.push(row)
  if (records.shift()?.join(',') !== 'room,billing_month,water_m3,electricity_kwh') throw new Error('Use the four columns in the downloadable template, in the same order.')
  if (!records.length) throw new Error('The file contains no usage rows.')
  const seen = new Set<string>()
  return records.map((r, i) => {
    const line = i + 2
    if (r.length !== 4 || !['101', '102', '201', '202'].includes(r[0])) throw new Error(`Row ${line}: unknown room or incorrect column count. Sample rooms: 101, 102, 201, 202.`)
    if (!/^2026-(0[1-9]|1[0-2])$/.test(r[1])) throw new Error(`Row ${line}: billing month must be YYYY-MM within the sample year 2026.`)
    if (r.slice(2).some(v => !/^\d+(\.\d{1,2})?$/.test(v) || !Number.isFinite(Number(v)))) throw new Error(`Row ${line}: usage must be a non-negative number with at most two decimal places.`)
    const key = `${r[0]}-${r[1]}`
    if (seen.has(key)) throw new Error(`Row ${line}: duplicate room and billing month. Nothing has been imported.`)
    seen.add(key)
    return { room: r[0], month: r[1], water: Number(r[2]), electricity: Number(r[3]) }
  })
}

export function nameDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = next
  }
  return previous[b.length]
}
export { bahtAmount as money } from '../format'

export function download(name: string, content: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
