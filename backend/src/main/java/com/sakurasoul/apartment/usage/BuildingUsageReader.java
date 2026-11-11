package com.sakurasoul.apartment.usage;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Types;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * อ่านยอดทั้งตึกรายเดือนด้วย SQL คำสั่งเดียว (SSK-181) ได้หนึ่งแถวต่อเดือนเสมอ รวมเดือนที่ไม่มีข้อมูล
 * <p>
 * กฎเลือกแหล่งข้อมูลต่อห้องต่อเดือนมาจาก UsageSources ชุดเดียวกับกราฟของ SSK-167 ส่วนที่เพิ่มคือ
 * <ul>
 *   <li>months: ทุกเดือนในช่วงจาก generate_series แปลงเป็น timestamp ไม่ใช่ timestamptz
 *       เขตเวลาของ session จึงเลื่อนเดือนไม่ได้</li>
 *   <li>occupied: ห้องที่มีสัญญา (ทุกสถานะ) คาบเกี่ยวเดือนนั้น กฎเดียวกับที่ออกใบเสร็จได้ (ReceiptService)
 *       สองสัญญาในห้องเดียวกันนับเป็นห้องเดียว ไม่ fix ว่าตึกมี 24 ห้อง</li>
 *   <li>used: ผลรวมของห้องที่มีข้อมูล SUM ของค่าที่เป็น null ทั้งหมดได้ null ซึ่งคือกฎ "ไม่มีข้อมูลเป็น null" พอดี</li>
 * </ul>
 * ช่วงสิบปีรวมปีก่อนสำหรับเทียบได้ไม่เกิน 132 แถว
 */
@Repository
class BuildingUsageReader {

    private static final String MONTHLY = "WITH " + UsageSources.ROOM_MONTH + """
            ,
            months AS (
                SELECT CAST(g AS date) AS month
                FROM generate_series(CAST(:from AS timestamp), CAST(:to AS timestamp), INTERVAL '1 month') g
            ),
            occupied AS (
                SELECT mo.month, COUNT(DISTINCT l.room_id) AS rooms
                FROM months mo
                JOIN lease l ON l.start_date < mo.month + INTERVAL '1 month'
                            AND (l.end_date IS NULL OR l.end_date >= mo.month)
                GROUP BY mo.month
            ),
            used AS (
                SELECT month,
                       SUM(electric_units) AS electric_units, SUM(water_units) AS water_units,
                       SUM(electric_amount) AS electric_amount, SUM(water_amount) AS water_amount,
                       COUNT(*) AS rooms_with_data, COUNT(billed_room) AS rooms_with_amount
                FROM room_month
                GROUP BY month
            )
            SELECT mo.month, COALESCE(o.rooms, 0) AS occupied_rooms,
                   u.electric_units, u.water_units, u.electric_amount, u.water_amount,
                   COALESCE(u.rooms_with_data, 0) AS rooms_with_data,
                   COALESCE(u.rooms_with_amount, 0) AS rooms_with_amount
            FROM months mo
            LEFT JOIN occupied o ON o.month = mo.month
            LEFT JOIN used u ON u.month = mo.month
            ORDER BY mo.month
            """;

    private final JdbcClient jdbc;

    BuildingUsageReader(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<BuildingMonth> monthly(YearMonth from, YearMonth to) {
        return jdbc.sql(MONTHLY)
                .param("from", from.atDay(1))
                .param("to", to.atDay(1))
                .param("roomId", null, Types.BIGINT)
                .param("floor", null, Types.SMALLINT)
                .query((row, number) -> new BuildingMonth(
                        YearMonth.from(row.getObject("month", LocalDate.class)),
                        row.getInt("occupied_rooms"),
                        row.getBigDecimal("electric_units"),
                        row.getBigDecimal("water_units"),
                        row.getBigDecimal("electric_amount"),
                        row.getBigDecimal("water_amount"),
                        row.getInt("rooms_with_data"),
                        row.getInt("rooms_with_amount")))
                .list();
    }
}
