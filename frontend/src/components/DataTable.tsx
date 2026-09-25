import type { ReactNode } from 'react'

/**
 * ตารางกลางของทั้งแอป (SSK-122)
 *
 * เดิมทั้ง 6 หน้าเขียนโครง table, thead, tbody และ map แถวเองซ้ำกันหมด ต่างกัน
 * แค่รายชื่อคอลัมน์กับเนื้อในแต่ละช่อง ผลคือแก้เรื่องเดียวกันต้องไล่แก้ทุกหน้า
 * เช่นตอนเติมคลาสไม่ให้หัวคอลัมน์ตกบรรทัด
 *
 * ดีไซน์ของแต่ละหน้าไม่เหมือนกันจริง ๆ ทั้งระยะขอบ ขนาดตัวอักษร และเส้นคั่น
 * คอมโพเนนต์นี้จึงรับคลาสของแต่ละหน้าเข้ามาแทนที่จะบังคับหน้าตาเดียวกันทั้งแอป
 * สิ่งที่ได้คือโครงตารางที่เขียนที่เดียว ส่วนหน้าตายังเป็นของแต่ละหน้าเหมือนเดิม
 */

export interface DataTableColumn<T> {
  /** ใช้เป็น key ของ React และต้องไม่ซ้ำกันในตารางเดียว */
  key: string
  /** หัวคอลัมน์ ปล่อยว่างได้สำหรับคอลัมน์ปุ่มที่ดีไซน์ไม่มีหัว */
  header?: ReactNode
  /** เนื้อในช่องของแถวนั้น */
  cell: (row: T) => ReactNode
  /** คลาสเฉพาะของหัวคอลัมน์นี้ เช่นจัดชิดขวา */
  headerClass?: string
  /** คลาสเฉพาะของช่องในคอลัมน์นี้ */
  cellClass?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth,
  onRowClick,
  tableClass = '',
  headRowClass = '',
  headCellClass = '',
  rowClass,
  cellClass = '',
  bodyClass = '',
  empty,
  emptyCellClass = '',
}: {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** ความกว้างขั้นต่ำก่อนตารางจะเลื่อนแนวนอน เช่น 760 */
  minWidth?: number
  onRowClick?: (row: T) => void
  tableClass?: string
  headRowClass?: string
  headCellClass?: string
  /** รับเป็นฟังก์ชันได้ เพราะบางหน้าเปลี่ยนสีแถวตามข้อมูลของแถวนั้น */
  rowClass?: string | ((row: T) => string)
  cellClass?: string
  bodyClass?: string
  /** ข้อความเมื่อไม่มีแถวเลย วางเป็นแถวเดียวพาดทุกคอลัมน์ */
  empty?: ReactNode
  emptyCellClass?: string
}) {
  return (
    <table
      className={`w-full text-left ${tableClass}`}
      style={minWidth === undefined ? undefined : { minWidth: `${minWidth}px` }}
    >
      <thead>
        <tr className={headRowClass}>
          {columns.map((column) => (
            <th key={column.key} className={`${headCellClass} ${column.headerClass ?? ''}`}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className={bodyClass}>
        {empty !== undefined && rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className={emptyCellClass}>
              {empty}
            </td>
          </tr>
        )}
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick === undefined ? undefined : () => onRowClick(row)}
            className={typeof rowClass === 'function' ? rowClass(row) : (rowClass ?? '')}
          >
            {columns.map((column) => (
              <td key={column.key} className={`${cellClass} ${column.cellClass ?? ''}`}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
