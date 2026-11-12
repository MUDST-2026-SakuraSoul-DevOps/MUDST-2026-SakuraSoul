import { niceCeiling } from '../../domain/usage'
import { CHART_FILL, CHART_STROKE, CHART_SWATCH, type ChartColor } from './chartColors'
import { continuousRuns } from './chartMath'

const WIDTH = 880
const HEIGHT = 275
const LEFT = 55
const RIGHT = 825
const TOP = 50
const BOTTOM = 220

export interface LineSeries {
  name: string
  /** หนึ่งค่าต่อหนึ่งช่องของแกน X null คือไม่มีข้อมูล เส้นจะขาดตรงนั้นแทนที่จะลงไปที่ 0 */
  values: (number | null)[]
  color: ChartColor
}

/**
 * กราฟเส้นหลายเส้นด้วย SVG ทำมือ (SSK-181) ต่อยอดจาก UsageChart ของ SSK-167 ซึ่งวาดได้เส้นเดียวและไม่เว้นช่อง
 * ยังไม่เพิ่มไลบรารีกราฟ เพราะวิชาห้ามโหลดจาก CDN และกราฟแบบนี้ไม่คุ้มกับขนาด bundle
 *
 * - ค่า null ทำให้เส้นขาด จุดที่อยู่โดด ๆ ยังเห็นเป็นวงกลม
 * - flagged[i] เป็นจุดกลวงเส้นประ ใช้บอกเดือนที่ข้อมูลไม่ครบ ข้อความใน <title> อธิบายว่าทำไม
 * - ชี้ที่จุดเห็นตัวเลขผ่าน <title> และมีตารางข้อมูลชุดเดียวกันใต้กราฟเสมอ
 */
export function LineSeriesChart({
  categories,
  series,
  unit,
  label,
  flagged,
  notes,
  formatValue = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }),
}: {
  categories: string[]
  series: LineSeries[]
  unit: string
  label: string
  flagged?: boolean[]
  /** ข้อความต่อท้าย <title> ของจุดที่ i เช่น "17 of 18 occupied units have readings" */
  notes?: (string | null)[]
  formatValue?: (value: number) => string
}) {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const niceMax = niceCeiling(Math.max(1, ...all))
  const x = (i: number) => (categories.length === 1 ? (LEFT + RIGHT) / 2 : LEFT + (i * (RIGHT - LEFT)) / (categories.length - 1))
  const y = (v: number) => BOTTOM - (v / niceMax) * (BOTTOM - TOP)
  // ป้ายแกน X ไม่เกิน 12 ป้าย ช่วงหลายปีจะได้ไม่ทับกัน
  const every = Math.max(1, Math.ceil(categories.length / 12))

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={label}
        className="min-h-[200px] w-full font-sans text-xs max-md:min-w-[600px]"
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const gy = TOP + i * ((BOTTOM - TOP) / 4)
          return (
            <g key={i}>
              <line x1={LEFT} x2={RIGHT} y1={gy} y2={gy} className="stroke-row-border" />
              <text x={LEFT - 13} y={gy + 4} textAnchor="end" className="fill-ink-muted">
                {Math.round(niceMax * (1 - i / 4))}
              </text>
            </g>
          )
        })}
        <text x={LEFT - 13} y={TOP - 20} textAnchor="end" className="fill-ink-muted">
          {unit}
        </text>
        {series.map((s) =>
          continuousRuns(s.values)
            .filter((run) => run.length > 1)
            .map((run) => (
              <polyline
                key={`${s.name}-${run[0]}`}
                data-series={s.name}
                fill="none"
                className={CHART_STROKE[s.color]}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={run.map((i) => `${x(i)},${y(s.values[i] as number)}`).join(' ')}
              />
            )),
        )}
        {series.map((s) =>
          s.values.map((value, i) => {
            if (value === null) return null
            const hollow = flagged?.[i] ?? false
            const note = notes?.[i]
            const name = series.length > 1 ? `${s.name} ` : ''
            return (
              <circle
                key={`${s.name}-${categories[i]}`}
                data-series={s.name}
                cx={x(i)}
                cy={y(value)}
                r={4}
                className={`${hollow ? 'fill-white' : CHART_FILL[s.color]} ${CHART_STROKE[s.color]}`}
                strokeWidth={2}
                strokeDasharray={hollow ? '2 2' : undefined}
              >
                <title>{`${name}${categories[i]}: ${formatValue(value)} ${unit}${note ? ` (${note})` : ''}`}</title>
              </circle>
            )
          }),
        )}
        {categories.map((category, i) =>
          i % every === 0 || i === categories.length - 1 ? (
            <text key={category} x={x(i)} y={252} textAnchor="middle" className="fill-ink-muted">
              {category}
            </text>
          ) : null,
        )}
      </svg>
      {series.length > 1 && (
        <ul aria-label="Legend" className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs text-ink-muted">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span aria-hidden="true" className={`inline-block h-1 w-5 rounded ${CHART_SWATCH[s.color]}`} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}
