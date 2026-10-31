import { useSearchParams } from 'react-router-dom'

export interface SectionView<V extends string> {
  value: V
  label: string
  /** ป้ายสั้นตอนจอแคบ ไม่ส่งมาใช้ป้ายเต็ม */
  compactLabel?: string
}

/**
 * อ่านมุมมองย่อยของหน้าจาก ?view= ค่าที่ไม่รู้จักหรือไม่ส่งมาใช้มุมมองแรก
 * เก็บใน URL ตามดีไซน์ SSK-177 จะได้แชร์ลิงก์ตรงไปที่แท็บได้ และปุ่มย้อนกลับของเบราว์เซอร์ใช้ได้
 * แยกไฟล์จาก SectionTabs เพราะไฟล์ component ที่ export ฟังก์ชันอื่นด้วยทำให้ fast refresh ไม่ทำงาน
 */
export function useSectionView<V extends string>(views: SectionView<V>[]): V {
  const [params] = useSearchParams()
  const requested = params.get('view')
  return views.find((view) => view.value === requested)?.value ?? views[0].value
}
