import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { continuousRuns } from './chartMath'
import { LineSeriesChart } from './LineSeriesChart'
import { BarSeriesChart } from './BarSeriesChart'

/**
 * SSK-181: กราฟ SVG ของภาพรวมทั้งตึก จุดที่ไม่มีข้อมูลต้องเป็นช่องว่าง ไม่ลากลงศูนย์
 * ตัวเลขของแต่ละจุดอยู่ใน <title> ของจุดนั้น จึงอ่านจาก DOM ตรง ๆ
 */
function pointTitles(container: HTMLElement, selector: string): string[] {
  return [...container.querySelectorAll(`${selector} > title`)].map((t) => t.textContent ?? '')
}

describe('continuousRuns', () => {
  it('splits the positions that have a value into runs at every null', () => {
    expect(continuousRuns([1, 2, null, 4, null, null, 7, 8])).toEqual([[0, 1], [3], [6, 7]])
  })

  it('has no runs when every value is missing', () => {
    expect(continuousRuns([null, null])).toEqual([])
  })
})

describe('LineSeriesChart', () => {
  it('breaks the line at a month without data instead of drawing it down to zero', () => {
    const { container } = render(
      <LineSeriesChart
        categories={['Jan 26', 'Feb 26', 'Mar 26', 'Apr 26']}
        series={[{ name: 'Electricity', values: [100, null, 120, 130], color: 3 }]}
        unit="kWh"
        label="Electricity usage for the whole building"
      />,
    )
    expect(screen.getByRole('img', { name: 'Electricity usage for the whole building' })).toBeInTheDocument()
    // Jan stands alone, so only Mar-Apr is joined by a line; Feb has no point at all
    const lines = container.querySelectorAll('polyline')
    expect(lines).toHaveLength(1)
    expect(lines[0].getAttribute('points')?.split(' ')).toHaveLength(2)
    expect(pointTitles(container, 'circle')).toEqual(['Jan 26: 100 kWh', 'Mar 26: 120 kWh', 'Apr 26: 130 kWh'])
  })

  it('draws a flagged month as a hollow dashed point and explains why in its tooltip', () => {
    const { container } = render(
      <LineSeriesChart
        categories={['Jan 26', 'Feb 26']}
        series={[{ name: 'Water', values: [20, 18], color: 2 }]}
        unit="m³"
        label="Water usage"
        flagged={[false, true]}
        notes={[null, '17 of 18 occupied units have data']}
      />,
    )
    const [full, partial] = [...container.querySelectorAll('circle')]
    expect(full).toHaveClass('fill-chart-2')
    expect(full).not.toHaveAttribute('stroke-dasharray')
    expect(partial).toHaveClass('fill-white')
    expect(partial).toHaveAttribute('stroke-dasharray', '2 2')
    expect(pointTitles(container, 'circle')).toEqual(['Jan 26: 20 m³', 'Feb 26: 18 m³ (17 of 18 occupied units have data)'])
  })

  it('scales the axis to the highest value of every line and names each line in a legend', () => {
    const { container } = render(
      <LineSeriesChart
        categories={['Jan', 'Feb']}
        series={[
          { name: '2025', values: [40, 50], color: 1 },
          { name: '2026', values: [120, 130], color: 2 },
        ]}
        unit="kWh"
        label="Electricity usage by year"
      />,
    )
    // niceCeiling(130) = 160 ทั้งที่เส้นแรกสูงสุดแค่ 50
    const axis = [...container.querySelectorAll('svg text')].map((t) => t.textContent)
    expect(axis).toContain('160')
    expect(axis).not.toContain('60')
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['2025', '2026'])
    expect(pointTitles(container, 'circle')).toEqual([
      '2025 Jan: 40 kWh',
      '2025 Feb: 50 kWh',
      '2026 Jan: 120 kWh',
      '2026 Feb: 130 kWh',
    ])
  })

  it('has no legend for a single line', () => {
    render(<LineSeriesChart categories={['Jan']} series={[{ name: 'Water', values: [5], color: 2 }]} unit="m³" label="Water usage" />)
    expect(screen.queryByRole('list', { name: 'Legend' })).not.toBeInTheDocument()
  })
})

describe('BarSeriesChart', () => {
  it('draws a bar with its value for each year and writes "No data" for a year without data', () => {
    const { container } = render(
      <BarSeriesChart
        categories={['2024', '2025', '2026']}
        values={[null, 1234.5, 900]}
        unit="kWh"
        label="Electricity usage by year"
        color={3}
        flagged={[false, false, true]}
        notes={[null, null, '10 of 12 months have data']}
        formatValue={(v) => v.toLocaleString('en-US')}
      />,
    )
    const bars = [...container.querySelectorAll('rect')]
    expect(bars).toHaveLength(2)
    expect(pointTitles(container, 'rect')).toEqual(['2025: 1,234.5 kWh', '2026: 900 kWh (10 of 12 months have data)'])
    expect(bars[0]).not.toHaveClass('opacity-45')
    expect(bars[1]).toHaveClass('opacity-45')
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent)
    expect(labels).toContain('No data')
    expect(labels).toContain('1,234.5')
    // แท่งของปีที่มากกว่าต้องสูงกว่า
    expect(Number(bars[0].getAttribute('height'))).toBeGreaterThan(Number(bars[1].getAttribute('height')))
  })
})
