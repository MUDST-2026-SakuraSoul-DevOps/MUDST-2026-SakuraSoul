package com.sakurasoul.apartment.usage;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Types;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * อ่านยอดหน่วยรายเดือนของห้อง ชั้น หรือทั้งตึก (SSK-167) ด้วย SQL คำสั่งเดียว รวมด้วย GROUP BY ในฐานข้อมูล
 * <p>
 * แหล่งข้อมูลต่อห้องต่อเดือน: ค่ามิเตอร์ที่นำเข้า (SSK-166) ชนะเสมอ เดือนไหนห้องนั้นไม่มีค่ามิเตอร์ค่อยใช้หน่วยในใบเสร็จ
 * (กฎเดียวกับ mergeUsageSources ของหน้าเว็บ) ใบเสร็จหลายใบของห้องเดียวในเดือนเดียว (สัญญาเก่าจบกลางเดือนแล้วสัญญาใหม่เริ่ม)
 * รวมกัน ห้องหาจากสัญญาของใบเสร็จ ส่วนชั้นอ่านจากตาราง room ตามผังปัจจุบัน
 * <p>
 * เป็น SQL ตรงเพราะ JPQL ทำ UNION ของสองตารางแล้วรวมต่อไม่สวย ตัวกรองห้องกับชั้นเป็นพารามิเตอร์ที่ว่างได้
 * ไม่ต่อข้อความ SQL ตาม scope ต้องบอกชนิดของพารามิเตอร์ที่เป็น null ไม่งั้น PostgreSQL เดาชนิดไม่ได้
 * <p>
 * ห้องที่อยู่ใน scope ถูกเลือกก่อน (scope_room) แล้วค่อยอ่านสองแหล่งเฉพาะห้องเหล่านั้น เพราะ readings ถูกอ้างสองครั้ง
 * PostgreSQL จึงคำนวณมันเก็บไว้ทั้งก้อน ถ้ากรองห้องทีหลังสุด กราฟห้องเดียวจะต้องอ่านค่ามิเตอร์ของทั้งตึกในช่วงนั้นก่อน
 */
@Repository
class UsageReader {

    private static final String MONTHLY_TOTALS = """
            WITH scope_room AS (
                SELECT rm.id
                FROM room rm
                WHERE (CAST(:roomId AS BIGINT) IS NULL OR rm.id = :roomId)
                  AND (CAST(:floor AS SMALLINT) IS NULL OR rm.floor = :floor)
            ),
            readings AS (
                SELECT m.room_id, m.reading_month AS month,
                       CASE WHEN :metric = 'electric' THEN m.electric_units ELSE m.water_units END AS units
                FROM meter_reading m
                JOIN scope_room s ON s.id = m.room_id
                WHERE m.reading_month BETWEEN :from AND :to
            ),
            billed AS (
                SELECT l.room_id, r.billing_month AS month,
                       SUM(CASE WHEN :metric = 'electric' THEN r.electric_units ELSE r.water_units END) AS units
                FROM receipt r
                JOIN lease l ON l.id = r.lease_id
                JOIN scope_room s ON s.id = l.room_id
                WHERE r.billing_month BETWEEN :from AND :to
                GROUP BY l.room_id, r.billing_month
            ),
            room_month AS (
                SELECT month, units FROM readings
                UNION ALL
                SELECT b.month, b.units FROM billed b
                WHERE NOT EXISTS (SELECT 1 FROM readings x WHERE x.room_id = b.room_id AND x.month = b.month)
            )
            SELECT month, SUM(units) AS units
            FROM room_month
            GROUP BY month
            """;

    private final JdbcClient jdbc;

    UsageReader(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** ยอดของแต่ละเดือนที่มีข้อมูลในช่วง เดือนที่ไม่มีข้อมูลเลยไม่อยู่ในผล (UsageSeries เติมให้เป็น 0) */
    Map<YearMonth, BigDecimal> monthlyTotals(UsageQuery query) {
        return jdbc.sql(MONTHLY_TOTALS)
                .param("metric", query.metric().param())
                .param("from", query.from().atDay(1))
                .param("to", query.to().atDay(1))
                .param("roomId", query.roomId(), Types.BIGINT)
                .param("floor", query.floor(), Types.SMALLINT)
                .query((row, number) -> Map.entry(
                        YearMonth.from(row.getObject("month", LocalDate.class)), row.getBigDecimal("units")))
                .list()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }
}
