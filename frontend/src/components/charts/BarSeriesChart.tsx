import { niceCeiling } from '../../domain/usage'
import { CHART_FILL, type ChartColor } from './chartColors'

const WIDTH = 880
const HEIGHT = 275
const LEFT = 55
const RIGHT = 825
const TOP = 50
const BOTTOM = 220

/**
 * กราฟแท่งด้วย SVG ทำมือ (SSK-181) ใช้กับผลรวมรายปี
 *
 * - null คือไม่มีข้อมูล ไม่วาดแท่ง แต่เขียน "No data" ไว้ที่ฐาน ไม่ให้ดูเหมือนใช้ศูนย์
 * - flagged[i] วาดแท่งจางลง ใช้บอกปีที่ข้อมูลไม่เต็มปี เหตุผลอยู่ใน notes[i] ซึ่งต่อท้าย <title>
 */
export function BarSeriesChart({
  categories,
  values,
  unit,
  label,
  color,
  flagged,
  notes,
  formatValue = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }),
}: {
  categories: string[]
  values: (number | null)[]
  unit: string
  label: string
  color: ChartColor
  flagged?: boolean[]
  notes?: (string | null)[]
  formatValue?: (value: number) => string
}) {
  const niceMax = niceCeiling(Math.max(1, ...values.filter((v): v is number => v !== null)))
  const slot = (RIGHT - LEFT) / Math.max(1, categories.length)
  const barWidth = Math.min(80, slot * 0.6)
  const center = (i: number) => LEFT + slot * i + slot / 2
  const height = (v: number) => (v / niceMax) * (BOTTOM - TOP)

  return (
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
      {values.map((value, i) => {
        const note = notes?.[i]
        if (value === null) {
          return (
            <text key={categories[i]} x={center(i)} y={BOTTOM - 6} textAnchor="middle" className="fill-ink-muted">
              No data
            </text>
          )
        }
        const h = height(value)
        return (
          <g key={categories[i]}>
            <rect
              x={center(i) - barWidth / 2}
              y={BOTTOM - h}
              width={barWidth}
              height={h}
              rx={3}
              className={`${CHART_FILL[color]} ${flagged?.[i] ? 'opacity-45' : ''}`}
            >
              <title>{`${categories[i]}: ${formatValue(value)} ${unit}${note ? ` (${note})` : ''}`}</title>
            </rect>
            <text x={center(i)} y={BOTTOM - h - 6} textAnchor="middle" className="fill-ink-muted">
              {formatValue(value)}
            </text>
          </g>
        )
      })}
      {categories.map((category, i) => (
        <text key={category} x={center(i)} y={252} textAnchor="middle" className="fill-ink-muted">
          {category}
        </text>
      ))}
    </svg>
  )
}
