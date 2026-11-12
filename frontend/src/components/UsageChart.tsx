import type { UsagePoint } from '../api/types'
import { niceCeiling, periodLabel } from '../domain/usage'

const WIDTH = 880
const HEIGHT = 275
const LEFT = 55
const RIGHT = 825
const TOP = 50
const BOTTOM = 220

/**
 * กราฟเส้นการใช้น้ำไฟ (SSK-167) วาดด้วย SVG เองตามดีไซน์ SSK-177 ไม่เพิ่มไลบรารีกราฟ
 * เพราะโปรเจกต์ห้ามโหลดจาก CDN และกราฟเส้นเดียวไม่คุ้มกับ bundle ของ Recharts/Chart.js
 *
 * ชี้ที่จุดแล้วเห็นตัวเลขผ่าน <title> ของ SVG (tooltip ของเบราว์เซอร์ อ่านด้วย screen reader ได้)
 * ข้อมูลชุดเดียวกันมีตารางให้ดูใต้กราฟเสมอ
 */
export function UsageChart({ points, unit, label }: { points: UsagePoint[]; unit: string; label: string }) {
  const niceMax = niceCeiling(Math.max(1, ...points.map((p) => p.units)))
  const x = (i: number) => (points.length === 1 ? (LEFT + RIGHT) / 2 : LEFT + (i * (RIGHT - LEFT)) / (points.length - 1))
  const y = (v: number) => BOTTOM - (v / niceMax) * (BOTTOM - TOP)
  // ป้ายแกน X ไม่เกิน 12 ป้าย ช่วงยาวหลายปีจะได้ไม่ทับกัน
  const every = Math.max(1, Math.ceil(points.length / 12))

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
      <polyline
        fill="none"
        className="stroke-brand"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.map((p, i) => `${x(i)},${y(p.units)}`).join(' ')}
      />
      {points.map((p, i) => (
        <circle key={p.period} cx={x(i)} cy={y(p.units)} r={4} className="fill-white stroke-brand" strokeWidth={2}>
          <title>{`${periodLabel(p.period)}: ${p.units.toLocaleString('en-US')} ${unit}`}</title>
        </circle>
      ))}
      {points.map((p, i) =>
        i % every === 0 || i === points.length - 1 ? (
          <text key={p.period} x={x(i)} y={252} textAnchor="middle" className="fill-ink-muted">
            {periodLabel(p.period)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

