package com.sakurasoul.apartment.usage;

/**
 * กฎเลือกแหล่งข้อมูลต่อห้องต่อเดือนของกราฟการใช้น้ำไฟ เขียนเป็น CTE ที่เดียว ให้กราฟห้อง ชั้น ตึก (SSK-167)
 * กับภาพรวมทั้งตึก (SSK-181) นับเหมือนกันทุกตัว
 * <ul>
 *   <li>ค่ามิเตอร์ที่นำเข้า (SSK-166) ชนะเสมอ เดือนไหนห้องนั้นไม่มีค่ามิเตอร์ค่อยใช้หน่วยในใบเสร็จ ไม่นับซ้ำถ้ามีทั้งสองแหล่ง
 *       (กฎเดียวกับ mergeUsageSources ของหน้าเว็บ)</li>
 *   <li>ใบเสร็จหลายใบของห้องเดียวในเดือนเดียว (สัญญาเก่าจบกลางเดือนแล้วสัญญาใหม่เริ่ม) รวมกัน ห้องหาจากสัญญาของใบเสร็จ</li>
 *   <li>เงินมาจากใบเสร็จเท่านั้น (ค่ามิเตอร์ไม่มีเงิน) จึงเป็น null ในห้องเดือนที่ยังไม่มีใบ ไม่ประมาณจากอัตรา
 *       (ตัดสิน 11 พ.ย.)</li>
 * </ul>
 * ห้องที่อยู่ใน scope ถูกเลือกก่อน (scope_room) แล้วค่อยอ่านสองแหล่งเฉพาะห้องเหล่านั้น ถ้ากรองห้องทีหลังสุด
 * กราฟห้องเดียวจะต้องอ่านค่ามิเตอร์ของทั้งตึกในช่วงนั้นก่อน
 * <p>
 * พารามิเตอร์ :from :to (วันที่ 1 ของเดือน) :roomId :floor (ว่างได้ ต้องบอกชนิดตอนส่ง null ไม่งั้น PostgreSQL เดาชนิดไม่ได้)
 * ผู้ใช้ต่อท้ายด้วย SELECT จาก room_month ซึ่งมีหนึ่งแถวต่อห้องต่อเดือนที่มีข้อมูล
 */
final class UsageSources {

    static final String ROOM_MONTH = """
            scope_room AS (
                SELECT rm.id
                FROM room rm
                WHERE (CAST(:roomId AS BIGINT) IS NULL OR rm.id = :roomId)
                  AND (CAST(:floor AS SMALLINT) IS NULL OR rm.floor = :floor)
            ),
            readings AS (
                SELECT m.room_id, m.reading_month AS month, m.electric_units, m.water_units
                FROM meter_reading m
                JOIN scope_room s ON s.id = m.room_id
                WHERE m.reading_month BETWEEN :from AND :to
            ),
            billed AS (
                SELECT l.room_id, r.billing_month AS month,
                       SUM(r.electric_units) AS electric_units, SUM(r.water_units) AS water_units,
                       SUM(r.electric_amount) AS electric_amount, SUM(r.water_amount) AS water_amount
                FROM receipt r
                JOIN lease l ON l.id = r.lease_id
                JOIN scope_room s ON s.id = l.room_id
                WHERE r.billing_month BETWEEN :from AND :to
                GROUP BY l.room_id, r.billing_month
            ),
            room_month AS (
                SELECT COALESCE(rd.month, b.month) AS month,
                       CASE WHEN rd.room_id IS NOT NULL THEN rd.electric_units ELSE b.electric_units END AS electric_units,
                       CASE WHEN rd.room_id IS NOT NULL THEN rd.water_units ELSE b.water_units END AS water_units,
                       b.electric_amount, b.water_amount, b.room_id AS billed_room
                FROM readings rd
                FULL JOIN billed b ON b.room_id = rd.room_id AND b.month = rd.month
            )""";

    private UsageSources() {
    }
}
