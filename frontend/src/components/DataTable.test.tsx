import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable } from './DataTable'

/**
 * ตารางกลางของ SSK-122 ทั้ง 6 หน้าเรียกใช้ตัวนี้ ถ้าพังจะพังพร้อมกันหมด
 * เทสจึงคุมสัญญาของคอมโพเนนต์ ไม่ใช่หน้าตาของหน้าใดหน้าหนึ่ง
 */

interface Row {
  id: number
  name: string
  amount: number
}

const rows: Row[] = [
  { id: 1, name: 'Yuki Tanaka', amount: 3500 },
  { id: 2, name: 'Kenji Sato', amount: 3800 },
]

function columns() {
  return [
    { key: 'name', header: 'NAME', cell: (row: Row) => row.name },
    {
      key: 'amount',
      header: 'AMOUNT',
      headerClass: 'text-right',
      cellClass: 'text-right',
      cell: (row: Row) => String(row.amount),
    },
  ]
}

function bodyRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

describe('DataTable', () => {
  it('วาดหัวคอลัมน์และแถวครบตามข้อมูลที่ส่งเข้าไป', () => {
    render(<DataTable rows={rows} rowKey={(row) => row.id} columns={columns()} />)

    expect(screen.getByRole('columnheader', { name: 'NAME' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'AMOUNT' })).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(2)
    expect(within(bodyRows()[0]).getByText('Yuki Tanaka')).toBeInTheDocument()
    expect(within(bodyRows()[1]).getByText('3800')).toBeInTheDocument()
  })

  it('คลาสของแต่ละหน้าถูกส่งต่อไปที่หัวตาราง แถว และช่อง', () => {
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns()}
        headCellClass="head-base"
        rowClass="row-base"
        cellClass="cell-base"
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'AMOUNT' })).toHaveClass('head-base', 'text-right')
    expect(bodyRows()[0]).toHaveClass('row-base')
    const cells = within(bodyRows()[0]).getAllByRole('cell')
    expect(cells[1]).toHaveClass('cell-base', 'text-right')
  })

  it('คลาสของแถวเปลี่ยนตามข้อมูลของแถวนั้นได้', () => {
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns()}
        rowClass={(row) => (row.amount > 3600 ? 'expensive' : 'cheap')}
      />,
    )

    expect(bodyRows()[0]).toHaveClass('cheap')
    expect(bodyRows()[1]).toHaveClass('expensive')
  })

  it('ไม่มีข้อมูลแล้วขึ้นข้อความแทน พาดครบทุกคอลัมน์', () => {
    render(<DataTable rows={[]} rowKey={(row: Row) => row.id} columns={columns()} empty="No data" />)

    const cell = screen.getByRole('cell', { name: 'No data' })
    expect(cell).toHaveAttribute('colspan', '2')
    expect(bodyRows()).toHaveLength(1)
  })

  it('ไม่ส่งข้อความว่างมา ตารางที่ไม่มีข้อมูลก็ไม่มีแถวเลย', () => {
    render(<DataTable rows={[]} rowKey={(row: Row) => row.id} columns={columns()} />)

    expect(bodyRows()).toHaveLength(0)
  })

  it('กดแถวแล้วเรียก onRowClick พร้อมข้อมูลของแถวนั้น', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(
      <DataTable rows={rows} rowKey={(row) => row.id} columns={columns()} onRowClick={onRowClick} />,
    )

    await user.click(bodyRows()[1])

    expect(onRowClick).toHaveBeenCalledWith(rows[1])
  })

  it('ความกว้างขั้นต่ำถูกตั้งเป็น px ตามที่ส่งมา ตารางกว้างเกินจอจึงเลื่อนแนวนอนได้', () => {
    render(<DataTable rows={rows} rowKey={(row) => row.id} columns={columns()} minWidth={820} />)

    expect(screen.getByRole('table')).toHaveStyle({ minWidth: '820px' })
  })
})
