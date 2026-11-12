package com.sakurasoul.apartment.usage;

import java.math.BigDecimal;

/**
 * หนึ่งจุดของกราฟการใช้น้ำไฟ (SSK-167) ตรงกับ UsagePoint ใน frontend/src/api/types.ts บวกช่อง hasData
 *
 * @param period  "YYYY-MM" (รายเดือน) หรือ "YYYY" (รายปี)
 * @param scopeId id ห้อง เลขชั้น หรือ "building"
 * @param units   kWh หรือ m³ เดือนหรือปีที่ไม่มีข้อมูลเป็น 0 เสมอ กราฟจะได้ไม่เว้นช่อง
 * @param hasData มีค่ามิเตอร์หรือใบเสร็จของช่วงนี้อย่างน้อยหนึ่งห้องไหม ทีมตกลงเพิ่ม (คอมเมนต์ใน SSK-167)
 *                ให้กราฟแยก "ใช้ศูนย์หน่วยจริง" ออกจาก "ไม่มีข้อมูล" ได้ ซึ่ง units อย่างเดียวบอกไม่ได้
 */
public record UsagePoint(String period, String scopeId, BigDecimal units, boolean hasData) {
}
