/**
 * สีของเส้นและแท่งในกราฟ มาจาก token --color-chart-1..5 ใน index.css (SSK-181)
 * เขียนชื่อ class เต็มไว้ตรงนี้ เพราะ Tailwind หา class จากข้อความในซอร์ส ต่อสตริงเอาตอนรันจะไม่ได้ class
 */
export type ChartColor = 1 | 2 | 3 | 4 | 5

export const CHART_STROKE: Record<ChartColor, string> = {
  1: 'stroke-chart-1',
  2: 'stroke-chart-2',
  3: 'stroke-chart-3',
  4: 'stroke-chart-4',
  5: 'stroke-chart-5',
}

export const CHART_FILL: Record<ChartColor, string> = {
  1: 'fill-chart-1',
  2: 'fill-chart-2',
  3: 'fill-chart-3',
  4: 'fill-chart-4',
  5: 'fill-chart-5',
}

export const CHART_SWATCH: Record<ChartColor, string> = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
}

/** สีของเส้นที่ i วนกลับเมื่อเกินห้าเส้น */
export function chartColor(index: number): ChartColor {
  return ((index % 5) + 1) as ChartColor
}
