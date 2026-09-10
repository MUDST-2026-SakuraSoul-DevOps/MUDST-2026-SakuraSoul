import type { ApartmentConfigRequest } from '../api/types'

/**
 * ตรวจอัตราค่าสาธารณูปโภคก่อนบันทึก ตาม US-16-S2
 *
 * แยกเป็น pure function เพราะใช้สองที่เหมือนกฎสัญญาเช่า คือฝั่งฟอร์มใช้เตือน
 * ทันทีที่กดบันทึก และ backend จำลองใช้ตัดสินว่าจะตอบ 400 ไหม ให้พฤติกรรม
 * เหมือน backend จริง
 *
 * ที่ต้องเช็คเป็นตัวเลขติดลบกับค่าที่ไม่ใช่ตัวเลข ไม่ใช่แค่ช่องว่าง เพราะช่อง
 * input type="number" ปล่อยให้พิมพ์เครื่องหมายลบได้ และคืน NaN เมื่อกรอกไม่ครบ
 * ถ้าไม่ดักไว้ อัตราติดลบจะไหลไปถึงการคำนวณใบเสร็จแล้วออกใบเสร็จติดลบ
 */

/** ชื่อช่องที่เอาไปโชว์ในข้อความเตือน ให้ผู้ใช้รู้ว่าต้องกลับไปแก้ช่องไหน */
const FIELD_LABEL: Record<keyof ApartmentConfigRequest, string> = {
  electricRatePerUnit: 'ค่าไฟต่อหน่วย',
  waterRatePerUnit: 'ค่าน้ำต่อหน่วย',
  commonAreaFee: 'ค่าส่วนกลาง',
  internetFee: 'ค่าอินเทอร์เน็ต',
}

/**
 * ขอบบนของแต่ละช่อง มาจากที่ QA ทักว่าเดิมกรอกค่าไฟหน่วยละ 9999999 ก็ผ่าน
 * พิมพ์ผิดทีเดียวใบเสร็จพุ่งเป็นล้านโดยไม่มีอะไรทัก
 *
 * ตัวเลขพวกนี้ตั้งไว้เป็นกันพิมพ์ผิด ไม่ใช่กฎธุรกิจ จึงเผื่อไว้เยอะมาก
 * ค่าไฟจริงในไทยอยู่ราวหน่วยละ 4 ถึง 8 บาท ค่าน้ำราว 20 ถึง 30 บาท เพดาน
 * 1,000 จึงเผื่อไว้เกินร้อยเท่า ส่วนค่าส่วนกลางกับค่าเน็ตคิดเป็นรายเดือน
 * ซึ่งค่าเช่าห้องที่นี่อยู่ราว 3,500 ถึง 3,800 เพดาน 100,000 ต่อเดือนจึงเกิน
 * ความเป็นจริงไปมากอยู่แล้ว
 *
 * ถ้าทีมมีตัวเลขจริงที่อยากใช้ แก้ที่นี่ที่เดียวได้เลย
 */
const FIELD_MAX: Record<keyof ApartmentConfigRequest, number> = {
  electricRatePerUnit: 1_000,
  waterRatePerUnit: 1_000,
  commonAreaFee: 100_000,
  internetFee: 100_000,
}

/** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อกรอกถูกทุกช่อง */
export function validateApartmentConfig(config: ApartmentConfigRequest): string | null {
  for (const key of Object.keys(FIELD_LABEL) as (keyof ApartmentConfigRequest)[]) {
    const value = config[key]
    if (!Number.isFinite(value)) {
      return `${FIELD_LABEL[key]} ต้องเป็นตัวเลข`
    }
    if (value < 0) {
      return `${FIELD_LABEL[key]} ต้องไม่ติดลบ`
    }
    if (value > FIELD_MAX[key]) {
      return `${FIELD_LABEL[key]} สูงเกินไป กรอกได้ไม่เกิน ${FIELD_MAX[key].toLocaleString('th-TH')} บาท`
    }
  }
  return null
}
